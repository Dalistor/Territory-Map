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

from app.models.territory_assignment import TerritoryAssignment
from app.schemas.campaign import CampaignBriefOut
from app.schemas.user import UserBriefOut


class HistoryRow(Protocol):
    """Any row that records who produced it, by id and by name.

    Both may be null on one kind of row only -- a card line held by a campaign, whose
    people are the campaign's -- and then `user` is null as well.
    """

    user_id: UUID | None
    user_name: str | None


class _RowWithUser:
    """A history row seen with a `user` attribute in front of it.

    Only `user` is answered here; every other attribute is read off the row, so the
    DTO sees exactly what it saw when the relationship existed.
    """

    def __init__(self, row: HistoryRow) -> None:
        self._row = row
        self.user = (
            UserBriefOut(id=row.user_id, name=row.user_name)
            if row.user_id is not None and row.user_name is not None
            else None
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._row, name)


def with_user(row: HistoryRow) -> _RowWithUser:
    """The row, ready to be validated into a DTO that nests the publisher."""
    return _RowWithUser(row)


class _AssignmentWithHolder(_RowWithUser):
    """A card row seen with both possible holders in front of it: a publisher or a campaign.

    Exactly one of `user` and `campaign` is filled: an individual designation names the
    publisher, and a campaign's line names the campaign, which the admin screens show
    where the dirigente would be.
    """

    def __init__(self, row: TerritoryAssignment) -> None:
        super().__init__(row)
        designation = row.campaign_designation
        self.campaign = (
            CampaignBriefOut(id=designation.campaign.id, name=designation.campaign.name)
            if designation is not None
            else None
        )


def with_holder(assignment: TerritoryAssignment) -> _AssignmentWithHolder:
    """The card row, ready to be validated into `AssignmentOut` and its subclasses."""
    return _AssignmentWithHolder(assignment)
