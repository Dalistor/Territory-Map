"""The `territories` table: the demarcated area assigned to a congregation."""

from typing import TYPE_CHECKING
from uuid import UUID

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.block import Block
    from app.models.congregation import Congregation


class Territory(Base, EntityMixin):
    """A contiguous area a congregation works, holding the numbered blocks inside it.

    `boundary` is a plain POLYGON (never MULTIPOLYGON): a region split in disconnected
    parts is modelled as separate territories. The column is `geometry`, not
    `geography`, because every rule about it is a topological predicate
    (`ST_Within`, `ST_Touches`, `ST_Intersects`) and PostGIS only offers those for
    `geometry`. Area or distance in metres is obtained with an explicit
    `::geography` cast at query time.
    """

    __tablename__ = "territories"
    __table_args__ = (
        # A territory name is how the admin refers to the area out loud, so it has to
        # be unambiguous within the congregation - but two congregations naming their
        # territories "Centro" is expected, not a clash.
        UniqueConstraint("congregation_id", "name", name="uq_territories_congregation_name"),
    )

    congregation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("congregations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    boundary: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )

    congregation: Mapped["Congregation"] = relationship(back_populates="territories")
    blocks: Mapped[list["Block"]] = relationship(
        back_populates="territory",
        cascade="all, delete-orphan",
        # The FK already carries ON DELETE CASCADE, so let the database remove the
        # blocks in one statement instead of the ORM loading and deleting them one
        # by one.
        passive_deletes=True,
    )
