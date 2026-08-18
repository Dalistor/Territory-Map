"""Business rules of the territory: the demarcated area a congregation works."""

# `list` is one of this service's methods, which shadows the builtin inside the class
# body. Postponing annotation evaluation keeps `list[Territory]` readable as a type
# instead of resolving to the method at class-creation time.
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from app.core.exceptions import (
    BlockOutsideTerritoryError,
    DuplicateNameError,
    NotFoundError,
    TerritoryOverlapError,
)
from app.core.geo import LatLng, points_to_wkt, validate_polygon, wkt_to_points
from app.models.territory import Territory
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository


def _join_numbers(numbers: list[int]) -> str:
    """Render block numbers the way the admin would read them out: "3, 7 e 12"."""
    head = ", ".join(str(number) for number in numbers[:-1])
    return f"{head} e {numbers[-1]}"


class TerritoryService:
    """Everything the admin can do to a territory, always inside one congregation.

    Every method takes the `congregation_id` from the caller's token and scopes the
    work to it, so a territory of another congregation is never read, edited or
    deleted -- and never even acknowledged as existing.

    The geometric rules are not evaluated here: `create` and `update` hand a WKT ring
    to the repository and let PostGIS answer whether it invades a neighbour or leaves
    a block behind. This layer decides what those answers *mean* to the admin.
    """

    def __init__(
        self,
        territories: TerritoryRepository,
        blocks: BlockRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._territories = territories
        self._blocks = blocks
        # Held, not yet read: `created_at` is stamped by the database. It is part of
        # the constructor so every service is built the same way by the routers, and
        # so any future rule that needs the time reads an injected clock rather than
        # reaching for `datetime.now()` -- which is what makes it testable.
        self._now_provider = now_provider

    def create(self, congregation_id: UUID, name: str, points: list[LatLng]) -> Territory:
        """Draw a new territory for this congregation."""
        validate_polygon(points)
        wkt = points_to_wkt(points)
        self._refuse_duplicate_name(congregation_id, name)
        self._refuse_overlap(congregation_id, wkt)
        return self._territories.create(congregation_id=congregation_id, name=name, wkt=wkt)

    def get(self, congregation_id: UUID, territory_id: UUID) -> Territory:
        """One territory of this congregation, or `NotFoundError`.

        A territory of another congregation is reported as missing rather than as
        forbidden: telling the caller "you may not see this" would already confirm
        that it exists, and the congregation boundary is the only thing separating
        the data of one tenant from another's.
        """
        territory = self._territories.get(congregation_id, territory_id)
        if territory is None:
            raise NotFoundError
        return territory

    def list(self, congregation_id: UUID) -> list[Territory]:
        """Every territory of this congregation, in the order the admin reads them."""
        return self._territories.list_by_congregation(congregation_id)

    def update(
        self,
        congregation_id: UUID,
        territory_id: UUID,
        *,
        name: str | None = None,
        points: list[LatLng] | None = None,
    ) -> Territory:
        """Rename a territory, redraw it, or both. `None` means "leave as it is"."""
        territory = self.get(congregation_id, territory_id)

        # A PATCH that resends the current name is not a rename, so it must not be
        # judged against the territory's own row.
        if name is not None and name != territory.name:
            self._refuse_duplicate_name(congregation_id, name)

        wkt = None
        if points is not None:
            validate_polygon(points)
            wkt = points_to_wkt(points)
            # Excluding itself is what makes editing possible at all: a redrawn
            # outline almost always overlaps the one it replaces, and comparing the
            # territory against its own stored boundary would reject every edit.
            self._refuse_overlap(congregation_id, wkt, exclude_id=territory_id)
            self._refuse_orphaned_blocks(territory_id, wkt)

        return self._territories.update(territory, name=name, wkt=wkt)

    def delete(self, congregation_id: UUID, territory_id: UUID) -> None:
        """Remove a territory and, with it, every block drawn inside it.

        The cascade is deliberate and lives in the schema: a block outside the area
        that owns it has no meaning, so there is nothing to keep.
        """
        self._territories.delete(self.get(congregation_id, territory_id))

    def boundary_points(self, territory: Territory) -> list[LatLng]:
        """The stored demarcation as the ordered ring the admin drew.

        The router builds its DTO from this instead of touching the geometry column:
        WKT and the `(lng, lat)` order stop at this layer, so no caller above ever
        risks swapping the coordinates.
        """
        return wkt_to_points(self._territories.boundary_wkt(territory))

    def _refuse_orphaned_blocks(self, territory_id: UUID, new_boundary_wkt: str) -> None:
        """Reject a redraw that would leave existing blocks outside the territory.

        A block only means anything inside the area that owns it, so shrinking the
        demarcation past one of them is refused instead of silently orphaning it.
        The blocks are checked against the new outline *before* it is written, so a
        rejected edit changes nothing.

        The numbers go in the message because they are how the admin finds the blocks
        on the map -- "a demarcação ficou inválida" would leave them hunting.
        """
        orphaned = self._blocks.find_outside_boundary(territory_id, new_boundary_wkt)
        if not orphaned:
            return

        numbers = [block.number for block in orphaned]
        if len(numbers) == 1:
            subject = f"A quadra {numbers[0]} ficou fora"
            remedy = "mova a quadra para dentro dele"
        else:
            subject = f"As quadras {_join_numbers(numbers)} ficaram fora"
            remedy = "mova essas quadras para dentro dele"
        raise BlockOutsideTerritoryError(
            f"{subject} da nova demarcação. Ajuste o contorno do território ou {remedy}."
        )

    def _refuse_duplicate_name(self, congregation_id: UUID, name: str) -> None:
        """Reject a name already in use inside the congregation.

        The database enforces this too, but a unique violation surfaces as an
        `IntegrityError` that poisons the transaction and says nothing the admin can
        act on. Asking first turns it into an error that names the problem.

        The same name in another congregation is untouched: territories are named
        after neighbourhoods, and "Centro" exists in every city.
        """
        if self._territories.get_by_name(congregation_id, name) is not None:
            raise DuplicateNameError

    def _refuse_overlap(
        self,
        congregation_id: UUID,
        wkt: str,
        exclude_id: UUID | None = None,
    ) -> None:
        """Reject a demarcation that invades another territory of the congregation.

        Only the *interiors* count: neighbouring territories are supposed to share a
        border, so the repository's predicate subtracts `ST_Touches` from
        `ST_Intersects`. Territories of other congregations are never even queried --
        two congregations may legitimately cover the same streets.
        """
        if self._territories.find_overlapping(congregation_id, wkt, exclude_id=exclude_id):
            raise TerritoryOverlapError
