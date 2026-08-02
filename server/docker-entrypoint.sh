#!/bin/sh
# Container entrypoint: bring the schema up to date, then serve.
#
# The deploy is a plain `docker compose up -d` against a freshly pulled image,
# so there is no separate place to run the migrations from. Alembic is
# idempotent, which makes a restart with nothing pending a no-op.
set -eu

echo "Applying database migrations..."
alembic upgrade head

# --proxy-headers is mandatory behind a reverse proxy: the rate limit is keyed
# by request.client.host, and without it every caller shares a single bucket.
# The default trusts only the loopback; set FORWARDED_ALLOW_IPS to the proxy's
# address on the docker network (X-Forwarded-For from anyone else is ignored).
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}" \
  "$@"
