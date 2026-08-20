"""add user_name to history tables and drop the user foreign keys

Revision ID: e7b34c1d5a80
Revises: c5e21f0a7d94
Create Date: 2026-08-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7b34c1d5a80'
down_revision: Union[str, Sequence[str], None] = 'c5e21f0a7d94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    The order matters: the name has to be copied out of `users` while the foreign
    key is still there to guarantee every row has someone to copy from. Add the
    column nullable, backfill, tighten it to NOT NULL, and only then drop the keys.
    """
    op.add_column(
        'block_work_logs',
        sa.Column('user_name', sa.String(length=120), nullable=True),
    )
    op.add_column(
        'territory_assignments',
        sa.Column('user_name', sa.String(length=120), nullable=True),
    )

    # Exact backfill, no fallback for orphan rows: the RESTRICT foreign keys being
    # dropped below have made an orphan impossible up to this point, so every row
    # finds its user.
    op.execute(
        """
        UPDATE block_work_logs AS l
        SET user_name = u.name
        FROM users AS u
        WHERE u.id = l.user_id
        """
    )
    op.execute(
        """
        UPDATE territory_assignments AS a
        SET user_name = u.name
        FROM users AS u
        WHERE u.id = a.user_id
        """
    )

    op.alter_column('block_work_logs', 'user_name', existing_type=sa.String(length=120), nullable=False)
    op.alter_column('territory_assignments', 'user_name', existing_type=sa.String(length=120), nullable=False)

    # With the name stored on the row, the history no longer needs the person to
    # exist. Dropping these two is what finally allows a publisher to be deleted.
    op.drop_constraint('block_work_logs_user_id_fkey', 'block_work_logs', type_='foreignkey')
    op.drop_constraint('territory_assignments_user_id_fkey', 'territory_assignments', type_='foreignkey')


def downgrade() -> None:
    """Downgrade schema.

    Recreating the foreign keys fails if a publisher was deleted while they were
    gone - which is exactly the situation this migration exists to allow. Going
    back is only possible while every `user_id` still names a live row.
    """
    op.create_foreign_key(
        'block_work_logs_user_id_fkey',
        'block_work_logs',
        'users',
        ['user_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.create_foreign_key(
        'territory_assignments_user_id_fkey',
        'territory_assignments',
        'users',
        ['user_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.drop_column('territory_assignments', 'user_name')
    op.drop_column('block_work_logs', 'user_name')
