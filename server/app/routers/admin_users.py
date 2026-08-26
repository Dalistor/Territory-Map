"""Admin routes for publishers: register, list, re-issue the code, revoke.

Every route here is behind `current_congregation`, and the congregation it resolves
is the only tenant these endpoints can reach. That is why no path or body in this
module carries a `congregation_id`: accepting one would make the isolation between
congregations a matter of the client sending the right value.

A publisher of another congregation is answered 404 and not 403 -- the service
raises `NotFoundError` for "does not exist" and "is not yours" alike, so the reply
never confirms that the id names a real person somewhere else.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.core.deps import current_congregation
from app.models.congregation import Congregation
from app.routers.auth import get_user_service
from app.schemas.user import AccessCodeOut, UserCreateIn, UserOut, UserPatchIn
from app.services.user import UserService

router = APIRouter(prefix="/admin/users", tags=["admin: users"])

AdminCongregation = Annotated[Congregation, Depends(current_congregation)]
# Same service, same clock, wired once in `app.routers.auth` -- the publisher's
# lifecycle is one service whether the caller is the admin or the phone.
Users = Annotated[UserService, Depends(get_user_service)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateIn,
    congregation: AdminCongregation,
    users: Users,
) -> UserOut:
    """Register a publisher and return them with the code to hand over.

    This is the only moment the admin is shown a brand-new code without asking for
    one, so the response carries it -- `UserOut` exposes `access_code` precisely
    because the admin's screen is where it is meant to be read.
    """
    return UserOut.model_validate(users.create(congregation.id, payload.name))


@router.get("")
def list_users(congregation: AdminCongregation, users: Users) -> list[UserOut]:
    """Every publisher of the caller's congregation, and nobody else's."""
    return [UserOut.model_validate(user) for user in users.list(congregation.id)]


@router.post("/{user_id}/access-code")
def regenerate_access_code(
    user_id: UUID,
    congregation: AdminCongregation,
    users: Users,
) -> AccessCodeOut:
    """Mint a new code for an existing publisher; the previous one dies at once.

    The path to a new phone, a reinstall, or a code that was lost or expired.
    """
    return AccessCodeOut.model_validate(users.regenerate_code(congregation.id, user_id))


@router.patch("/{user_id}")
def patch_user(
    user_id: UUID,
    payload: UserPatchIn,
    congregation: AdminCongregation,
    users: Users,
) -> UserOut:
    """Rename a publisher, turn their access on or off, or both.

    A field the body leaves out is not touched. The work history is untouched
    either way -- including by a rename, since those rows carry the name copied
    when they were written.
    """
    return UserOut.model_validate(
        users.update(
            congregation.id,
            user_id,
            name=payload.name,
            is_active=payload.is_active,
        )
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    congregation: AdminCongregation,
    users: Users,
) -> Response:
    """Take a publisher off the congregation for good.

    Not the same button as `PATCH {"is_active": false}`, and both exist on purpose:
    deactivating revokes the app access of somebody who stays on the list, while this
    removes the person and leaves only their trace in the history -- the work logs and
    the closed assignments keep naming them, because each of those rows carries the
    name copied in when it was written.

    A publisher who still holds a territory is refused with 409: the request is well
    formed and it is the present state that forbids it, and closing the stint for them
    would stamp a completion date on the S-13 card that nobody stated.
    """
    users.delete(congregation.id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
