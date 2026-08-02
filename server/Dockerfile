# syntax=docker/dockerfile:1

# ---------- builder: resolve and install dependencies into a venv ----------
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /build

# Only the manifests, so the dependency layer is cached across code changes.
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ---------- runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --create-home app

COPY --from=builder --chown=app:app /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app . .

# Still root here: the checked-in mode bit is not guaranteed on every platform.
RUN chmod +x /app/docker-entrypoint.sh

USER app

EXPOSE 8000

# The entrypoint runs `alembic upgrade head` before handing over to uvicorn.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
