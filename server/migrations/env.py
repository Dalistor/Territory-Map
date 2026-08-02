"""Alembic environment.

The database URL comes from `Settings` (DATABASE_URL), never from alembic.ini, so
that the migrations, the API and the tests always point at the same place and no
credential is versioned.
"""

from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings

# Importing the package is what registers every model on Base.metadata; a model
# module missing from app/models/__init__.py is invisible to autogenerate.
from app.models import Base
from geoalchemy2 import alembic_helpers
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    # `disable_existing_loggers=False` because alembic is not always the whole
    # process: the test suite runs `upgrade head` in-process, and the default would
    # switch off every logger created before this line -- including the application's
    # own, which then falls silent for the rest of the run.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL)

target_metadata = Base.metadata

# PostGIS installs its own tables and views in the database. They are not part of
# our schema, so autogenerate must never try to drop or alter them.
POSTGIS_INTERNAL_TABLES = frozenset(
    {
        "spatial_ref_sys",
        "geometry_columns",
        "geography_columns",
        "raster_columns",
        "raster_overviews",
    }
)


def include_object(obj, name, obj_type, reflected, compare_to) -> bool:
    """Filter out PostGIS internals and the indexes GeoAlchemy2 manages itself."""
    if obj_type == "table" and name in POSTGIS_INTERNAL_TABLES:
        return False
    # GeoAlchemy2 creates the GIST index of a geometry column as part of the column
    # itself; without this, autogenerate reports it a second time as a stray index.
    return alembic_helpers.include_object(obj, name, obj_type, reflected, compare_to)


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        include_object=include_object,
        # Renders Geometry columns as geoalchemy2 types instead of NullType.
        render_item=alembic_helpers.render_item,
        process_revision_directives=alembic_helpers.writer,
        compare_type=True,
        compare_server_default=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it against a database."""
    _configure(
        url=config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run the migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        _configure(connection=connection)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
