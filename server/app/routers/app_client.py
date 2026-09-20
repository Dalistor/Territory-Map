"""The whole surface the Android app talks to: read the map, mark a block worked.

Two verbs, and that is the point. The phone's token never expires, so the smaller
the set of things it can reach, the smaller the damage a stolen device does -- the
app reads its congregation's map and appends to the work log, and there is no third
verb. Unmarking, redrawing, renumbering and registering people all live behind
`current_congregation` in the `/admin/*` routers, which this token cannot satisfy.
`GET /app/worked-territories` is still the read verb, just a different projection of
the same log -- the dashboard's "where have I been" next to the map's "where can I go".

Every route takes the congregation from `current_app_user`, never from the request:
the publisher's row decides which map they see, so there is no path or body here in
which a client could name someone else's data.
"""

from datetime import datetime
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
from app.repositories.user import UserRepository
from app.routers.auth import utc_now
from app.routers.history_dto import with_user
from app.schemas.block import BlockOut
from app.schemas.geo import LatLngOut
from app.schemas.territory import LastWorkOut, TerritoryOut
from app.schemas.user import UserBriefOut
from app.schemas.work_log import (
    PublisherWorkHistoryItemOut,
    WorkedIn,
    WorkedTerritoryOut,
    WorkLogOut,
)
from app.services.block import BlockService
from app.services.territory import TerritoryService
from app.services.work_log import WorkLogService

router = APIRouter(prefix="/app", tags=["app"])

DbSession = Annotated[Session, Depends(get_session)]


def get_territory_service(session: DbSession) -> TerritoryService:
    return TerritoryService(
        TerritoryRepository(session),
        BlockRepository(session),
        BlockWorkLogRepository(session),
        utc_now,
    )


def get_block_service(session: DbSession) -> BlockService:
    return BlockService(BlockRepository(session), TerritoryRepository(session), utc_now)


def get_work_log_service(session: DbSession) -> WorkLogService:
    return WorkLogService(
        work_logs=BlockWorkLogRepository(session),
        blocks=BlockRepository(session),
        users=UserRepository(session),
        now_provider=utc_now,
    )


AppUser = Annotated[User, Depends(current_app_user)]
Territories = Annotated[TerritoryService, Depends(get_territory_service)]
Blocks = Annotated[BlockService, Depends(get_block_service)]
WorkLogs = Annotated[WorkLogService, Depends(get_work_log_service)]


def _block_out(block: Block, blocks: BlockService) -> BlockOut:
    """One block as the phone draws it: its number, its outline, its last visit.

    The geometry is read through the service rather than off the column, so the WKT
    and the `(lng, lat)` order stop one layer below and this module only ever handles
    named `lat`/`lng` pairs.

    `status_override` travels for the same reason `last_worked_at` and the
    territory's `rotation_days` do: the phone works out the colour of every block on
    its own, from the cache, with no server to ask. Leaving the pin out would make
    the block the admin marked overdue look untouched on the only screen that is
    actually taken into the field.
    """
    return BlockOut(
        id=block.id,
        number=block.number,
        polygon=[LatLngOut.model_validate(point) for point in blocks.polygon_points(block)],
        last_worked_at=block.last_worked_at,
        status_override=block.status_override,
    )


def _territory_out(
    territory: Territory,
    congregation_id: UUID,
    territories: TerritoryService,
    blocks: BlockService,
    last_work: tuple[UUID, str, datetime] | None = None,
) -> TerritoryOut:
    """One territory with the blocks drawn inside it, ready to be cached offline.

    `rotation_days` rides along for the same reason `last_worked_at` does: the phone
    decides the colour of every block on its own, from the cache, with no server to
    ask -- and the threshold that turns a block overdue is per territory. Null means
    the app falls back to its own default cycle.
    """
    return TerritoryOut(
        id=territory.id,
        name=territory.name,
        boundary=[
            LatLngOut.model_validate(point) for point in territories.boundary_points(territory)
        ],
        blocks=[_block_out(block, blocks) for block in blocks.list(congregation_id, territory.id)],
        assigned_user=UserBriefOut.model_validate(territory.assigned_user)
        if territory.assigned_user
        else None,
        rotation_days=territory.rotation_days,
        last_work=(
            LastWorkOut(
                user=UserBriefOut(id=last_work[0], name=last_work[1]),
                worked_at=last_work[2],
            )
            if last_work
            else None
        ),
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
    latest_work = territories.latest_work_by_territory(user.congregation_id)
    return [
        _territory_out(
            territory,
            user.congregation_id,
            territories,
            blocks,
            last_work=latest_work.get(territory.id),
        )
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
    return WorkLogOut.model_validate(with_user(log))


@router.get("/worked-territories")
def list_worked_territories(user: AppUser, work_logs: WorkLogs) -> list[WorkedTerritoryOut]:
    """Every territory this publisher has worked in, for the app's dashboard list.

    Only territories with at least one log of this publisher's own show up here --
    the point is "where have I been", not the congregation's whole map, which
    `GET /app/territories` already answers.
    """
    return [
        WorkedTerritoryOut(id=territory_id, name=name, last_worked_at=last_worked_at)
        for territory_id, name, last_worked_at in work_logs.list_worked_territories(user)
    ]


@router.get("/work-history")
def list_work_history(
    user: AppUser,
    work_logs: WorkLogs,
) -> list[PublisherWorkHistoryItemOut]:
    """The publisher's detailed log of worked blocks, most recent first."""
    return [
        PublisherWorkHistoryItemOut(
            id=log.id,
            block_id=log.block_id,
            block_number=block_number,
            territory_id=territory_id,
            territory_name=territory_name,
            worked_at=log.worked_at,
            created_at=log.created_at,
        )
        for log, block_number, territory_id, territory_name in work_logs.list_user_history(user)
    ]
