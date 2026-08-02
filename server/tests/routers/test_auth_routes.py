"""Behaviour of the two public routes: `POST /auth/login` and `POST /app/activate`.

Both hand out a token and both are reachable without one, so what these tests pin is
as much what the responses *do not* say as what they do: a rejected login and a
rejected code must be indistinguishable from one another's neighbours, and a
successful login must never carry the password digest back to the client.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from app.core.security import APP_TOKEN_TYPE, decode_token
from app.models.congregation import Congregation
from app.repositories.user import UserRepository
from sqlalchemy.orm import Session

pytestmark = pytest.mark.anyio

LIVE_CODE = "ABCD2345"
OTHER_CODE = "WXYZ6789"
UNKNOWN_CODE = "MNPQ3456"


def make_publisher(
    session: Session,
    congregation: Congregation,
    *,
    name: str = "Irmão João",
    code: str | None = LIVE_CODE,
    expires_in: timedelta = timedelta(hours=24),
    is_active: bool = True,
):
    """A publisher holding an access code, straight through the repository.

    Built here rather than through `POST /admin/users` so that a failure of the
    admin route cannot make these tests fail for the wrong reason.
    """
    user = UserRepository(session).create(
        congregation_id=congregation.id,
        name=name,
        access_code=code,
        access_code_expires_at=datetime.now(UTC) + expires_in if code else None,
    )
    user.is_active = is_active
    session.flush()
    return user


def contains_key(payload: Any, key: str) -> bool:
    """Whether `key` appears anywhere in a decoded JSON document."""
    if isinstance(payload, dict):
        return key in payload or any(contains_key(value, key) for value in payload.values())
    if isinstance(payload, list):
        return any(contains_key(item, key) for item in payload)
    return False


async def test_login_returns_an_admin_token_and_the_congregation(client, make_admin):
    congregation, _ = make_admin(name="Central", city="Uberlândia", password="senha-boa")

    response = await client.post(
        "/auth/login",
        json={"name": "Central", "city": "Uberlândia", "password": "senha-boa"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["congregation"] == {
        "id": str(congregation.id),
        "name": "Central",
        "city": "Uberlândia",
    }
    assert decode_token(body["access_token"])["congregation_id"] == str(congregation.id)


async def test_login_never_returns_the_password_hash(client, make_admin):
    """The digest is not merely undeclared in the DTO -- it is absent from the wire."""
    congregation, _ = make_admin(password="senha-boa")

    response = await client.post(
        "/auth/login",
        json={"name": congregation.name, "city": congregation.city, "password": "senha-boa"},
    )

    assert response.status_code == 200
    assert not contains_key(response.json(), "password_hash")
    assert congregation.password_hash not in response.text
    assert "senha-boa" not in response.text


@pytest.mark.parametrize(
    "credentials",
    [
        pytest.param({"name": "Central", "city": "Uberlândia", "password": "outra"}, id="password"),
        pytest.param({"name": "Outra", "city": "Uberlândia", "password": "senha-boa"}, id="name"),
        pytest.param({"name": "Central", "city": "Contagem", "password": "senha-boa"}, id="city"),
    ],
)
async def test_a_wrong_credential_is_401_and_says_nothing_about_which_one(
    client, make_admin, credentials
):
    make_admin(name="Central", city="Uberlândia", password="senha-boa")

    response = await client.post("/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == {
        "code": "invalid_credentials",
        "detail": "Não foi possível entrar. Confira o nome da congregação, a cidade e a senha.",
    }


async def test_the_three_ways_to_fail_a_login_answer_byte_for_byte_the_same(client, make_admin):
    make_admin(name="Central", city="Uberlândia", password="senha-boa")
    wrong_credentials = [
        {"name": "Central", "city": "Uberlândia", "password": "errada"},
        {"name": "Fantasma", "city": "Uberlândia", "password": "senha-boa"},
        {"name": "Central", "city": "Contagem", "password": "senha-boa"},
    ]

    answers = [await client.post("/auth/login", json=body) for body in wrong_credentials]

    assert {response.status_code for response in answers} == {401}
    assert len({response.text for response in answers}) == 1


async def test_a_malformed_login_body_is_rejected_before_any_credential_check(client):
    response = await client.post("/auth/login", json={"name": "Central", "city": "Uberlândia"})

    assert response.status_code == 422


async def test_activate_exchanges_the_code_for_a_permanent_app_token(client, make_admin, session):
    congregation, _ = make_admin(name="Central", city="Uberlândia")
    user = make_publisher(session, congregation, name="Irmão João")

    response = await client.post("/app/activate", json={"access_code": LIVE_CODE})

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"id": str(user.id), "name": "Irmão João"}
    assert body["congregation"] == {
        "id": str(congregation.id),
        "name": "Central",
        "city": "Uberlândia",
    }
    payload = decode_token(body["token"])
    assert payload["type"] == APP_TOKEN_TYPE
    assert payload["user_id"] == str(user.id)
    assert payload["congregation_id"] == str(congregation.id)
    assert "exp" not in payload
    # The credential is spent: it is gone from the row, not merely marked used.
    assert user.access_code is None
    assert user.activated_at is not None


async def test_the_code_is_lowercase_tolerant(client, make_admin, session):
    """The phone's keyboard case must not cost the publisher an attempt."""
    congregation, _ = make_admin()
    make_publisher(session, congregation)

    response = await client.post("/app/activate", json={"access_code": LIVE_CODE.lower()})

    assert response.status_code == 200


async def test_the_same_code_cannot_be_redeemed_twice(client, make_admin, session):
    congregation, _ = make_admin()
    make_publisher(session, congregation)

    first = await client.post("/app/activate", json={"access_code": LIVE_CODE})
    second = await client.post("/app/activate", json={"access_code": LIVE_CODE})

    assert first.status_code == 200
    assert second.status_code == 401
    assert second.json()["code"] == "invalid_access_code"


async def test_unknown_expired_and_already_spent_codes_answer_identically(
    client, make_admin, session
):
    """Telling them apart would confirm to whoever is guessing that a code exists."""
    congregation, _ = make_admin()
    make_publisher(session, congregation, code=LIVE_CODE)
    make_publisher(
        session,
        congregation,
        name="Irmã Maria",
        code=OTHER_CODE,
        expires_in=timedelta(hours=-1),
    )
    await client.post("/app/activate", json={"access_code": LIVE_CODE})  # spend the first one

    answers = [
        await client.post("/app/activate", json={"access_code": UNKNOWN_CODE}),
        await client.post("/app/activate", json={"access_code": OTHER_CODE}),
        await client.post("/app/activate", json={"access_code": LIVE_CODE}),
    ]

    assert {response.status_code for response in answers} == {401}
    assert len({response.text for response in answers}) == 1
    assert answers[0].json()["code"] == "invalid_access_code"


async def test_a_revoked_publisher_is_told_so_instead_of_getting_a_token(
    client, make_admin, session
):
    """Different error on purpose: the code was valid, so nothing is given away."""
    congregation, _ = make_admin()
    make_publisher(session, congregation, is_active=False)

    response = await client.post("/app/activate", json={"access_code": LIVE_CODE})

    assert response.status_code == 401
    assert response.json()["code"] == "inactive_user"


async def test_a_code_of_the_wrong_length_never_reaches_the_service(client):
    response = await client.post("/app/activate", json={"access_code": "ABC"})

    assert response.status_code == 422
