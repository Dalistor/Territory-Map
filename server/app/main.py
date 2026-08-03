"""FastAPI application bootstrap: middleware, error translation and routing."""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.core.app_key import install_app_key_gate
from app.core.config import get_settings
from app.core.exceptions import (
    DomainError,
    DuplicateBlockNumberError,
    DuplicateNameError,
    InactiveUserError,
    InvalidAccessCodeError,
    InvalidCredentialsError,
    NotFoundError,
)
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.scheduler import lifespan
from app.routers import admin_blocks, admin_territories, admin_users, app_client, auth

settings = get_settings()

#: HTTP status for each domain error the API can raise.
#:
#: Services never build an `HTTPException`; they raise a `DomainError`, and this is
#: the single place where the domain's vocabulary becomes HTTP. One table, one
#: handler: a rule stated once cannot drift between routers, and a new route gets
#: the right status for free.
#:
#: Only the errors that are *not* 422 need an entry. `NotFoundError` is 404 even
#: when the resource belongs to another congregation -- 403 would confirm it exists.
#: The three authentication failures share 401 and, by design, are told apart only
#: by their `code`, never by the status.
DOMAIN_ERROR_STATUS: dict[type[DomainError], int] = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,
    InvalidAccessCodeError: status.HTTP_401_UNAUTHORIZED,
    InactiveUserError: status.HTTP_401_UNAUTHORIZED,
    DuplicateNameError: status.HTTP_409_CONFLICT,
    DuplicateBlockNumberError: status.HTTP_409_CONFLICT,
}

#: Everything else -- an invalid polygon, an overlap, a block outside its territory,
#: a bad `worked_at`. The request was well formed and the server understood it; it
#: is the *content* that breaks a rule, which is what 422 means.
DOMAIN_ERROR_DEFAULT_STATUS = status.HTTP_422_UNPROCESSABLE_CONTENT


def domain_error_status(error: DomainError) -> int:
    """Return the HTTP status that corresponds to this domain error.

    Walks the class hierarchy rather than looking the exact class up, so a future
    subclass of, say, `NotFoundError` inherits its status instead of quietly
    falling back to 422.
    """
    for klass in type(error).__mro__:
        if klass in DOMAIN_ERROR_STATUS:
            return DOMAIN_ERROR_STATUS[klass]
    return DOMAIN_ERROR_DEFAULT_STATUS


def domain_error_handler(request: Request, error: DomainError) -> JSONResponse:
    """Answer a business-rule failure with `{"code", "detail"}`.

    `code` is the stable, machine-readable string the clients branch on; `detail` is
    the Portuguese message written for the admin, which is often more specific than
    the class default (it may name the blocks that fell outside a new boundary).
    """
    http_status = domain_error_status(error)
    # RFC 9110 requires a challenge on a 401. The clients only ever send bearer
    # tokens, so there is one scheme to name.
    headers = {"WWW-Authenticate": "Bearer"} if http_status == 401 else None
    return JSONResponse(
        status_code=http_status,
        content={"code": error.code, "detail": error.message},
        headers=headers,
    )


app = FastAPI(title="Territory Map API", version="0.1.0", lifespan=lifespan)

# Registered for the base class: Starlette resolves handlers through the exception's
# MRO, so every subclass lands here without being listed.
app.add_exception_handler(DomainError, domain_error_handler)

# The throttle on `/auth/login` and `/app/activate`. The limits themselves are
# declared on the routes (see `app/routers/auth.py`); what happens here is the
# wiring: `app.state.limiter` is where slowapi looks the limiter up at request time,
# and the handler is what makes a refusal answer `{"code", "detail"}` like every
# other error of this API instead of slowapi's own body.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# The outermost gate: a shared key both clients send on every request, checked
# before routing. It is a shutter against unaddressed traffic, not authentication --
# the value ships inside the APK and the desktop binary, and over plain HTTP it
# travels in the clear next to the token it fronts. Authorization stays with the
# JWT and the app token.
install_app_key_gate(app, settings.APP_SECRET)

if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(admin_territories.router)
app.include_router(admin_blocks.router)
app.include_router(app_client.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
