"""The application bootstrap: health check and the single domain-error handler.

Every business-rule failure in the API becomes HTTP in exactly one place, so this is
where the whole table is pinned -- including the errors whose routes do not exist
yet. A throwaway app is mounted with the real handler and made to raise each error
in turn, which tests the translation itself rather than one route's use of it.
"""

import httpx
import pytest
from app.core.exceptions import (
    BlockOutsideTerritoryError,
    BlockOverlapError,
    DomainError,
    DuplicateBlockNumberError,
    DuplicateNameError,
    InactiveUserError,
    InvalidAccessCodeError,
    InvalidCredentialsError,
    InvalidPolygonError,
    InvalidWorkedAtError,
    NotFoundError,
    TerritoryOverlapError,
)
from app.main import domain_error_handler, domain_error_status
from fastapi import FastAPI

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def app_raising(error: DomainError) -> FastAPI:
    """A one-route application whose endpoint raises `error`, wired to the handler."""
    app = FastAPI()
    app.add_exception_handler(DomainError, domain_error_handler)

    @app.get("/boom")
    def boom() -> None:
        raise error

    return app


async def call(error: DomainError) -> httpx.Response:
    transport = httpx.ASGITransport(app=app_raising(error))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.get("/boom")


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        pytest.param(NotFoundError(), 404, id="not-found"),
        pytest.param(InvalidCredentialsError(), 401, id="invalid-credentials"),
        pytest.param(InvalidAccessCodeError(), 401, id="invalid-access-code"),
        pytest.param(InactiveUserError(), 401, id="inactive-user"),
        pytest.param(DuplicateNameError(), 409, id="duplicate-name"),
        pytest.param(DuplicateBlockNumberError(), 409, id="duplicate-block-number"),
        pytest.param(InvalidPolygonError(), 422, id="invalid-polygon"),
        pytest.param(TerritoryOverlapError(), 422, id="territory-overlap"),
        pytest.param(BlockOutsideTerritoryError(), 422, id="block-outside-territory"),
        pytest.param(BlockOverlapError(), 422, id="block-overlap"),
        pytest.param(InvalidWorkedAtError(), 422, id="invalid-worked-at"),
        pytest.param(DomainError(), 422, id="bare-domain-error"),
    ],
)
async def test_each_domain_error_gets_its_status_and_the_shared_body_shape(error, expected):
    response = await call(error)

    assert response.status_code == expected
    assert response.json() == {"code": error.code, "detail": error.message}


async def test_the_detail_is_the_message_the_service_chose_not_the_class_default():
    """A service may say something more useful -- naming the blocks that fell out."""
    error = BlockOutsideTerritoryError("A quadra 12 ficou fora da nova demarcação.")

    response = await call(error)

    assert response.status_code == 422
    assert response.json()["detail"] == "A quadra 12 ficou fora da nova demarcação."
    assert response.json()["code"] == "block_outside_territory"


async def test_a_401_carries_the_authentication_challenge():
    response = await call(InvalidCredentialsError())

    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_an_unlisted_subclass_inherits_the_status_of_its_parent():
    """The table is walked through the MRO, so a new error is never a silent 422."""

    class MissingTerritoryError(NotFoundError):
        code = "missing_territory"

    assert domain_error_status(MissingTerritoryError()) == 404


async def test_health_still_answers_ok():
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
