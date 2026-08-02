"""The User entity -- a publisher, always created by the admin, never by the app."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin

if TYPE_CHECKING:
    from app.models.congregation import Congregation


class User(Base, EntityMixin):
    """A publisher of a congregation.

    There is no self-signup: the admin registers the name, the server mints a
    single-use `access_code`, and the publisher redeems it once from the phone.
    What lasts is the app token stored on the device -- the code is wiped from the
    row the moment it is redeemed.
    """

    __tablename__ = "users"
    __table_args__ = (
        # The access code is unique *globally* (it alone identifies the
        # congregation), but only while it exists. A plain unique constraint would
        # collapse on the many rows whose code is NULL after redemption in
        # databases that treat NULLs as equal, and it would index dead space here;
        # the partial index constrains exactly the live codes.
        Index(
            "uq_users_access_code",
            "access_code",
            unique=True,
            postgresql_where=text("access_code IS NOT NULL"),
        ),
    )

    congregation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("congregations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Credential, not identifier: short, readable, single-use, and NULL once spent
    # or expired. Never put it in a URL, a log or an error message.
    access_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    access_code_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # NULL until the first code is redeemed; rewritten on every later redemption.
    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Bumped on every redemption. The app token carries the version it was issued
    # with, so activating on a new phone makes the old device's token stale --
    # which is the whole point of a token that never expires.
    token_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )
    # Revokes access without deleting the person's work history.
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    congregation: Mapped["Congregation"] = relationship(back_populates="users")
