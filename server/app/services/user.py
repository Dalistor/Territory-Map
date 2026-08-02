"""Business rules of the publisher and of the disposable access code."""

from __future__ import annotations

import secrets
from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

from app.core import security
from app.core.config import get_settings
from app.core.exceptions import (
    DomainError,
    InactiveUserError,
    InvalidAccessCodeError,
    NotFoundError,
)
from app.models.user import User
from app.repositories.user import UserRepository

#: How many times a colliding code draw is retried before the call gives up.
_CODE_DRAW_ATTEMPTS = 10


def _matches(stored: str | None, offered: str) -> bool:
    """Whether the row really carries the code that was offered.

    `secrets.compare_digest` and not `==`: comparing a credential byte by byte with
    an early exit leaks, through timing, how much of a guess was right. The lookup
    that found this row already matched on equality in SQL, so this is the second
    lock rather than the first -- it is what keeps a lookup that ever became loose
    (a case-insensitive collation, a trimming column type) from handing out a token
    for a code nobody actually holds.
    """
    if stored is None:
        return False
    return secrets.compare_digest(stored, offered)


def _is_expired(user: User, now: datetime) -> bool:
    """Whether the user's access code is past its validity at `now`.

    The comparison is strict on purpose: at the exact expiry instant the code is
    still good. `UserRepository.expire_codes` wipes rows with
    `access_code_expires_at < now`, and the two must agree -- a stricter rule here
    would reject a code the cleanup job still considers alive.

    A code with no expiry is treated as expired rather than as eternal: it should
    not exist, and the safe reading of a malformed credential is to refuse it.
    """
    if user.access_code_expires_at is None:
        return True
    return user.access_code_expires_at < now


class UserService:
    """The publisher's lifecycle: registration, access code, activation, revocation.

    Everything it needs from the outside world arrives through the constructor --
    the repository, the clock, and the two security primitives. That is what lets
    the tests run this service against an in-memory repository, a frozen clock and
    a rigged code generator, with no database and no sleeping.
    """

    def __init__(
        self,
        users: UserRepository,
        now_provider: Callable[[], datetime],
        generate_access_code: Callable[[], str] = security.generate_access_code,
        create_app_token: Callable[[UUID, UUID, int], str] = security.create_app_token,
    ) -> None:
        self._users = users
        self._now_provider = now_provider
        self._generate_access_code = generate_access_code
        self._create_app_token = create_app_token

    def create(self, congregation_id: UUID, name: str, now: datetime | None = None) -> User:
        """Register a publisher with a freshly minted access code."""
        code, expires_at = self._mint_code(self._resolve_now(now))
        return self._users.create(
            congregation_id=congregation_id,
            name=name,
            access_code=code,
            access_code_expires_at=expires_at,
        )

    def regenerate_code(
        self,
        congregation_id: UUID,
        user_id: UUID,
        now: datetime | None = None,
    ) -> User:
        """Mint a new access code for an existing publisher.

        This is the answer to every "I lost the code / changed phones / it expired"
        call. Writing the new code drops the old one, which stops working at once.
        """
        user = self._get_of_congregation(congregation_id, user_id)
        code, expires_at = self._mint_code(self._resolve_now(now))
        return self._users.set_access_code(user, code, expires_at)

    def list(self, congregation_id: UUID) -> list[User]:
        """Every publisher of this congregation, and nobody else's."""
        return self._users.list_by_congregation(congregation_id)

    def set_active(self, congregation_id: UUID, user_id: UUID, is_active: bool) -> User:
        """Grant or revoke a publisher's access, leaving their work history alone."""
        user = self._get_of_congregation(congregation_id, user_id)
        return self._users.set_active(user, is_active)

    def expire_codes(self, now: datetime | None = None) -> int:
        """Wipe every code already past its validity; return how many were cleared.

        Runs on a schedule so that expiry is a fact in the database and not merely a
        check performed at redemption time: a credential nobody ever tries again
        would otherwise sit in the row forever. Rows whose code is already gone are
        untouched, which is what makes a second run in a row report 0.
        """
        return self._users.expire_codes(self._resolve_now(now))

    def activate(self, code: str, now: datetime | None = None) -> tuple[User, str]:
        """Spend an access code and return its owner together with the app token."""
        now = self._resolve_now(now)
        user = self._users.get_by_access_code(code)
        if user is None or not _matches(user.access_code, code) or _is_expired(user, now):
            # One error, one message, for "no such code", "expired" and "already
            # spent" alike. Telling them apart would confirm to whoever is guessing
            # that a code exists, which is the only thing they do not know.
            raise InvalidAccessCodeError
        if not user.is_active:
            # A different error, and deliberately so: this one is not a guess at a
            # credential, it is a known person whose access the admin switched off.
            # The code was valid, so nothing is revealed by saying what happened --
            # and the admin needs to be told that reactivating is the fix.
            raise InactiveUserError
        user = self._users.redeem_code(user, now)
        token = self._create_app_token(user.id, user.congregation_id, user.token_version)
        return user, token

    def _get_of_congregation(self, congregation_id: UUID, user_id: UUID) -> User:
        """Return the user, provided they belong to this congregation.

        Someone else's publisher and a publisher who does not exist raise the same
        `NotFoundError`, which the router turns into 404 rather than 403: a 403
        would confirm that the id names a real person in some other congregation.
        """
        user = self._users.get(user_id)
        if user is None or user.congregation_id != congregation_id:
            raise NotFoundError
        return user

    def _mint_code(self, now: datetime) -> tuple[str, datetime]:
        """Return a fresh, unused access code and the moment it stops working.

        The code is unique globally while it lives, so a draw that collides with a
        live one is retried instead of being written -- the database's partial
        unique index would reject it anyway, and losing to it would fail a
        registration for a reason the admin can do nothing about.
        """
        expires_at = now + timedelta(hours=get_settings().ACCESS_CODE_TTL_HOURS)
        for _ in range(_CODE_DRAW_ATTEMPTS):
            code = self._generate_access_code()
            if self._users.get_by_access_code(code) is None:
                return code, expires_at
        # Unreachable in practice -- with 31**8 codes and a handful of live ones,
        # losing this many draws in a row does not happen by chance. It happens when
        # something is broken (a generator stuck on one value), and then failing the
        # call is right: an unbounded retry would hang the request instead.
        raise DomainError(
            "Não foi possível gerar um código de acesso agora. Tente de novo em instantes."
        )

    def _resolve_now(self, now: datetime | None) -> datetime:
        """Use the caller's clock reading, or ask the injected provider for one.

        The service never calls `datetime.now()` itself: the clock arrives either as
        an argument or through `now_provider`, which is what makes expiry testable.
        """
        return now if now is not None else self._now_provider()
