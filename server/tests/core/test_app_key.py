"""The shared application-key gate that fronts the whole API.

A single static key, sent by both clients on every request. It is not authentication
-- the value ships inside an APK and a desktop binary, so anyone holding either can
read it -- and over plain HTTP it travels in the clear alongside the token it is
supposed to shield. What it buys is that the API stops answering an unaddressed
scanner, which is a real reduction in exposure and nothing more.

`/health` is exempt on purpose: the deploy's health check and the container runtime
both call it, and neither carries the key.
"""

import httpx
import pytest
from app.core import app_key as app_key_module
from app.core.app_key import install_app_key_gate
from app.core.config import Settings
from fastapi import FastAPI

pytestmark = pytest.mark.anyio

REQUIRED_SETTINGS = {
    "DATABASE_URL": "postgresql+psycopg://u:p@localhost:5432/db",
    "TEST_DATABASE_URL": "postgresql+psycopg://u:p@localhost:5432/db_test",
    "JWT_SECRET": "test-secret",
}

#: The literal wire contract, spelled out rather than imported from the module under
#: test: renaming the constant must not be able to keep these tests green.
HEADER = "X-App-Key"
SECRET = "the-configured-key"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def gated_app(secret: str) -> FastAPI:
    """A throwaway app with one protected route and the real `/health` exemption."""
    app = FastAPI()

    @app.get("/protected")
    def protected() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/protected")
    def protected_post() -> dict[str, bool]:
        return {"ok": True}

    install_app_key_gate(app, secret)
    return app


def client_for(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


def test_app_secret_defaults_to_empty_when_the_environment_does_not_set_it() -> None:
    settings = Settings(_env_file=None, **REQUIRED_SETTINGS)

    assert settings.APP_SECRET == ""


async def test_a_request_without_the_header_is_refused() -> None:
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get("/protected")

    assert response.status_code == 401
    assert set(response.json()) == {"code", "detail"}


async def test_a_request_carrying_the_configured_key_goes_through() -> None:
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get("/protected", headers={HEADER: SECRET})

    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_a_wrong_key_is_answered_exactly_like_a_missing_one() -> None:
    """Telling the two apart would confirm to a prober that a key is even expected."""
    async with client_for(gated_app(SECRET)) as client:
        missing = await client.get("/protected")
        wrong = await client.get("/protected", headers={HEADER: "not-the-key"})

    assert wrong.status_code == missing.status_code
    assert wrong.json() == missing.json()


async def test_the_right_value_surrounded_by_whitespace_is_refused() -> None:
    """The comparison is exact; no trimming, so a padded value is simply not the key."""
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get("/protected", headers={HEADER: f" {SECRET} "})

    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/openapi.json", "/docs", "/redoc"])
async def test_the_api_documentation_is_behind_the_gate(path: str) -> None:
    """The schema names every route and every field; it is not a public page."""
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get(path)

    assert response.status_code == 401


async def test_the_gate_applies_to_writes_too() -> None:
    async with client_for(gated_app(SECRET)) as client:
        response = await client.post("/protected")

    assert response.status_code == 401


async def test_health_answers_without_the_header() -> None:
    """The deploy's health check and the container runtime both call it keyless."""
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_answers_even_when_the_header_is_wrong() -> None:
    """The exemption is by route, not a fallback for a failed comparison."""
    async with client_for(gated_app(SECRET)) as client:
        response = await client.get("/health", headers={HEADER: "not-the-key"})

    assert response.status_code == 200


async def test_an_empty_secret_leaves_every_request_through() -> None:
    """No key configured means no gate -- what keeps local runs and CI usable."""
    async with client_for(gated_app("")) as client:
        response = await client.get("/protected")

    assert response.status_code == 200


async def test_an_empty_secret_also_lets_through_a_request_that_sends_a_key() -> None:
    """Disabled means disabled. Comparing anything against "" would refuse this one."""
    async with client_for(gated_app("")) as client:
        response = await client.get("/protected", headers={HEADER: "whatever"})

    assert response.status_code == 200


def test_an_empty_secret_warns_at_startup(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Running unguarded has to be loud; silence would make it the default by accident."""
    with caplog.at_level("WARNING"):
        install_app_key_gate(FastAPI(), "")

    assert any(record.levelname == "WARNING" for record in caplog.records)
    assert "APP_SECRET" in caplog.text


def test_a_configured_secret_does_not_warn(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("WARNING"):
        install_app_key_gate(FastAPI(), SECRET)

    assert caplog.records == []


async def test_the_key_is_compared_in_constant_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`==` on a secret leaks its prefix through timing: it stops at the first
    differing byte, so an attacker can recover the key one character at a time.
    There is no black-box assertion for elapsed time that is not flaky, so this
    pins the mechanism: the comparison goes through `secrets.compare_digest`.
    """
    calls: list[tuple[str, str]] = []
    real = app_key_module.compare_digest

    def spy(a: str, b: str) -> bool:
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(app_key_module, "compare_digest", spy)

    async with client_for(gated_app(SECRET)) as client:
        await client.get("/protected", headers={HEADER: "not-the-key"})

    assert calls == [("not-the-key", SECRET)]
