"""Data access for the User entity and its disposable access code."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    """Reads and writes publishers.

    Nothing here judges a code. `get_by_access_code` answers "is there a row
    carrying this string", not "may this code be redeemed" -- expiry, single use
    and `is_active` are decided by `UserService`, which is also what keeps the
    three failure modes indistinguishable to the caller.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, user_id: UUID) -> User | None:
        """Return the user with this id, or `None` if there is none."""
        return self._session.get(User, user_id)

    def get_by_access_code(self, code: str | None) -> User | None:
        """Return the user currently holding this access code, or `None`.

        A null or empty code matches nobody: most rows have `access_code IS NULL`
        (the code is wiped on redemption), and `WHERE access_code = NULL` is never
        true anyway, but short-circuiting makes that explicit and skips the query.
        """
        if not code:
            return None
        stmt = select(User).where(User.access_code == code)
        return self._session.scalars(stmt).one_or_none()

    def list_by_congregation(self, congregation_id: UUID) -> list[User]:
        """Return every user of a congregation, alphabetically.

        `created_at` breaks ties so the order is stable across calls.
        """
        stmt = (
            select(User)
            .where(User.congregation_id == congregation_id)
            .order_by(User.name, User.created_at)
        )
        return list(self._session.scalars(stmt))

    def create(
        self,
        *,
        congregation_id: UUID,
        name: str,
        access_code: str | None = None,
        access_code_expires_at: datetime | None = None,
    ) -> User:
        """Insert a publisher and return it with its generated id.

        `token_version` starts at 0 and `is_active` at true by model default; the
        user is not activated yet, so `activated_at` stays null. Flushes so the
        caller has the primary key -- the transaction remains the session's.
        """
        user = User(
            congregation_id=congregation_id,
            name=name,
            access_code=access_code,
            access_code_expires_at=access_code_expires_at,
        )
        self._session.add(user)
        self._session.flush()
        return user

    def set_access_code(
        self,
        user: User,
        code: str | None,
        expires_at: datetime | None,
    ) -> User:
        """Write a new access code on the user, replacing whatever was there.

        Any previous code stops working at this moment -- that is exactly the
        "lost the phone, give me a new code" path.
        """
        user.access_code = code
        user.access_code_expires_at = expires_at
        self._session.flush()
        return user

    def redeem_code(self, user: User, now: datetime) -> User:
        """Spend the user's access code, in one statement.

        Wiping the code, stamping `activated_at` and bumping `token_version` are a
        single `UPDATE`: a redemption that only half-applied would either leave a
        live code behind or hand out a token whose version is already stale. The
        increment is written as a SQL expression rather than `user.token_version + 1`
        so the database does the arithmetic on the current row value, not on a
        number this session may have read some time ago.
        """
        user.access_code = None
        user.access_code_expires_at = None
        user.activated_at = now
        user.token_version = User.token_version + 1
        self._session.flush()
        # The SQL expression above leaves `token_version` expired on the instance;
        # refresh so the caller reads the number that was actually written -- the
        # app token is minted from it.
        self._session.refresh(user)
        return user

    def set_active(self, user: User, is_active: bool) -> User:
        """Flip the user's access on or off. Work history is untouched either way."""
        user.is_active = is_active
        self._session.flush()
        return user

    def expire_codes(self, now: datetime) -> int:
        """Wipe every access code already past its validity; return how many.

        A batch `UPDATE`, so the periodic job costs one statement regardless of how
        many codes are stale. Rows whose code is already null are skipped, which is
        what makes a second run in a row report 0.

        `access_code_expires_at` is cleared together with the code: an expiry left
        pointing at a code that no longer exists is dead data, and the admin screen
        reads both fields.
        """
        stmt = (
            update(User)
            .where(
                User.access_code.is_not(None),
                User.access_code_expires_at < now,
            )
            .values(access_code=None, access_code_expires_at=None)
            # Users already loaded in this session are synchronised, so a caller
            # holding a stale instance does not read a code the database just wiped.
            .execution_options(synchronize_session="fetch")
        )
        return self._session.execute(stmt).rowcount
