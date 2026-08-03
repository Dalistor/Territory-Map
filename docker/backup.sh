#!/bin/sh
# Nightly dump of the application database.
#
# The compose stack keeps its data in the named volume `postgis_data`, which nothing
# else copies: losing it loses every territory, block and work log ever recorded. This
# writes a compressed dump next to the stack and keeps the last two weeks.
#
# Installed on the VPS by the deploy (it lives under docker/, which is rsynced) and
# run from root's crontab:
#
#     0 3 * * * /opt/territory-map/docker/backup.sh >> /var/log/territory-map-backup.log 2>&1
#
# The dump lands in /opt/territory-map/backups, deliberately *outside* docker/ --
# the deploy mirrors docker/ with --delete and would wipe the backups on every push.
#
# This is a local copy: it survives a bad migration, a dropped table or a corrupted
# volume, but not the loss of the host. Copying it off the machine is a separate step.

set -eu

STACK_DIR=/opt/territory-map
BACKUP_DIR="$STACK_DIR/backups"
RETENTION_DAYS=14

cd "$STACK_DIR"

# POSTGRES_USER lives in the same .env the stack reads.
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
: "${POSTGRES_USER:=territory}"

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/territory_map-$(date +%Y%m%d-%H%M%S).sql.gz"

# -T: no TTY, so this works unattended from cron.
docker compose exec -T db pg_dump -U "$POSTGRES_USER" territory_map | gzip > "$TARGET"

# A dump that failed halfway still leaves a file; an empty one is worse than none
# because it looks like a backup. gzip of an empty stream is ~20 bytes.
if [ "$(stat -c %s "$TARGET")" -lt 100 ]; then
  echo "$(date -Is) FAILED: dump is empty, removing $TARGET" >&2
  rm -f "$TARGET"
  exit 1
fi

find "$BACKUP_DIR" -name 'territory_map-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "$(date -Is) ok: $TARGET ($(stat -c %s "$TARGET") bytes)"
