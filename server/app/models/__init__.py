"""SQLAlchemy models.

Every model module MUST be imported here. Alembic's autogenerate only sees the
tables that were registered on `Base.metadata` by import time, so a model that is
not reachable from this module is silently missing from the generated migration.
"""

from app.models.base import Base, EntityMixin, TimestampMixin
from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.congregation import Congregation
from app.models.territory import Territory
from app.models.user import User

__all__ = [
    "Base",
    "Block",
    "BlockWorkLog",
    "Congregation",
    "EntityMixin",
    "Territory",
    "TimestampMixin",
    "User",
]
