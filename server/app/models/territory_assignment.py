"""The `territory_assignments` table: the history of who was responsible for a territory."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.campaign_designation import CampaignDesignation
    from app.models.territory import Territory


class TerritoryAssignment(Base, EntityMixin):
    """One stretch of time in which a publisher was responsible for a territory.

    Assignment is stored as a log rather than only as `Territory.assigned_user_id`
    for the same reason work is (`BlockWorkLog`): the useful question in the field
    is historical - who had this territory, since when, and when did they hand it
    back - and a single overwritten column answers none of it. The paper S-13 card
    this replaces is literally a list of these rows.

    `Territory.assigned_user_id` survives as a projection of the open assignment,
    exactly as `Block.last_worked_at` projects the latest work log. The truth is
    here; that column is a read cache recomputed on every assign/complete/delete.

    `completed_at` being NULL is what makes an assignment *open*. At most one row
    per territory may be open at a time, and that is enforced by the database
    (see the partial unique index below), not only by the service.

    A row is held either by one publisher or by a campaign period
    (`campaign_designation_id`). The campaign line lives in this table, rather than in
    a table of its own, because of that same index: with the campaign's line counted
    as the territory's open row, "designating a campaign replaces the dirigente" and
    "a territory is in at most one active campaign, with no individual designation
    meanwhile" are both held by the schema with no new constraint -- and the S-13 card
    shows the campaign where it would show a dirigente, with no second source to merge.
    The price is that `user_id`/`user_name` became nullable, which a CHECK keeps
    honest: a row with neither a publisher nor a campaign names nobody.
    """

    __tablename__ = "territory_assignments"
    __table_args__ = (
        # The history is always read for one territory, newest first - that is the
        # panel the admin opens and the sheet the Excel export writes.
        Index(
            "ix_territory_assignments_territory_started",
            "territory_id",
            text("started_at DESC"),
        ),
        # The core invariant: a territory has at most one publisher responsible at a
        # time. A partial unique index says that in the schema, so a race between two
        # requests cannot produce two open assignments even if the service checks first.
        Index(
            "uq_territory_assignments_open",
            "territory_id",
            unique=True,
            postgresql_where=text("completed_at IS NULL"),
        ),
        # Every row names who held the territory: a publisher (both id and the copied
        # name) or a campaign period. The first row the history ever allowed without a
        # person is the campaign's, and only because the campaign names the people.
        CheckConstraint(
            "campaign_designation_id IS NOT NULL "
            "OR (user_id IS NOT NULL AND user_name IS NOT NULL)",
            name="ck_territory_assignments_author",
        ),
    )

    territory_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("territories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # No foreign key, mirroring `block_work_logs.user_id`. The S-13 card has to
    # outlive the publisher: the admin can delete a person, and the record of who
    # held which territory must still name them afterwards. A key pointing at
    # `users` would either block that deletion or leave the row anonymous, so the
    # name is copied into the row when the assignment is opened - see `user_name`.
    #
    # What is left here is a plain id with no constraint behind it. While the
    # publisher exists it is still the reliable way to group the history by person
    # (and to tell two namesakes apart); once they are deleted it is an orphan id
    # that points nowhere, which is harmless because the name is already stored.
    #
    # NULL on a campaign line, whose people are the period's publishers.
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    # A photograph of the publisher's name at the moment the assignment was opened,
    # not a live view of it. Accepted consequence: renaming a publisher does not
    # rewrite the history - old rows keep the name the person had that day. That is
    # the price of denormalising, and it is exactly what lets the card survive the
    # deletion of the person. Same length as `User.name`. Nullable only for a campaign
    # line; `ck_territory_assignments_author` refuses a row that names nobody.
    user_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # The campaign period this line belongs to, or NULL for an individual designation.
    # CASCADE: the line only means something as part of the campaign, so deleting the
    # campaign (and with it its periods) takes its lines off the cards, just as deleting
    # a territory takes the whole card.
    campaign_designation_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("campaign_designations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL means the assignment is still open; a value turns the row into history.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    territory: Mapped["Territory"] = relationship(back_populates="assignments")
    campaign_designation: Mapped["CampaignDesignation | None"] = relationship()
    # There is deliberately no `user` relationship, exactly as in `BlockWorkLog`.
    # With the foreign key gone the database no longer guarantees that join, and it
    # would resolve to None in precisely the case this design exists to serve - a
    # deleted publisher. Readers build the author from `user_id` + `user_name`.
