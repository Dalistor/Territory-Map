"""Admin authentication: the one place that turns credentials into a token.

The three fields of the login -- name, city and password -- are validated together
and fail together. Nothing here ever says *which* of them was wrong, and nothing here
knows about HTTP: failure is an `InvalidCredentialsError`, and the router is what
turns it into a 401.
"""

import secrets
from collections.abc import Callable
from datetime import datetime

from app.core import security
from app.core.exceptions import InvalidCredentialsError
from app.models.congregation import Congregation
from app.repositories.congregation import CongregationRepository

#: Comparison target used when the `(name, city)` pair matches no congregation.
#:
#: It is a real bcrypt digest of a random string nobody knows, so verifying against it
#: always fails and always costs a full bcrypt round. Returning early instead would
#: answer in microseconds while a real congregation takes ~250ms, and that gap alone
#: tells an attacker which congregations exist -- probing pairs would map out every
#: congregation in the system without ever guessing a password.
#:
#: Computed once, at import, so the first unknown-congregation login is not the slow
#: one. A lazily built digest would leak on that first request.
_ABSENT_CONGREGATION_HASH = security.hash_password(secrets.token_urlsafe(32))


class AuthService:
    """Validates the admin's credentials and issues the admin token.

    Everything it depends on arrives through the constructor -- the repository, the
    clock and the two security functions -- which is what lets the tests count calls
    and pin the expiry without a database, a real hash or a frozen clock.
    """

    def __init__(
        self,
        congregations: CongregationRepository,
        now_provider: Callable[[], datetime],
        create_admin_token: Callable[..., str] = security.create_admin_token,
        verify_password: Callable[[str, str], bool] = security.verify_password,
    ) -> None:
        self._congregations = congregations
        self._now_provider = now_provider
        self._create_admin_token = create_admin_token
        self._verify_password = verify_password

    def login(
        self,
        name: str,
        city: str,
        password: str,
        now: datetime | None = None,
    ) -> tuple[Congregation, str]:
        """Return the congregation and its admin token, or raise `InvalidCredentialsError`.

        An unknown name, the right name in the wrong city and a wrong password all
        raise the same error with the same message. That is deliberate: distinguishing
        them would confirm that a congregation exists, and `(name, city)` is guessable
        in a way a password is not.

        `now` is the moment the token is issued and drives its expiry. Omitted, it comes
        from the injected `now_provider`; either way the clock is never read here.
        """
        issued_at = self._now_provider() if now is None else now

        congregation = self._congregations.get_by_name_and_city(name, city)
        # Verify unconditionally -- see `_ABSENT_CONGREGATION_HASH`. The result is
        # computed before the branch so that a missing congregation costs the same as
        # a wrong password.
        expected_hash = (
            _ABSENT_CONGREGATION_HASH if congregation is None else congregation.password_hash
        )
        password_matches = self._verify_password(password, expected_hash)

        if congregation is None or not password_matches:
            raise InvalidCredentialsError

        return congregation, self._create_admin_token(congregation.id, issued_at)
