"""Behaviour of the FastAPI authentication dependencies.

The two tokens have very different powers, so these tests mount a throwaway app
with one route behind each dependency and drive it over HTTP: what matters is the
status code and the body the client actually receives, not the internals of the
dependency.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID, uuid4

import pytest
from app.core.config import get_settings
from app.core.db import get_session
from app.core.deps import UNAUTHORIZED_DETAIL, current_app_user, current_congregation
from app.core.security import create_admin_token, create_app_token
from app.models.congregation import Congregation
from app.models.user import User
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

#: Tokens are minted against an injected clock, but `jose` validates `exp` against
#: the real one, so the fixed instant here is anchored to the present and the
#: expired cases are expressed as offsets from it.
NOW = datetime.now(UTC)


class FakeSession:
    """A stand-in for the SQLAlchemy session that records every row it is asked for.

    The dependencies must re-read `is_active` and `token_version` on every single
    request -- a token that never expires is only revocable if nothing is cached --
    so the test needs to see the reads happen. Counting them here is what makes
    that observable; the repositories under test are the real ones.
    """

    def __init__(self, *rows: Congregation | User) -> None:
        self.rows: dict[tuple[type, UUID], Any] = {(type(row), row.id): row for row in rows}
        self.reads: list[tuple[type, UUID]] = []

    def get(self, model: type, primary_key: UUID) -> Any:
        self.reads.append((model, primary_key))
        return self.rows.get((model, primary_key))


def make_congregation() -> Congregation:
    return Congregation(
        id=uuid4(),
        name="Congregação Central",
        city="Belo Horizonte",
        password_hash="irrelevant-here",
    )


def make_user(
    congregation: Congregation, *, token_version: int = 0, is_active: bool = True
) -> User:
    return User(
        id=uuid4(),
        congregation_id=congregation.id,
        name="Publicador",
        token_version=token_version,
        is_active=is_active,
    )


def build_client(session: FakeSession) -> TestClient:
    """A minimal app exposing one route behind each dependency."""
    app = FastAPI()

    @app.get("/admin/whoami")
    def admin_route(
        congregation: Annotated[Congregation, Depends(current_congregation)],
    ) -> dict[str, str]:
        return {"congregation_id": str(congregation.id), "name": congregation.name}

    @app.get("/app/whoami")
    def app_route(user: Annotated[User, Depends(current_app_user)]) -> dict[str, str]:
        return {"user_id": str(user.id), "congregation_id": str(user.congregation_id)}

    app.dependency_overrides[get_session] = lambda: session
    return TestClient(app)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def sign(payload: dict[str, Any]) -> str:
    """Sign an arbitrary payload with the server's own key.

    Lets a test build a token this application would never mint, in order to pin a
    check that a well-formed token cannot otherwise exercise.
    """
    settings = get_settings()
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def foreign_admin_token(congregation: Congregation) -> str:
    """An admin token that is well formed but signed with somebody else's key."""
    return jwt.encode(
        {
            "congregation_id": str(congregation.id),
            "type": "admin",
            "exp": NOW + timedelta(hours=12),
        },
        "a-key-this-server-never-had",
        algorithm=get_settings().JWT_ALGORITHM,
    )


def admin_typed_token_carrying_app_claims(congregation: Congregation, user: User) -> str:
    """A token with every claim the app route reads, differing only in `type`.

    A plain admin token has no `user_id`, so it would bounce off the app route even
    with no type check at all -- this one isolates the check under test.
    """
    return sign(
        {
            "type": "admin",
            "user_id": str(user.id),
            "congregation_id": str(congregation.id),
            "token_version": user.token_version,
            "exp": NOW + timedelta(hours=12),
        }
    )


def test_admin_token_resolves_the_congregation_of_the_token():
    congregation = make_congregation()
    client = build_client(FakeSession(congregation))

    response = client.get(
        "/admin/whoami",
        headers=bearer(create_admin_token(congregation.id, NOW)),
    )

    assert response.status_code == 200
    assert response.json() == {
        "congregation_id": str(congregation.id),
        "name": "Congregação Central",
    }


def test_admin_route_without_an_authorization_header_is_unauthorized():
    client = build_client(FakeSession(make_congregation()))

    response = client.get("/admin/whoami")

    assert response.status_code == 401


@pytest.mark.parametrize(
    "token_of",
    [
        pytest.param(lambda _: "definitely-not-a-jwt", id="malformed"),
        pytest.param(foreign_admin_token, id="signed-with-another-key"),
        pytest.param(
            lambda congregation: create_admin_token(congregation.id, NOW - timedelta(hours=13)),
            id="expired",
        ),
    ],
)
def test_untrustworthy_admin_token_is_unauthorized(token_of):
    congregation = make_congregation()
    client = build_client(FakeSession(congregation))

    response = client.get("/admin/whoami", headers=bearer(token_of(congregation)))

    assert response.status_code == 401


def test_app_token_is_not_accepted_on_an_admin_route():
    congregation = make_congregation()
    user = make_user(congregation)
    client = build_client(FakeSession(congregation, user))

    response = client.get(
        "/admin/whoami",
        headers=bearer(create_app_token(user.id, congregation.id, user.token_version)),
    )

    assert response.status_code == 401


def test_admin_token_of_a_congregation_no_longer_in_the_database_is_unauthorized():
    congregation = make_congregation()
    client = build_client(FakeSession())  # the row is gone; the token still exists

    response = client.get(
        "/admin/whoami",
        headers=bearer(create_admin_token(congregation.id, NOW)),
    )

    assert response.status_code == 401


def test_admin_token_without_a_usable_congregation_claim_is_unauthorized():
    """A signed token whose `congregation_id` is missing or not a UUID is refused.

    It cannot come from `create_admin_token`, so reaching this means the payload was
    built by something else -- answer with the same 401 instead of a 500.
    """
    client = build_client(FakeSession(make_congregation()))
    token = sign(
        {"type": "admin", "congregation_id": "not-a-uuid", "exp": NOW + timedelta(hours=12)}
    )

    response = client.get("/admin/whoami", headers=bearer(token))

    assert response.status_code == 401


def test_app_token_resolves_the_user_and_the_congregation_of_that_user():
    congregation = make_congregation()
    user = make_user(congregation, token_version=3)
    client = build_client(FakeSession(congregation, user))

    response = client.get(
        "/app/whoami",
        headers=bearer(create_app_token(user.id, congregation.id, 3)),
    )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": str(user.id),
        "congregation_id": str(congregation.id),
    }


def test_admin_token_is_not_accepted_on_an_app_route():
    congregation = make_congregation()
    user = make_user(congregation)
    client = build_client(FakeSession(congregation, user))
    token = admin_typed_token_carrying_app_claims(congregation, user)

    response = client.get("/app/whoami", headers=bearer(token))

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("stored_version", "token_version"),
    [
        pytest.param(2, 1, id="older-device-after-a-new-redemption"),
        pytest.param(2, 3, id="version-ahead-of-the-row"),
    ],
)
def test_app_token_whose_version_does_not_match_the_row_is_unauthorized(
    stored_version, token_version
):
    """The old phone stops working the moment a new code is redeemed."""
    congregation = make_congregation()
    user = make_user(congregation, token_version=stored_version)
    client = build_client(FakeSession(congregation, user))

    response = client.get(
        "/app/whoami",
        headers=bearer(create_app_token(user.id, congregation.id, token_version)),
    )

    assert response.status_code == 401


def test_app_token_of_a_deactivated_user_is_unauthorized():
    congregation = make_congregation()
    user = make_user(congregation, is_active=False)
    client = build_client(FakeSession(congregation, user))

    response = client.get(
        "/app/whoami",
        headers=bearer(create_app_token(user.id, congregation.id, user.token_version)),
    )

    assert response.status_code == 401


def test_every_app_request_rereads_is_active_and_token_version_from_the_database():
    """The app token never expires, so nothing about it may be cached.

    The same token is replayed three times while the row changes underneath: what
    the database says at that instant is what decides, which is the only reason
    revoking a publisher or moving them to a new phone takes effect at all.
    """
    congregation = make_congregation()
    user = make_user(congregation, token_version=1)
    session = FakeSession(congregation, user)
    client = build_client(session)
    headers = bearer(create_app_token(user.id, congregation.id, 1))

    while_active = client.get("/app/whoami", headers=headers)
    user.is_active = False
    while_revoked = client.get("/app/whoami", headers=headers)
    user.is_active = True
    user.token_version = 2  # a new code was redeemed on another device
    after_redemption = client.get("/app/whoami", headers=headers)

    assert while_active.status_code == 200
    assert while_revoked.status_code == 401
    assert after_redemption.status_code == 401
    assert session.reads == [(User, user.id)] * 3


def test_app_token_of_a_user_no_longer_in_the_database_is_unauthorized():
    congregation = make_congregation()
    user = make_user(congregation)
    client = build_client(FakeSession(congregation))  # the user row is gone

    response = client.get(
        "/app/whoami",
        headers=bearer(create_app_token(user.id, congregation.id, user.token_version)),
    )

    assert response.status_code == 401


def test_every_rejection_answers_with_the_same_generic_body():
    """One message for every one of the twelve ways a request can be refused.

    Telling the caller *which* condition failed would turn the 401 into an oracle:
    "expired" versus "wrong signature" reveals that the key is right, and "user
    inactive" confirms that the user exists. All of them answer the same thing.
    """
    congregation = make_congregation()
    active = make_user(congregation, token_version=1)
    revoked = make_user(congregation, is_active=False)
    stranger = make_congregation()  # never stored
    ghost = make_user(stranger)  # never stored
    client = build_client(FakeSession(congregation, active, revoked))
    smuggled_admin = admin_typed_token_carrying_app_claims(congregation, active)

    rejections = [
        client.get("/admin/whoami"),
        client.get("/admin/whoami", headers=bearer("definitely-not-a-jwt")),
        client.get("/admin/whoami", headers=bearer(foreign_admin_token(congregation))),
        client.get(
            "/admin/whoami",
            headers=bearer(create_admin_token(congregation.id, NOW - timedelta(hours=13))),
        ),
        client.get(
            "/admin/whoami",
            headers=bearer(create_app_token(active.id, congregation.id, 1)),
        ),
        client.get("/admin/whoami", headers=bearer(create_admin_token(stranger.id, NOW))),
        client.get("/app/whoami"),
        client.get("/app/whoami", headers=bearer("definitely-not-a-jwt")),
        client.get("/app/whoami", headers=bearer(smuggled_admin)),
        client.get("/app/whoami", headers=bearer(create_app_token(active.id, congregation.id, 0))),
        client.get(
            "/app/whoami",
            headers=bearer(create_app_token(revoked.id, congregation.id, revoked.token_version)),
        ),
        client.get("/app/whoami", headers=bearer(create_app_token(ghost.id, stranger.id, 0))),
    ]

    assert len(rejections) == 12
    assert {response.status_code for response in rejections} == {401}
    assert {json.dumps(response.json(), sort_keys=True) for response in rejections} == {
        json.dumps({"detail": UNAUTHORIZED_DETAIL}, sort_keys=True)
    }


@pytest.mark.parametrize(
    "revealing",
    ["token", "version", "assinat", "inativ", "desativ", "usuário", "congrega", "tipo"],
)
def test_the_generic_message_names_none_of_the_conditions(revealing):
    assert revealing not in UNAUTHORIZED_DETAIL.lower()
