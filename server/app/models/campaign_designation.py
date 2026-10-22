"""The `campaign_designations` table, and the publishers each period was handed to."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign


class CampaignDesignation(Base, EntityMixin):
    """One period in which a campaign was out, handed to a group of publishers.

    The same shape as a line of the S-13 card -- a start, and a completion that is NULL
    while the period is open -- because it is the same kind of fact: a dated stretch of
    responsibility. What differs is that the responsibility is shared, so the people
    live in `CampaignDesignationPublisher` rather than in a column.

    Designating the campaign also writes one open `TerritoryAssignment` per territory,
    pointing back here; that is what replaces each territory's individual dirigente and
    what the app's marking rule reads. Completing the period closes those lines with
    the same date.
    """

    __tablename__ = "campaign_designations"
    __table_args__ = (
        # A campaign is out at most once at a time. Said in the schema, as the card
        # says it for territories, so two concurrent "designate" clicks cannot open two
        # periods even if the service checks first.
        Index(
            "uq_campaign_designations_open",
            "campaign_id",
            unique=True,
            postgresql_where=text("completed_at IS NULL"),
        ),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL means the period is still open; a value turns it into history.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["Campaign"] = relationship(back_populates="designations")
    publishers: Mapped[list["CampaignDesignationPublisher"]] = relationship(
        back_populates="designation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignDesignationPublisher.user_name",
    )


class CampaignDesignationPublisher(Base):
    """One publisher of a campaign period.

    Kept next to `CampaignDesignation` rather than in a module of its own because it is
    part of that period and nothing else: it has no id, no life outside the period, and
    is only ever written and read through `CampaignDesignation.publishers`.

    `user_id` has no foreign key and the name is copied in at write time, for exactly
    the reason the two history tables do it (see `TerritoryAssignment.user_id`): a
    completed campaign must keep naming the people who worked it after one of them is
    deleted.
    """

    __tablename__ = "campaign_designation_publishers"

    campaign_designation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("campaign_designations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Part of the key: a person is in a period once, so the list cannot repeat anyone.
    # Indexed on its own for the phone's question -- "which active campaigns am I in?".
    user_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, index=True)
    user_name: Mapped[str] = mapped_column(String(120), nullable=False)

    designation: Mapped[CampaignDesignation] = relationship(back_populates="publishers")
