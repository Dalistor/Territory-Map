"""Data access for the Congregation entity."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.congregation import Congregation


class CongregationRepository:
    """Reads and writes congregations. Holds no rule about who may see what."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, congregation_id: UUID) -> Congregation | None:
        """Return the congregation with this id, or `None` if there is none."""
        return self._session.get(Congregation, congregation_id)

    def get_by_name_and_city(self, name: str, city: str) -> Congregation | None:
        """Return the congregation identified by the `(name, city)` pair, or `None`.

        This is the lookup behind the admin login, but it is only a lookup: the
        password is never an argument here. The service fetches the row and then
        verifies the digest, so that "no such congregation" and "wrong password"
        can be answered identically upstream.
        """
        stmt = select(Congregation).where(
            Congregation.name == name,
            Congregation.city == city,
        )
        return self._session.scalars(stmt).one_or_none()

    def create(self, *, name: str, city: str, password_hash: str) -> Congregation:
        """Insert a congregation and return it with its generated id.

        Flushes so the caller has the primary key; the enclosing transaction is
        still the session's to commit or roll back.
        """
        congregation = Congregation(name=name, city=city, password_hash=password_hash)
        self._session.add(congregation)
        self._session.flush()
        return congregation
