"""enable postgis

Every geometry column in this schema depends on the PostGIS extension, so it has
to exist before any other migration runs. The dev and CI containers already create
it through the image init script; this migration makes a plain PostgreSQL database
(or one restored without the extension) converge to the same state.

The downgrade does NOT drop the extension: `spatial_ref_sys` and the geometry type
may be shared with other schemas in the same database, and dropping it would take
every geometry column down with it.

Revision ID: 8f81b08d3642
Revises:
Create Date: 2026-08-02 13:20:11.645960

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8f81b08d3642"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    """Downgrade schema."""
    # Intentionally a no-op -- see the module docstring.
    pass
