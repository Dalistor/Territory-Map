"""Behaviour of the security primitives: password hashing, access codes and tokens."""

import ast
import inspect
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.core import security
from app.core.security import (
    TokenError,
    create_admin_token,
    create_app_token,
    decode_token,
    generate_access_code,
    hash_password,
    verify_password,
)
from jose import jwt


def _imported_modules() -> set[str]:
    """Top-level module names imported by `app.core.security`."""
    tree = ast.parse(inspect.getsource(security))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names


def _called_names() -> set[str]:
    """Dotted names that `app.core.security` actually calls, e.g. `secrets.choice`.

    Reads the AST rather than the raw text so that prose in a docstring or comment
    is never mistaken for a real call.
    """
    tree = ast.parse(inspect.getsource(security))
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


def _characters_seen(samples: int = 200) -> set[str]:
    """Every distinct character produced across `samples` generated codes."""
    return {char for _ in range(samples) for char in generate_access_code()}


def test_verify_password_accepts_the_correct_password():
    hashed = hash_password("senha-correta")

    assert verify_password("senha-correta", hashed) is True


def test_verify_password_rejects_the_wrong_password():
    hashed = hash_password("senha-correta")

    assert verify_password("senha-errada", hashed) is False


def test_hashing_the_same_password_twice_gives_different_hashes_that_both_verify():
    first = hash_password("mesma-senha")
    second = hash_password("mesma-senha")

    assert first != second, "cada hash precisa de um salt próprio"
    assert verify_password("mesma-senha", first) is True
    assert verify_password("mesma-senha", second) is True


def test_generate_access_code_returns_eight_characters_by_default():
    assert len(generate_access_code()) == 8


def test_generate_access_code_uses_only_the_unambiguous_alphabet():
    allowed = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

    used = _characters_seen()

    assert used <= allowed, f"caracteres fora do alfabeto: {sorted(used - allowed)}"


def test_generate_access_code_never_emits_characters_that_can_be_misread():
    ambiguous = set("0O1IL")

    used = _characters_seen()

    assert used.isdisjoint(ambiguous), f"caracteres ambíguos: {sorted(used & ambiguous)}"


def test_generate_access_code_honours_a_custom_length():
    assert len(generate_access_code(length=12)) == 12


def test_a_thousand_access_codes_are_practically_all_distinct():
    codes = {generate_access_code() for _ in range(1000)}

    assert len(codes) >= 999


def test_generate_access_code_draws_from_the_secrets_module(monkeypatch):
    """The code is a credential: it must come from a CSPRNG, not from `random`."""
    calls = []
    real_choice = secrets.choice

    def spy(sequence):
        calls.append(sequence)
        return real_choice(sequence)

    monkeypatch.setattr(secrets, "choice", spy)

    generate_access_code()

    assert len(calls) == 8


def test_the_security_module_does_not_use_the_random_module():
    assert "random" not in _imported_modules()
    assert not {name for name in _called_names() if name.startswith("random.")}


def test_admin_token_carries_the_congregation_and_is_typed_as_admin():
    congregation_id = uuid4()

    payload = decode_token(create_admin_token(congregation_id, now=datetime.now(UTC)))

    assert payload["congregation_id"] == str(congregation_id)
    assert payload["type"] == "admin"


def test_admin_token_expires_twelve_hours_after_the_injected_now():
    now = datetime.now(UTC)

    payload = decode_token(create_admin_token(uuid4(), now=now))

    assert payload["exp"] == int((now + timedelta(hours=12)).timestamp())


def test_an_expired_admin_token_is_rejected():
    issued_at = datetime.now(UTC) - timedelta(hours=13)
    expired = create_admin_token(uuid4(), now=issued_at)

    with pytest.raises(TokenError):
        decode_token(expired)


def test_app_token_carries_the_user_the_congregation_and_the_token_version():
    user_id = uuid4()
    congregation_id = uuid4()

    payload = decode_token(create_app_token(user_id, congregation_id, token_version=3))

    assert payload["user_id"] == str(user_id)
    assert payload["congregation_id"] == str(congregation_id)
    assert payload["token_version"] == 3
    assert payload["type"] == "app"


def test_app_token_never_expires():
    payload = decode_token(create_app_token(uuid4(), uuid4(), token_version=0))

    assert "exp" not in payload


def test_a_token_signed_with_another_key_is_rejected():
    forged = jwt.encode(
        {"congregation_id": str(uuid4()), "type": "admin"},
        "uma-chave-que-nao-e-a-nossa",
        algorithm="HS256",
    )

    with pytest.raises(TokenError):
        decode_token(forged)


@pytest.mark.parametrize(
    "garbage",
    ["", "nao-sou-um-token", "a.b.c", "Bearer abc.def.ghi"],
    ids=["vazio", "texto-solto", "tres-partes-invalidas", "cabecalho-inteiro"],
)
def test_an_arbitrary_string_is_rejected(garbage):
    with pytest.raises(TokenError):
        decode_token(garbage)


def test_the_security_module_never_reads_the_clock_itself():
    """Time always arrives as a parameter, so expiry is testable without freezing it."""
    forbidden = {"datetime.now", "datetime.utcnow", "time.time", "time.monotonic"}

    assert not (_called_names() & forbidden)
