"""Data access for `Territory`, including the overlap query that guards demarcation."""

from uuid import UUID

from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from sqlalchemy import func, not_, select
from sqlalchemy.orm import Session

from app.models.territory import Territory

# Every geometry that crosses this layer is WGS84. Named once so the constant cannot
# drift away from the SRID declared on the columns.
SRID = 4326


class TerritoryRepository:
    """Queries over the `territories` table.

    Geometry enters as WKT (`app.core.geo.points_to_wkt`) and reaches the database as
    `ST_GeomFromText(:wkt, 4326)` -- which is what `WKTElement(wkt, srid=4326)`
    compiles to. It leaves as WKT again through `boundary_wkt`, so no caller above
    this layer ever handles a WKB blob or a Shapely object.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, congregation_id: UUID, territory_id: UUID) -> Territory | None:
        """Fetch one territory *of this congregation*, or `None`.

        The congregation is part of the lookup rather than checked afterwards: a
        territory of another congregation must be indistinguishable from one that does
        not exist, and the cheapest way to guarantee that is to never load it.
        """
        return self.session.scalars(
            select(Territory).where(
                Territory.congregation_id == congregation_id,
                Territory.id == territory_id,
            )
        ).one_or_none()

    def get_by_name(self, congregation_id: UUID, name: str) -> Territory | None:
        """Fetch the territory with this name inside the congregation, or `None`."""
        return self.session.scalars(
            select(Territory).where(
                Territory.congregation_id == congregation_id,
                Territory.name == name,
            )
        ).one_or_none()

    def list_by_congregation(self, congregation_id: UUID) -> list[Territory]:
        """Every territory of the congregation, ordered by name."""
        return list(
            self.session.scalars(
                select(Territory)
                .where(Territory.congregation_id == congregation_id)
                .order_by(Territory.name)
            )
        )

    def create(self, congregation_id: UUID, name: str, wkt: str) -> Territory:
        """Insert a territory and flush, so the caller gets its generated id."""
        territory = Territory(
            congregation_id=congregation_id,
            name=name,
            boundary=WKTElement(wkt, srid=SRID),
        )
        self.session.add(territory)
        self.session.flush()
        return territory

    def update(
        self,
        territory: Territory,
        *,
        name: str | None = None,
        wkt: str | None = None,
    ) -> Territory:
        """Change the name, the boundary or both. `None` means "leave as it is".

        Neither field is nullable in the schema, so `None` is free to mean "untouched"
        and a partial `PATCH` maps onto this without a sentinel value.
        """
        if name is not None:
            territory.name = name
        if wkt is not None:
            territory.boundary = WKTElement(wkt, srid=SRID)
        self.session.flush()
        return territory

    def delete(self, territory: Territory) -> None:
        """Remove the territory; the FK cascade takes its blocks and their logs."""
        self.session.delete(territory)
        self.session.flush()

    def find_overlapping(
        self,
        congregation_id: UUID,
        wkt: str,
        exclude_id: UUID | None = None,
    ) -> list[Territory]:
        """Territories of this congregation whose area the given ring invades.

        Sharing a border is how adjacent territories are supposed to be drawn, so
        merely touching must not count as a conflict. `ST_Intersects` alone would
        report it, because a shared edge is an intersection; subtracting `ST_Touches`
        leaves exactly the cases where the *interiors* meet -- real overlap.

        `exclude_id` keeps a territory from colliding with its own stored boundary
        when the admin is editing it.

        Territories of other congregations are never compared: two congregations may
        legitimately cover the same streets.
        """
        geometry = WKTElement(wkt, srid=SRID)
        statement = select(Territory).where(
            Territory.congregation_id == congregation_id,
            func.ST_Intersects(Territory.boundary, geometry),
            not_(func.ST_Touches(Territory.boundary, geometry)),
        )
        if exclude_id is not None:
            statement = statement.where(Territory.id != exclude_id)
        return list(self.session.scalars(statement.order_by(Territory.name)))

    def boundary_wkt(self, territory: Territory) -> str:
        """The boundary of a loaded territory as WKT, with no extra round trip.

        The stored representation (WKB, or the `WKTElement` still attached right after
        an insert) stops here: callers speak the same WKT that `app.core.geo` reads.
        """
        return to_shape(territory.boundary).wkt
