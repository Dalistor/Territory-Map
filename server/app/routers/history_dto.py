"""Giving a history row back the publisher object its DTO promises.

`BlockWorkLog` and `TerritoryAssignment` no longer point at `users`: each row carries
the publisher's id as a plain UUID and their name copied in at write time, so the
record keeps naming the person after the person is deleted. That is the whole point of
the denormalisation -- and it means there is no relationship left for Pydantic to walk
when it fills `WorkLogOut.user` and `AssignmentOut.user`.

The shape on the wire does not change: `{id, name}`, nested, exactly as when it came
from a join. The admin screens read `user.id` to group the history by publisher, so
this is a contract, not an incidental detail of how the row is stored.

Rather than spell every DTO field out at each of the six call sites -- six chances to
forget one -- the row is wrapped in a view that answers `user` and passes everything
else straight through, so the routers keep validating from attributes as before.

This lives in `app/routers/` because it belongs to the DTO assembly routers do, and in
a module of its own because three of them need it. It decides nothing.
"""

from typing import Any, Protocol
from uuid import UUID

from app.schemas.user import UserBriefOut


class HistoryRow(Protocol):
    """Any row that records who produced it, by id and by name."""

    user_id: UUID
    user_name: str


class _RowWithUser:
    """A history row seen with a `user` attribute in front of it.

    Only `user` is answered here; every other attribute is read off the row, so the
    DTO sees exactly what it saw when the relationship existed.
    """

    def __init__(self, row: HistoryRow) -> None:
        self._row = row
        self.user = UserBriefOut(id=row.user_id, name=row.user_name)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._row, name)


def with_user(row: HistoryRow) -> _RowWithUser:
    """The row, ready to be validated into a DTO that nests the publisher."""
    return _RowWithUser(row)
