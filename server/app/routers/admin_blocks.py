"""Admin routes for blocks and for the history of work done on them.

A block has no congregation of its own: it belongs to a territory, and the territory
belongs to the congregation. The tenant therefore never appears in a path here
either -- it comes from the admin's token and the services resolve the block through
it, so a block of another congregation is answered 404 exactly like one that never
existed.

Two paths are grouped in this module rather than split by prefix: creating a block
hangs off its territory (`/admin/territories/{id}/blocks`), while everything after
that addresses the block itself. Keeping them together is what lets the whole
lifecycle of a block be read in one file; the routes carry their full paths and the
router declares no prefix.

Deleting a work log lives here too. It is the admin's correction of the history the
app can only append to, and it is the same aggregate: removing a visit is what makes
`last_worked_at` fall back to the previous one.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.repositories.block import BlockRepository
from app.repositories.block_work_log import BlockWorkLogRepository
from app.routers.admin_territories import AdminCongregation, Blocks, block_out, to_points
from app.routers.auth import utc_now
from app.schemas.block import BlockCreateIn, BlockOut, BlockPatchIn
from app.schemas.work_log import WorkLogOut
from app.services.work_log import WorkLogService

router = APIRouter(tags=["admin: blocks"])

DbSession = Annotated[Session, Depends(get_session)]


def get_work_log_service(session: DbSession) -> WorkLogService:
    """Build the work-log service on the request's session and the real clock."""
    return WorkLogService(
        work_logs=BlockWorkLogRepository(session),
        blocks=BlockRepository(session),
        now_provider=utc_now,
    )


WorkLogs = Annotated[WorkLogService, Depends(get_work_log_service)]


@router.post("/admin/territories/{territory_id}/blocks", status_code=status.HTTP_201_CREATED)
def create_block(
    territory_id: UUID,
    payload: BlockCreateIn,
    congregation: AdminCongregation,
    blocks: Blocks,
) -> BlockOut:
    """Draw a block inside one of the caller's territories.

    `number` left out means "you choose": the service suggests the lowest free integer
    of the territory. Sent, the admin's choice wins -- the numbering usually already
    exists on paper, and the system records it instead of imposing its own.
    """
    block = blocks.create(
        congregation.id,
        territory_id,
        to_points(payload.polygon),
        payload.number,
    )
    return block_out(blocks, block)


@router.patch("/admin/blocks/{block_id}")
def patch_block(
    block_id: UUID,
    payload: BlockPatchIn,
    congregation: AdminCongregation,
    blocks: Blocks,
) -> BlockOut:
    """Renumber a block, reshape it, or both. A field left out is untouched."""
    block = blocks.update(
        congregation.id,
        block_id,
        number=payload.number,
        points=to_points(payload.polygon) if payload.polygon is not None else None,
    )
    return block_out(blocks, block)


@router.delete("/admin/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(
    block_id: UUID,
    congregation: AdminCongregation,
    blocks: Blocks,
) -> Response:
    """Remove a block and, by cascade, the record of the work done on it."""
    blocks.delete(congregation.id, block_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/blocks/{block_id}/work-logs")
def list_work_logs(
    block_id: UUID,
    congregation: AdminCongregation,
    work_logs: WorkLogs,
) -> list[WorkLogOut]:
    """The visits recorded for one block, most recent first.

    Each entry names the publisher, which is the whole point of the individual access
    code: the admin always knows who covered what.
    """
    return [
        WorkLogOut.model_validate(log) for log in work_logs.list_by_block(congregation.id, block_id)
    ]


@router.delete("/admin/work-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_log(
    log_id: UUID,
    congregation: AdminCongregation,
    work_logs: WorkLogs,
) -> Response:
    """Remove one recorded visit. The app can only add; correcting is the admin's job.

    Whatever the removal does to the block's `last_worked_at` follows from the logs
    that remain -- the service recomputes it, nothing is undone by hand.
    """
    work_logs.delete(congregation.id, log_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
