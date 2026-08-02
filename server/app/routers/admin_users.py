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

from fastapi import APIRouter, Depends, status

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
    """Turn a publisher's access on or off. Their work history is untouched."""
    return UserOut.model_validate(users.set_active(congregation.id, user_id, payload.is_active))
