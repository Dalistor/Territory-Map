"""add territory rotation_days

Revision ID: a1c7e4f92b83
Revises: d3ab774c1b2f
Create Date: 2026-08-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c7e4f92b83'
down_revision: Union[str, Sequence[str], None] = 'd3ab774c1b2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # No server_default and no backfill on purpose: NULL already means "use the
    # client default" (the 120-day threshold both clients apply today), which is
    # the semantically correct value for every territory that already exists.
    op.add_column('territories', sa.Column('rotation_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('territories', 'rotation_days')
