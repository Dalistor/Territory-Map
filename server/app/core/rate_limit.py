"""Per-IP rate limiting for the two routes that hand out a token.

`POST /app/activate` and `POST /auth/login` are the only endpoints reachable without
a credential, and each of them accepts one: an 8-character code and the admin's
password. Everything else in the API is already behind a token, so this is the entire
guessing surface, and a throttle is what keeps "unlikely to be guessed" from becoming
"guessable given an afternoon".

The limiter is defined here, in `core`, and not in `app/main.py`: the routers have to
reach the decorator, and importing `main` from a router would close an import cycle
(`main` imports the routers). `main` does the wiring -- publishing the limiter on
`app.state` and registering the 429 handler.

The key is the client address, which is only as trustworthy as whatever sits in front
of the app. Behind a reverse proxy every request arrives from the proxy, so the API
must be served with uvicorn's `--proxy-headers` (and the proxy must set
`X-Forwarded-For`); otherwise all callers share one bucket and the first guesser locks
out the congregation.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

#: Ten redemptions a minute is far above what a publisher typing a code they were
#: handed will ever need, and far below what makes brute force worth attempting.
ACTIVATE_LIMIT_PER_MINUTE = 10

#: Tighter, because there is one admin per congregation and they know their password:
#: a human who has failed five times in a minute is not going to succeed on the sixth.
LOGIN_LIMIT_PER_MINUTE = 5

ACTIVATE_RATE_LIMIT = f"{ACTIVATE_LIMIT_PER_MINUTE}/minute"
LOGIN_RATE_LIMIT = f"{LOGIN_LIMIT_PER_MINUTE}/minute"

#: The machine-readable half of the error body, in the same shape every other failure
#: of this API uses, so clients keep one branch for "the server said no".
RATE_LIMIT_CODE = "rate_limit_exceeded"

#: Says how long to wait, and deliberately does not say what was being guessed: the
#: same text answers a flood of logins and a flood of codes.
RATE_LIMIT_DETAIL = "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo."

#: In-process, in-memory counters. Each uvicorn worker therefore keeps its own, so the
#: effective ceiling is the limit times the number of workers -- still a ceiling, and
#: still orders of magnitude below a useful brute force. Point `storage_uri` at Redis
#: if the deployment ever needs one shared bucket across processes or hosts.
limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, error: RateLimitExceeded) -> JSONResponse:
    """Answer a throttled request with the API's standard error body.

    slowapi ships its own handler, but it answers `{"error": "Rate limit exceeded: ..."}`
    and echoes the limit that was hit. Both are wrong here: the shape would be the one
    body in the API that clients cannot parse like the others, and naming the limit
    tells whoever is guessing exactly how to pace themselves.
    """
    return JSONResponse(
        status_code=429,
        content={"code": RATE_LIMIT_CODE, "detail": RATE_LIMIT_DETAIL},
        # Read off the limit that was actually hit rather than hard-coded, so the
        # header cannot drift from the window if the limits above are ever retuned.
        headers={"Retry-After": str(error.limit.limit.get_expiry())},
    )
