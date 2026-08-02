"""Business rules of the block: the numbered outline that is the unit of field work."""

# `list` is one of this service's methods, which shadows the builtin inside the class
# body. Postponing annotation evaluation keeps `list[Block]` readable as a type
# instead of resolving to the method at class-creation time.
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from app.core.exceptions import (
    BlockOutsideTerritoryError,
    BlockOverlapError,
    DuplicateBlockNumberError,
    NotFoundError,
)
from app.core.geo import LatLng, points_to_wkt, validate_polygon, wkt_to_points
from app.models.block import Block
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository


class BlockService:
    """Everything the admin can do to a block, always inside one congregation.

    A block has no congregation of its own: it belongs to a territory, and the
    territory belongs to the congregation. Every method therefore starts by
    resolving one of the two against the `congregation_id` taken from the caller's
    token, which is the only thing keeping one congregation from drawing inside
    another's area.

    The geometric rules are not evaluated here: `create` and `update` hand a WKT
    ring to the repository and let PostGIS answer whether it leaves the territory or
    invades a sibling. This layer decides what those answers *mean* to the admin.
    """

    def __init__(
        self,
        blocks: BlockRepository,
        territories: TerritoryRepository,
        now_provider: Callable[[], datetime],
    ) -> None:
        self._blocks = blocks
        self._territories = territories
        # Held, not yet read: `created_at` is stamped by the database and
        # `last_worked_at` is written by the work-log service, so drawing a block
        # never needs the time. It is in the constructor so every service is built
        # the same way by the routers, and so any future rule reads an injected
        # clock rather than reaching for `datetime.now()`.
        self._now_provider = now_provider

    def create(
        self,
        congregation_id: UUID,
        territory_id: UUID,
        points: list[LatLng],
        number: int | None = None,
    ) -> Block:
        """Draw a new block inside a territory of this congregation.

        `number` left out means "you choose": the server suggests the lowest free
        integer of the territory. Sent, the admin's choice wins -- the numbering
        usually already exists on paper and the system records it, it does not
        impose its own.
        """
        self._require_territory(congregation_id, territory_id)
        validate_polygon(points)
        wkt = points_to_wkt(points)
        if number is None:
            number = self._blocks.next_free_number(territory_id)
        else:
            self._refuse_duplicate_number(territory_id, number)
        self._refuse_outside_territory(territory_id, wkt)
        self._refuse_overlap(territory_id, wkt)
        return self._blocks.create(territory_id, number, wkt)

    def list(self, congregation_id: UUID, territory_id: UUID) -> list[Block]:
        """Every block of one territory of this congregation, in numeric order."""
        self._require_territory(congregation_id, territory_id)
        return self._blocks.list_by_territory(territory_id)

    def update(
        self,
        congregation_id: UUID,
        block_id: UUID,
        *,
        number: int | None = None,
        points: list[LatLng] | None = None,
    ) -> Block:
        """Renumber a block, redraw it, or both. `None` means "leave as it is"."""
        block = self._require_block(congregation_id, block_id)

        # A PATCH that resends the current number is not a renumbering, so it must
        # not be judged against the block's own row.
        if number is not None and number != block.number:
            self._refuse_duplicate_number(block.territory_id, number)

        wkt = None
        if points is not None:
            validate_polygon(points)
            wkt = points_to_wkt(points)
            self._refuse_outside_territory(block.territory_id, wkt)
            # Excluding itself is what makes reshaping possible at all: a redrawn
            # outline almost always overlaps the one it replaces, and comparing the
            # block against its own stored polygon would reject every edit.
            self._refuse_overlap(block.territory_id, wkt, exclude_id=block.id)
        return self._blocks.update(block, number=number, wkt=wkt)

    def delete(self, congregation_id: UUID, block_id: UUID) -> None:
        """Remove a block and, with it, the record of the work done on it.

        The cascade is deliberate and lives in the schema: a work log points at a
        block that no longer exists on the map, so there is nothing left to read.
        """
        self._blocks.delete(self._require_block(congregation_id, block_id))

    def polygon_points(self, block: Block) -> list[LatLng]:
        """The stored outline as the ordered ring the admin drew."""
        return wkt_to_points(self._blocks.polygon_wkt(block))

    def _require_territory(self, congregation_id: UUID, territory_id: UUID) -> None:
        """Raise `NotFoundError` unless the territory belongs to this congregation.

        A territory of another congregation is reported as missing rather than as
        forbidden: telling the caller "you may not touch this" would already confirm
        that it exists, and the congregation boundary is the only thing separating
        the data of one tenant from another's.
        """
        if self._territories.get(congregation_id, territory_id) is None:
            raise NotFoundError

    def _require_block(self, congregation_id: UUID, block_id: UUID) -> Block:
        """One block of this congregation, or `NotFoundError`.

        The congregation is part of the lookup rather than checked afterwards, so a
        block of another congregation is never even loaded -- and is answered exactly
        like one that does not exist.
        """
        block = self._blocks.get_in_congregation(congregation_id, block_id)
        if block is None:
            raise NotFoundError
        return block

    def _refuse_outside_territory(self, territory_id: UUID, wkt: str) -> None:
        """Reject an outline that is not entirely inside the territory's demarcation.

        `ST_Within` includes the border, so a block drawn exactly over the territory
        outline is inside it, while a single vertex past the line is not -- which is
        the rule the admin is told about.
        """
        if not self._blocks.is_within_territory(territory_id, wkt):
            raise BlockOutsideTerritoryError

    def _refuse_overlap(
        self,
        territory_id: UUID,
        wkt: str,
        exclude_id: UUID | None = None,
    ) -> None:
        """Reject an outline that invades another block of the same territory.

        Only the *interiors* count: adjacent blocks are supposed to share the street
        between them, so the repository's predicate subtracts `ST_Touches` from
        `ST_Intersects`. Blocks of other territories are never compared -- the
        containment rule already keeps each one inside its own area.
        """
        if self._blocks.find_overlapping(territory_id, wkt, exclude_id=exclude_id):
            raise BlockOverlapError

    def _refuse_duplicate_number(self, territory_id: UUID, number: int) -> None:
        """Reject a number already taken inside the territory.

        The database enforces this too, but a unique violation surfaces as an
        `IntegrityError` that poisons the transaction and says nothing the admin can
        act on. Asking first turns it into an error that names the problem.

        The same number in another territory is untouched: blocks are numbered per
        territory, and every territory has its quadra 1.
        """
        if self._blocks.get_by_number(territory_id, number) is not None:
            raise DuplicateBlockNumberError
