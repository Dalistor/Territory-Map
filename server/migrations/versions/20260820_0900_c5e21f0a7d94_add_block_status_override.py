"""add block status_override

Revision ID: c5e21f0a7d94
Revises: a1c7e4f92b83
Create Date: 2026-08-20 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e21f0a7d94'
down_revision: Union[str, Sequence[str], None] = 'a1c7e4f92b83'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # No server_default and no backfill on purpose: NULL is the correct value for
    # every block that already exists - it means "derive the colour from the work
    # logs", which is exactly what both clients do today.
    op.add_column('blocks', sa.Column('status_override', sa.String(length=16), nullable=True))
    op.create_check_constraint(
        'ck_blocks_status_override',
        'blocks',
        "status_override IN ('overdue', 'never')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_blocks_status_override', 'blocks', type_='check')
    op.drop_column('blocks', 'status_override')
