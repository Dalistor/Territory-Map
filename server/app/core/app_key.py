"""A shared application key required on every request."""

import logging
from collections.abc import Awaitable, Callable
from secrets import compare_digest

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)

APP_KEY_HEADER = "X-App-Key"

APP_KEY_CODE = "invalid_app_key"

APP_KEY_DETAIL = "Requisição não autorizada."

#: The one route that answers without the key. The deploy's health check runs inside
#: the VPS and the container runtime probes the same path; neither has anywhere to
#: read a secret from, and both have to work before the clients ever connect.
EXEMPT_PATHS = frozenset({"/health"})


class AppKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, secret: str) -> None:
        super().__init__(app)
        self._secret = secret

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)
        # compare_digest, not `!=`: equality on a secret returns at the first
        # differing byte, and that timing difference is enough to recover the key
        # one character at a time.
        if not compare_digest(request.headers.get(APP_KEY_HEADER, ""), self._secret):
            return JSONResponse(
                status_code=401,
                content={"code": APP_KEY_CODE, "detail": APP_KEY_DETAIL},
            )
        return await call_next(request)


def install_app_key_gate(app: FastAPI, secret: str) -> None:
    """Front `app` with the key gate, or warn loudly that there is none.

    An empty secret leaves the middleware off the stack entirely rather than
    comparing every request against `""`. The difference matters: comparing would
    refuse a client that *does* send a key, which is the opposite of disabled, and
    would make the unconfigured state behave like a misconfigured one.
    """
    if not secret:
        logger.warning(
            "APP_SECRET is empty: the application key gate is DISABLED and every "
            "request will be served. Set APP_SECRET in the environment to enable it."
        )
        return
    app.add_middleware(AppKeyMiddleware, secret=secret)
