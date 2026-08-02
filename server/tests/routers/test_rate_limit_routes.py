"""The per-IP throttle on the two routes that hand out a token.

`POST /app/activate` is the one place where a short credential can be guessed by
trying, and `POST /auth/login` is the one place where a password can. Neither is
protected by anything else: the code is 8 characters and the admin chose the
password. So the limit here is not a courtesy to the server, it is what turns "a
guess is unlikely to work" into "there is no time to make enough guesses".

Every request counts, not only the failed ones -- the bodies below are deliberately
wrong so that the response before the throttle kicks in is a 401, which makes it
visible that the 429 replaced an answer the endpoint was otherwise still giving.
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack

import httpx
import pytest
from app.core.db import get_session
from app.core.rate_limit import ACTIVATE_LIMIT_PER_MINUTE, LOGIN_LIMIT_PER_MINUTE
from app.main import app
from sqlalchemy.orm import Session

pytestmark = pytest.mark.anyio

UNKNOWN_CODE = "MNPQ3456"
WRONG_CREDENTIALS = {"name": "Fantasma", "city": "Nenhures", "password": "seja-la-o-que-for"}

ACTIVATE = ("/app/activate", {"access_code": UNKNOWN_CODE})
LOGIN = ("/auth/login", WRONG_CREDENTIALS)


@pytest.fixture
async def client_from(
    session: Session,
) -> AsyncIterator[Callable[[str], Awaitable[httpx.AsyncClient]]]:
    """Factory for HTTP clients that reach the app from a chosen IP address.

    The limit is keyed on the client address, so telling two callers apart is the
    only way to test that the quota is per IP and not global -- a global limit would
    let one guessing phone lock every publisher in the congregation out.
    """
    app.dependency_overrides[get_session] = lambda: session
    async with AsyncExitStack() as stack:

        async def _make(ip: str) -> httpx.AsyncClient:
            transport = httpx.ASGITransport(app=app, client=(ip, 44444))
            return await stack.enter_async_context(
                httpx.AsyncClient(transport=transport, base_url="http://testserver")
            )

        yield _make
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("route", "limit", "ip"),
    [
        pytest.param(ACTIVATE, ACTIVATE_LIMIT_PER_MINUTE, "203.0.113.10", id="activate-11th"),
        pytest.param(LOGIN, LOGIN_LIMIT_PER_MINUTE, "203.0.113.11", id="login-6th"),
    ],
)
async def test_the_call_just_past_the_limit_is_refused_and_the_ones_before_it_are_not(
    client_from, route, limit, ip
):
    path, body = route
    client = await client_from(ip)

    answers = [await client.post(path, json=body) for _ in range(limit + 1)]

    assert [response.status_code for response in answers[:limit]] == [401] * limit
    assert answers[-1].status_code == 429


async def test_the_refusal_looks_like_every_other_error_of_this_api(client_from):
    """One body shape for the whole API: the clients parse `code` and show `detail`."""
    client = await client_from("203.0.113.12")
    for _ in range(LOGIN_LIMIT_PER_MINUTE):
        await client.post("/auth/login", json=WRONG_CREDENTIALS)

    refused = await client.post("/auth/login", json=WRONG_CREDENTIALS)

    assert refused.status_code == 429
    assert refused.json() == {
        "code": "rate_limit_exceeded",
        "detail": "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.",
    }
    assert refused.headers["Retry-After"] == "60"


async def test_two_different_ips_do_not_share_the_quota(client_from):
    """One phone burning its attempts must not cost anybody else theirs."""
    exhausted = await client_from("203.0.113.13")
    innocent = await client_from("203.0.113.14")
    for _ in range(ACTIVATE_LIMIT_PER_MINUTE + 1):
        await exhausted.post("/app/activate", json={"access_code": UNKNOWN_CODE})

    response = await innocent.post("/app/activate", json={"access_code": UNKNOWN_CODE})

    assert response.status_code == 401


async def test_flooding_the_login_does_not_close_the_activation_route(client_from):
    """The two endpoints have their own quotas: they defend different secrets."""
    client = await client_from("203.0.113.15")
    for _ in range(LOGIN_LIMIT_PER_MINUTE + 1):
        await client.post("/auth/login", json=WRONG_CREDENTIALS)

    response = await client.post("/app/activate", json={"access_code": UNKNOWN_CODE})

    assert response.status_code == 401


async def test_a_route_that_guards_no_secret_is_not_throttled(client_from):
    """The limit is aimed at guessing, not applied to the API at large."""
    client = await client_from("203.0.113.16")

    answers = [await client.get("/health") for _ in range(ACTIVATE_LIMIT_PER_MINUTE + 5)]

    assert {response.status_code for response in answers} == {200}
