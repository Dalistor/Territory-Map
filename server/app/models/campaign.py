"""The `campaigns` table, and `campaign_territories`, the territories grouped by each one."""

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Column, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.campaign_designation import CampaignDesignation
    from app.models.territory import Territory

#: Which territories a campaign groups. A plain association table rather than a model
#: of its own, and kept in this module on purpose: it carries no column besides the two
#: keys, nothing ever reads it except through `Campaign.territories`, and a separate
#: file for it would be an entity with no behaviour. Both keys cascade -- deleting the
#: campaign forgets its grouping, and deleting a territory drops it from every campaign
#: it was in, exactly as it already takes its blocks and its card with it.
campaign_territories = Table(
    "campaign_territories",
    Base.metadata,
    Column(
        "campaign_id",
        PgUUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "territory_id",
        PgUUID(as_uuid=True),
        ForeignKey("territories.id", ondelete="CASCADE"),
        primary_key=True,
        # The composite key serves "the territories of this campaign"; this index
        # serves the opposite question, asked whenever a territory is deleted.
        index=True,
    ),
)


class Campaign(Base, EntityMixin):
    """A named group of territories that the admin hands to several publishers at once.

    The campaign itself is only the grouping: its name and which territories it holds.
    *Who* works it and *when* lives in `CampaignDesignation` -- one row per period the
    campaign was out -- for the same reason a territory's responsibility lives in
    `TerritoryAssignment` rather than in a column: the useful question is historical,
    and a campaign can be designated again after it was completed.

    A territory may sit in any number of campaigns, but in at most one *active* one.
    That rule is not a constraint here: it is held by the territory's card, where an
    active campaign writes an open line -- see `TerritoryAssignment`.
    """

    __tablename__ = "campaigns"
    __table_args__ = (
        # The name is how the admin tells campaigns apart on the screen and out loud,
        # so it is unique within the congregation -- and only there, as territory names
        # are.
        UniqueConstraint("congregation_id", "name", name="uq_campaigns_congregation_name"),
    )

    congregation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("congregations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    territories: Mapped[list["Territory"]] = relationship(
        secondary=campaign_territories,
        order_by="Territory.name",
    )
    # Every period the campaign was designated, newest first. The database cascades the
    # deletion (and from the period on to its lines on the territory cards), so the ORM
    # is told not to load the rows just to delete them one by one.
    designations: Mapped[list["CampaignDesignation"]] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(CampaignDesignation.started_at)",
    )
