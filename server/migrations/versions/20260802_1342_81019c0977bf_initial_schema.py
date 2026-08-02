"""initial schema

Creates the whole domain in one revision: `congregations` and `users` (identity),
`territories` and `blocks` (geography) and `block_work_logs` (the append-only record
of field work). They only make sense together -- every table but `congregations`
carries a foreign key up the ownership graph -- so splitting them across revisions
would leave intermediate states that never exist in practice.

Started from `alembic revision --autogenerate` and reviewed by hand. Three things
were checked rather than assumed, because they are exactly what autogenerate tends
to get wrong on a PostGIS schema:

1. **Each GIST index exists once.** `create_geospatial_table` renders the geometry
   column with `spatial_index=False` and the index is then created explicitly by
   `create_geospatial_index`. Without that split, GeoAlchemy2 would create the index
   as a side effect of the column *and* Alembic would emit it again, and the next
   autogenerate would keep proposing a spurious `DROP INDEX idx_*`. The wiring that
   makes this come out right lives in `migrations/env.py`
   (`alembic_helpers.writer` plus `alembic_helpers.include_object`).
2. **`uq_users_access_code` is partial.** The predicate `WHERE access_code IS NOT NULL`
   is what makes the index constrain only live codes; without it the index would also
   cover every row whose code was already redeemed and set to NULL.
3. **`downgrade()` really reverses this.** It drops the tables children-first so the
   foreign keys never block, and uses the geospatial variants for the two tables with
   geometry columns so PostGIS metadata is cleaned up along with them.

Verified against a clean database: `upgrade head` -> `downgrade base` -> `upgrade head`
runs clean, and a second `--autogenerate` detects no difference.

Revision ID: 81019c0977bf
Revises: 8f81b08d3642
Create Date: 2026-08-02 13:42:01.505793

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = "81019c0977bf"
down_revision: Union[str, Sequence[str], None] = "8f81b08d3642"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "congregations",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", "city", name="uq_congregations_name_city"),
    )

    op.create_table(
        "users",
        sa.Column("congregation_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("access_code", sa.String(length=16), nullable=True),
        sa.Column("access_code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["congregation_id"], ["congregations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_congregation_id"), "users", ["congregation_id"], unique=False)
    # Partial on purpose: the access code is unique globally only while it exists.
    op.create_index(
        "uq_users_access_code",
        "users",
        ["access_code"],
        unique=True,
        postgresql_where=sa.text("access_code IS NOT NULL"),
    )

    op.create_geospatial_table(
        "territories",
        sa.Column("congregation_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "boundary",
            Geometry(
                geometry_type="POLYGON",
                srid=4326,
                dimension=2,
                # The GIST index is created below, not by the column, so that it is
                # emitted exactly once and stays visible to autogenerate.
                spatial_index=False,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["congregation_id"], ["congregations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("congregation_id", "name", name="uq_territories_congregation_name"),
    )
    op.create_geospatial_index(
        "idx_territories_boundary",
        "territories",
        ["boundary"],
        unique=False,
        postgresql_using="gist",
        postgresql_ops={},
    )
    op.create_index(
        op.f("ix_territories_congregation_id"), "territories", ["congregation_id"], unique=False
    )

    op.create_geospatial_table(
        "blocks",
        sa.Column("territory_id", sa.UUID(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column(
            "polygon",
            Geometry(
                geometry_type="POLYGON",
                srid=4326,
                dimension=2,
                spatial_index=False,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("last_worked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["territory_id"], ["territories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("territory_id", "number", name="uq_blocks_territory_number"),
    )
    op.create_geospatial_index(
        "idx_blocks_polygon",
        "blocks",
        ["polygon"],
        unique=False,
        postgresql_using="gist",
        postgresql_ops={},
    )
    op.create_index(op.f("ix_blocks_territory_id"), "blocks", ["territory_id"], unique=False)

    op.create_table(
        "block_work_logs",
        # No server-side default: the id is minted by the mobile app so that
        # resending a queued marking is idempotent.
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("block_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("worked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["block_id"], ["blocks.id"], ondelete="CASCADE"),
        # RESTRICT, not CASCADE: the work history must outlive access revocation.
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_block_work_logs_block_id_worked_at",
        "block_work_logs",
        ["block_id", sa.literal_column("worked_at DESC")],
        unique=False,
    )
    op.create_index(
        op.f("ix_block_work_logs_user_id"), "block_work_logs", ["user_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema.

    Children first, so no foreign key ever blocks a DROP: the work logs point at
    blocks and users, blocks point at territories, and both users and territories
    point at congregations.

    The PostGIS extension itself is left alone -- see the `enable_postgis` revision.
    """
    op.drop_index(op.f("ix_block_work_logs_user_id"), table_name="block_work_logs")
    op.drop_index("ix_block_work_logs_block_id_worked_at", table_name="block_work_logs")
    op.drop_table("block_work_logs")

    op.drop_index(op.f("ix_blocks_territory_id"), table_name="blocks")
    op.drop_geospatial_index(
        "idx_blocks_polygon",
        table_name="blocks",
        postgresql_using="gist",
        column_name="polygon",
    )
    op.drop_geospatial_table("blocks")

    op.drop_index(op.f("ix_territories_congregation_id"), table_name="territories")
    op.drop_geospatial_index(
        "idx_territories_boundary",
        table_name="territories",
        postgresql_using="gist",
        column_name="boundary",
    )
    op.drop_geospatial_table("territories")

    op.drop_index(
        "uq_users_access_code",
        table_name="users",
        postgresql_where=sa.text("access_code IS NOT NULL"),
    )
    op.drop_index(op.f("ix_users_congregation_id"), table_name="users")
    op.drop_table("users")

    op.drop_table("congregations")
