"""Admin routes for the assignment history of a territory -- the S-13 card.

Everything here hangs off `/admin/territories/{territory_id}/assignments`, because an
assignment has no life of its own: it is a dated stretch of responsibility over one
territory, and the territory is what belongs to the congregation. The tenant is never
in the path -- it comes from the admin's token -- so an id from another congregation
is answered 404 exactly like one that names nothing.

The four routes are the whole lifecycle of a card row: read the history, open a new
stint, close the one in force, and erase a record that should not have been written.
Closing and erasing are deliberately different operations: `complete` keeps the row as
history with its completion date, while `delete` removes it.

No rule lives here. Which stint gets closed when a territory is handed over, and what
happens to `Territory.assigned_user_id` afterwards, is `AssignmentService`'s business;
this module resolves the session, names the clock and turns models into DTOs.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository
from app.routers.admin_territories import AdminCongregation
from app.routers.auth import utc_now
from app.schemas.assignment import AssignmentCreateIn, AssignmentOut
from app.services.assignment import AssignmentService

router = APIRouter(
    prefix="/admin/territories/{territory_id}/assignments", tags=["admin: assignments"]
)

DbSession = Annotated[Session, Depends(get_session)]


def get_assignment_service(session: DbSession) -> AssignmentService:
    """Build the assignment service on the request's session and the real clock."""
    return AssignmentService(
        assignments=TerritoryAssignmentRepository(session),
        territories=TerritoryRepository(session),
        users=UserRepository(session),
        now_provider=utc_now,
    )


Assignments = Annotated[AssignmentService, Depends(get_assignment_service)]


@router.get("")
def list_assignments(
    territory_id: UUID,
    congregation: AdminCongregation,
    assignments: Assignments,
) -> list[AssignmentOut]:
    """The territory's card: every stint, most recent first.

    The open one -- the row with no `completed_at` -- comes on top, which is the
    order the paper card is read in and the order the admin panel shows.
    """
    return [
        AssignmentOut.model_validate(assignment)
        for assignment in assignments.list(congregation.id, territory_id)
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def designate_assignment(
    territory_id: UUID,
    payload: AssignmentCreateIn,
    congregation: AdminCongregation,
    assignments: Assignments,
) -> AssignmentOut:
    """Hand the territory to a publisher, starting now.

    201 because a row is added to the history even when somebody was already
    responsible: the stint in force is closed at this same moment by the service, so
    changing dirigente stays the single click it is today.
    """
    assignment = assignments.designate(congregation.id, territory_id, payload.user_id)
    return AssignmentOut.model_validate(assignment)


@router.post("/complete")
def complete_assignment(
    territory_id: UUID,
    congregation: AdminCongregation,
    assignments: Assignments,
) -> AssignmentOut:
    """Close the stint in force and give the territory back.

    The row just closed is what comes back, completion date included, so the admin
    sees the dates that were written instead of having to re-read the card. A
    territory with nothing open is a 404: there is no stint to address.
    """
    assignment = assignments.complete(congregation.id, territory_id)
    return AssignmentOut.model_validate(assignment)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    territory_id: UUID,  # unused on purpose -- see the docstring
    assignment_id: UUID,
    congregation: AdminCongregation,
    assignments: Assignments,
) -> Response:
    """Erase one record from the history, as if it had never been written.

    `territory_id` is not passed on to the service: an assignment id is already
    filtered by the congregation of the token in a single statement, so the territory
    would be a redundant check. It stays in the path anyway because a record is
    addressed where it is read -- splitting the deletion off to
    `/admin/assignments/{id}` would give the same resource two addresses.
    """
    assignments.delete(congregation.id, assignment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
