"""The Congregation entity -- the tenant every other row hangs from."""

from typing import TYPE_CHECKING

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.territory import Territory
    from app.models.user import User


class Congregation(Base, EntityMixin):
    """A congregation. Owns its users and its territories, and nothing crosses over.

    Multi-tenancy in this system is `congregation_id` on every row, always derived
    from the token, so this table is the root of the ownership graph.
    """

    __tablename__ = "congregations"
    __table_args__ = (
        # Two congregations may share a name as long as they are in different
        # cities -- the pair is what identifies one, and it is also what the admin
        # types at login.
        UniqueConstraint("name", "city", name="uq_congregations_name_city"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    # bcrypt digest. Never selected into a DTO, never logged.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    users: Mapped[list["User"]] = relationship(
        back_populates="congregation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    territories: Mapped[list["Territory"]] = relationship(
        back_populates="congregation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
