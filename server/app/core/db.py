"""Database engine, session factory and the FastAPI session dependency."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Synchronous engine on psycopg 3 (the driver is part of DATABASE_URL:
# postgresql+psycopg://...). pool_pre_ping discards connections that the
# database or an intermediate proxy dropped while idle.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    # The session is closed by the dependency right after the endpoint returns, so
    # expiring on commit would turn any later attribute access into a query on a
    # closed session.
    expire_on_commit=False,
)


def get_session() -> Iterator[Session]:
    """Yield a session that commits on success and rolls back on any exception.

    One transaction per request: repositories and services never commit, so a
    failure anywhere in the request leaves nothing half-written.
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
