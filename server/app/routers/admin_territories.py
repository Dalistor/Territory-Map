"""Admin routes for territories: draw, list, read, redraw, remove.

Every route here is behind `current_congregation`, and the congregation it resolves
is the only tenant these endpoints can reach. That is why no path or body in this
module carries a `congregation_id`: accepting one would make the isolation between
congregations a matter of the client sending the right value.

A territory of another congregation is answered 404 and not 403 -- the service
raises `NotFoundError` for "does not exist" and "is not yours" alike, so the reply
never confirms that the id names a real area somewhere else.

None of the geometric rules live here. The router converts the wire's `(lat, lng)`
pairs into the domain's `LatLng`, hands them to the service and turns whatever comes
back into a DTO; an invalid drawing, an overlap or a block left outside a redrawn
boundary arrive as domain errors and are translated once, in `app/main.py`.

This module is also the composition root of the two geographic services, because the
detail endpoint needs both: `get_block_service` and `block_out` are defined here and
imported by `app/routers/admin_blocks.py`, so a block is assembled the same way
whether it is read inside its territory or written on its own.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import current_congregation
from app.core.geo import LatLng
from app.models.block import Block
from app.models.congregation import Congregation
from app.models.territory import Territory
from app.repositories.block import BlockRepository
from app.repositories.territory import TerritoryRepository
from app.routers.auth import utc_now
from app.schemas.block import BlockOut
from app.schemas.geo import LatLngIn, LatLngOut
from app.schemas.territory import TerritoryCreateIn, TerritoryOut, TerritoryPatchIn
from app.services.block import BlockService
from app.services.territory import TerritoryService

router = APIRouter(prefix="/admin/territories", tags=["admin: territories"])

DbSession = Annotated[Session, Depends(get_session)]
AdminCongregation = Annotated[Congregation, Depends(current_congregation)]


def get_territory_service(session: DbSession) -> TerritoryService:
    """Build the territory service on the request's session and the real clock."""
    return TerritoryService(
        territories=TerritoryRepository(session),
        blocks=BlockRepository(session),
        now_provider=utc_now,
    )


def get_block_service(session: DbSession) -> BlockService:
    """Build the block service on the request's session and the real clock."""
    return BlockService(
        blocks=BlockRepository(session),
        territories=TerritoryRepository(session),
        now_provider=utc_now,
    )


Territories = Annotated[TerritoryService, Depends(get_territory_service)]
Blocks = Annotated[BlockService, Depends(get_block_service)]


def to_points(ring: list[LatLngIn]) -> list[LatLng]:
    """Turn the ring a client drew into the domain's positions.

    The DTO and the domain both order the pair `(lat, lng)`, so nothing is swapped
    here -- the only place the order changes is `app/core/geo.py`, on the way to WKT.
    """
    return [LatLng(lat=point.lat, lng=point.lng) for point in ring]


def to_ring_out(points: list[LatLng]) -> list[LatLngOut]:
    """Turn the domain's positions back into the ring the client reads."""
    return [LatLngOut(lat=point.lat, lng=point.lng) for point in points]


def block_out(blocks: BlockService, block: Block) -> BlockOut:
    """A block as the clients read it, outline included.

    The polygon is asked of the service rather than taken off the model, so the
    stored geometry (WKB, or the `WKTElement` still attached right after a write) is
    decoded in exactly one place.
    """
    return BlockOut(
        id=block.id,
        number=block.number,
        polygon=to_ring_out(blocks.polygon_points(block)),
        last_worked_at=block.last_worked_at,
    )


def territory_out(
    territories: TerritoryService,
    territory: Territory,
    blocks: list[BlockOut] | None = None,
) -> TerritoryOut:
    """A territory as the admin reads it, with its blocks only where they are asked for.

    The listing leaves `blocks` empty on purpose: an admin opening the map wants the
    areas, and loading every outline of every territory would make the cheapest screen
    the most expensive one.
    """
    return TerritoryOut(
        id=territory.id,
        name=territory.name,
        boundary=to_ring_out(territories.boundary_points(territory)),
        blocks=blocks if blocks is not None else [],
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_territory(
    payload: TerritoryCreateIn,
    congregation: AdminCongregation,
    territories: Territories,
) -> TerritoryOut:
    """Draw a new territory for the caller's congregation."""
    territory = territories.create(congregation.id, payload.name, to_points(payload.boundary))
    return territory_out(territories, territory)


@router.get("")
def list_territories(
    congregation: AdminCongregation,
    territories: Territories,
) -> list[TerritoryOut]:
    """Every territory of the caller's congregation, and nobody else's."""
    return [territory_out(territories, item) for item in territories.list(congregation.id)]


@router.get("/{territory_id}")
def get_territory(
    territory_id: UUID,
    congregation: AdminCongregation,
    territories: Territories,
    blocks: Blocks,
) -> TerritoryOut:
    """One territory with the blocks drawn inside it.

    This is the screen the admin edits on, so the outlines come along: the map cannot
    be drawn from the boundary alone.
    """
    territory = territories.get(congregation.id, territory_id)
    drawn = blocks.list(congregation.id, territory_id)
    return territory_out(territories, territory, [block_out(blocks, block) for block in drawn])


@router.patch("/{territory_id}")
def patch_territory(
    territory_id: UUID,
    payload: TerritoryPatchIn,
    congregation: AdminCongregation,
    territories: Territories,
) -> TerritoryOut:
    """Rename a territory, redraw it, or both. A field left out is untouched."""
    territory = territories.update(
        congregation.id,
        territory_id,
        name=payload.name,
        points=to_points(payload.boundary) if payload.boundary is not None else None,
    )
    return territory_out(territories, territory)


@router.delete("/{territory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_territory(
    territory_id: UUID,
    congregation: AdminCongregation,
    territories: Territories,
) -> Response:
    """Remove a territory and, by cascade, every block drawn inside it."""
    territories.delete(congregation.id, territory_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
