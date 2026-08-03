"""Behaviour of the admin login: name, city and password validated as one."""

import ast
import inspect
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.core.exceptions import InvalidCredentialsError
from app.core.security import decode_token, hash_password, verify_password
from app.models.congregation import Congregation
from app.services import auth as auth_module
from app.services.auth import AuthService

#: The injected clock. Anchored to the real one rather than to a literal date,
#: because these tests decode the minted token with the real `decode_token`, which
#: validates `exp` against wall time. A fixed date makes the suite pass for exactly
#: twelve hours and then fail forever -- which is what happened on 2026-08-03.
#: No assertion depends on the absolute value; `exp` is only ever checked relative
#: to this. Truncated to the second so the timestamp comparison stays exact.
NOW = datetime.now(UTC).replace(microsecond=0)


class FakeCongregationRepository:
    """In-memory stand-in for `CongregationRepository`, same lookups, no database.

    A fake rather than a `MagicMock`: it answers `None` for what it does not hold,
    exactly like the real repository, so a test cannot pass against behaviour the
    real class would never show.
    """

    def __init__(self, congregations: list[Congregation] | None = None) -> None:
        self.congregations = list(congregations or [])

    def get(self, congregation_id):
        return next((c for c in self.congregations if c.id == congregation_id), None)

    def get_by_name_and_city(self, name: str, city: str) -> Congregation | None:
        return next(
            (c for c in self.congregations if c.name == name and c.city == city),
            None,
        )


def make_congregation(
    name: str = "Central",
    city: str = "Campinas",
    password: str = "senha-correta",
) -> Congregation:
    return Congregation(
        id=uuid4(),
        name=name,
        city=city,
        password_hash=hash_password(password),
    )


def make_service(*congregations: Congregation) -> AuthService:
    return AuthService(FakeCongregationRepository(list(congregations)), now_provider=lambda: NOW)


def test_correct_name_city_and_password_return_that_congregation():
    congregation = make_congregation()
    service = make_service(congregation)

    found, _token = service.login("Central", "Campinas", "senha-correta", now=NOW)

    assert found is congregation


def test_a_successful_login_returns_a_decodable_admin_token_for_that_congregation():
    congregation = make_congregation()
    service = make_service(congregation)

    _found, token = service.login("Central", "Campinas", "senha-correta", now=NOW)

    payload = decode_token(token)
    assert payload["congregation_id"] == str(congregation.id)
    assert payload["type"] == "admin"


def test_an_unknown_congregation_name_is_rejected():
    service = make_service(make_congregation())

    with pytest.raises(InvalidCredentialsError):
        service.login("Outra", "Campinas", "senha-correta", now=NOW)


def test_the_right_name_in_the_wrong_city_is_rejected():
    service = make_service(make_congregation())

    with pytest.raises(InvalidCredentialsError):
        service.login("Central", "Sorocaba", "senha-correta", now=NOW)


def test_the_wrong_password_is_rejected():
    service = make_service(make_congregation())

    with pytest.raises(InvalidCredentialsError):
        service.login("Central", "Campinas", "senha-errada", now=NOW)


def test_wrong_name_wrong_city_and_wrong_password_fail_with_the_very_same_message():
    """Telling the three apart would say whether a congregation exists. They must not."""
    service = make_service(make_congregation())

    messages = []
    for name, city, password in [
        ("Outra", "Campinas", "senha-correta"),
        ("Central", "Sorocaba", "senha-correta"),
        ("Central", "Campinas", "senha-errada"),
    ]:
        with pytest.raises(InvalidCredentialsError) as raised:
            service.login(name, city, password, now=NOW)
        messages.append(str(raised.value))

    assert len(set(messages)) == 1, f"mensagens diferentes entre si: {messages}"
    assert messages[0] == InvalidCredentialsError.default_message


def test_the_password_of_a_namesake_in_another_city_does_not_authenticate():
    campinas = make_congregation(city="Campinas", password="senha-de-campinas")
    sorocaba = make_congregation(city="Sorocaba", password="senha-de-sorocaba")
    service = make_service(campinas, sorocaba)

    with pytest.raises(InvalidCredentialsError):
        service.login("Central", "Sorocaba", "senha-de-campinas", now=NOW)


def test_namesake_congregations_each_authenticate_with_their_own_password():
    campinas = make_congregation(city="Campinas", password="senha-de-campinas")
    sorocaba = make_congregation(city="Sorocaba", password="senha-de-sorocaba")
    service = make_service(campinas, sorocaba)

    found, token = service.login("Central", "Sorocaba", "senha-de-sorocaba", now=NOW)

    assert found is sorocaba
    assert decode_token(token)["congregation_id"] == str(sorocaba.id)


class CountingVerifier:
    """Stands in for `verify_password`, recording every `(raw, hash)` it was given."""

    def __init__(self, result: bool = False) -> None:
        self.calls: list[tuple[str, str]] = []
        self._result = result

    def __call__(self, raw: str, hashed: str) -> bool:
        self.calls.append((raw, hashed))
        return self._result


def test_the_password_is_verified_even_when_the_congregation_does_not_exist():
    """Skipping the hash for an unknown congregation would make the reply faster,
    and a faster reply tells an attacker the congregation is real."""
    verifier = CountingVerifier()
    service = AuthService(
        FakeCongregationRepository(),
        now_provider=lambda: NOW,
        verify_password=verifier,
    )

    with pytest.raises(InvalidCredentialsError):
        service.login("Inexistente", "Nenhures", "qualquer-senha", now=NOW)

    assert len(verifier.calls) == 1


def test_the_absent_congregation_is_compared_against_a_real_bcrypt_digest():
    """A cheap placeholder would defeat the point: the comparison has to cost the same."""
    verifier = CountingVerifier()
    service = AuthService(
        FakeCongregationRepository(),
        now_provider=lambda: NOW,
        verify_password=verifier,
    )

    with pytest.raises(InvalidCredentialsError):
        service.login("Inexistente", "Nenhures", "qualquer-senha", now=NOW)

    _raw, throwaway_hash = verifier.calls[0]
    assert throwaway_hash.startswith("$2"), f"não é um digest bcrypt: {throwaway_hash!r}"
    assert verify_password("qualquer-senha", throwaway_hash) is False


def test_the_token_expires_twelve_hours_after_the_now_that_was_passed_in():
    service = make_service(make_congregation())

    _found, token = service.login("Central", "Campinas", "senha-correta", now=NOW)

    assert decode_token(token)["exp"] == int((NOW + timedelta(hours=12)).timestamp())


def test_login_falls_back_to_the_injected_clock_when_no_now_is_given():
    """The service never reads `datetime.now()`; the clock is always someone else's."""
    service = make_service(make_congregation())

    _found, token = service.login("Central", "Campinas", "senha-correta")

    assert decode_token(token)["exp"] == int((NOW + timedelta(hours=12)).timestamp())


def _imported_modules() -> set[str]:
    """Top-level module names imported by `app.services.auth`."""
    tree = ast.parse(inspect.getsource(auth_module))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names


def _called_names() -> set[str]:
    """Dotted names that `app.services.auth` actually calls, e.g. `datetime.now`.

    Read from the AST, so prose in a docstring is never mistaken for a real call.
    """
    tree = ast.parse(inspect.getsource(auth_module))
    called: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        parts: list[str] = []
        while isinstance(target, ast.Attribute):
            parts.append(target.attr)
            target = target.value
        if isinstance(target, ast.Name):
            parts.append(target.id)
            called.add(".".join(reversed(parts)))
    return called


def test_the_service_does_not_import_fastapi():
    """The service layer signals failure with domain errors; only the router knows HTTP."""
    assert _imported_modules().isdisjoint({"fastapi", "starlette"})


def test_the_service_never_builds_an_http_exception():
    assert "HTTPException" not in _called_names()


def _clock_reads() -> set[str]:
    """Calls that read a wall clock, whatever the receiver is named.

    Matching on the attribute rather than on `datetime.now` keeps an aliased import
    (`from datetime import datetime as _dt`) from slipping past the check.
    """
    tree = ast.parse(inspect.getsource(auth_module))
    clock_attributes = {"now", "utcnow", "today", "time", "monotonic"}
    return {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in clock_attributes
    }


def test_the_service_never_reads_the_clock_itself():
    """Time arrives as an argument or from the injected provider, never from the module."""
    assert not _clock_reads()
