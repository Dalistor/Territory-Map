"""The whole surface the Android app talks to: read the map, mark a block worked.

Two routes, and that is the point. The phone's token never expires, so the smaller
the set of things it can reach, the smaller the damage a stolen device does -- the
app reads its congregation's map and appends to the work log, and there is no third
verb. Unmarking, redrawing, renumbering and registering people all live behind
`current_congregation` in the `/admin/*` routers, which this token cannot satisfy.

Both routes take the congregation from `current_app_user`, never from the request:
the publisher's row decides which map they see, so there is no path or body here in
which a client could name someone else's data.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import current_app_user
from app.models.block import Block
from app.models.territory import Territory
from app.models.user import User
from app.repositories.block import BlockRepository
from app.repositories.block_work_log import BlockWorkLogRepository
from app.repositories.territory import TerritoryRepository
from app.routers.auth import utc_now
from app.schemas.block import BlockOut
from app.schemas.geo import LatLngOut
from app.schemas.territory import TerritoryOut
from app.schemas.work_log import WorkedIn, WorkLogOut
from app.services.block import BlockService
from app.services.territory import TerritoryService
from app.services.work_log import WorkLogService

router = APIRouter(prefix="/app", tags=["app"])

DbSession = Annotated[Session, Depends(get_session)]


def get_territory_service(session: DbSession) -> TerritoryService:
    return TerritoryService(TerritoryRepository(session), BlockRepository(session), utc_now)


def get_block_service(session: DbSession) -> BlockService:
    return BlockService(BlockRepository(session), TerritoryRepository(session), utc_now)


def get_work_log_service(session: DbSession) -> WorkLogService:
    return WorkLogService(BlockWorkLogRepository(session), BlockRepository(session), utc_now)


AppUser = Annotated[User, Depends(current_app_user)]
Territories = Annotated[TerritoryService, Depends(get_territory_service)]
Blocks = Annotated[BlockService, Depends(get_block_service)]
WorkLogs = Annotated[WorkLogService, Depends(get_work_log_service)]


def _block_out(block: Block, blocks: BlockService) -> BlockOut:
    """One block as the phone draws it: its number, its outline, its last visit.

    The geometry is read through the service rather than off the column, so the WKT
    and the `(lng, lat)` order stop one layer below and this module only ever handles
    named `lat`/`lng` pairs.
    """
    return BlockOut(
        id=block.id,
        number=block.number,
        polygon=[LatLngOut.model_validate(point) for point in blocks.polygon_points(block)],
        last_worked_at=block.last_worked_at,
    )


def _territory_out(
    territory: Territory,
    congregation_id: UUID,
    territories: TerritoryService,
    blocks: BlockService,
) -> TerritoryOut:
    """One territory with the blocks drawn inside it, ready to be cached offline."""
    return TerritoryOut(
        id=territory.id,
        name=territory.name,
        boundary=[
            LatLngOut.model_validate(point) for point in territories.boundary_points(territory)
        ],
        blocks=[_block_out(block, blocks) for block in blocks.list(congregation_id, territory.id)],
    )


@router.get("/territories")
def list_territories(
    user: AppUser,
    territories: Territories,
    blocks: Blocks,
) -> list[TerritoryOut]:
    """The congregation's whole map: every territory, with its numbered blocks.

    Sent complete rather than paginated because the app caches it to work with no
    signal in the field -- a partial answer would be a partial map. `last_worked_at`
    rides along on every block: it is the number that decides where the congregation
    goes today, and the phone must be able to show it offline.
    """
    return [
        _territory_out(territory, user.congregation_id, territories, blocks)
        for territory in territories.list(user.congregation_id)
    ]


@router.post("/blocks/{block_id}/worked", status_code=status.HTTP_201_CREATED)
def mark_block_worked(
    block_id: UUID,
    payload: WorkedIn,
    user: AppUser,
    work_logs: WorkLogs,
    response: Response,
) -> WorkLogOut:
    """Record that this publisher finished this block, and say whether it is new.

    201 for a visit stored now, 200 for a `log_id` the server already had. The
    distinction exists for the offline queue: a marking made without signal is sent
    again on the next sync, and a phone that gets 200 knows the visit is safely
    recorded and can drop it from the queue instead of retrying forever. The service
    owns the idempotency; this route only turns its answer into a status code.

    A block of another congregation raises `NotFoundError` and comes back as 404,
    never 403 -- 403 would confirm that the id names a real block somewhere.
    """
    log, created = work_logs.mark_worked(payload.log_id, block_id, user, payload.worked_at)
    if not created:
        response.status_code = status.HTTP_200_OK
    return WorkLogOut.model_validate(log)
