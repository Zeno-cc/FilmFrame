#!/usr/bin/env bash
set -Eeuo pipefail

readonly BACKUP_ROOT=${FILMFRAME_BACKUP_DIR:-/opt/filmframe/backups/access}
readonly MAX_AGE_HOURS=${FILMFRAME_BACKUP_MAX_AGE_HOURS:-36}
readonly STATUS_FILE=$BACKUP_ROOT/backup-status.env

[[ -d "$BACKUP_ROOT" && ! -L "$BACKUP_ROOT" ]] || { echo "backup directory unavailable" >&2; exit 1; }
[[ -f "$STATUS_FILE" && ! -L "$STATUS_FILE" ]] || { echo "backup status unavailable" >&2; exit 1; }

status=$(sed -n 's/^STATUS=//p' "$STATUS_FILE")
[[ "$status" == success ]] || { echo "last backup status is not successful" >&2; exit 1; }

latest=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type f \
  -name 'access-????????T??????Z.sqlite' -printf '%T@ %f\n' | sort -nr | head -n1 | cut -d' ' -f2-)
[[ "$latest" =~ ^access-[0-9]{8}T[0-9]{6}Z\.sqlite$ ]] \
  || { echo "no valid backup found" >&2; exit 1; }

modified=$(stat -c %Y -- "$BACKUP_ROOT/$latest" 2>/dev/null || stat -f %m -- "$BACKUP_ROOT/$latest")
age=$(( $(date +%s) - modified ))
(( age <= MAX_AGE_HOURS * 3600 )) || { echo "latest backup is too old" >&2; exit 1; }

(cd "$BACKUP_ROOT" && sha256sum --check --status "$latest.sha256") \
  || { echo "latest backup checksum failed" >&2; exit 1; }

usage=$(df -P "$BACKUP_ROOT" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
[[ "$usage" =~ ^[0-9]+$ ]] || { echo "disk usage unavailable" >&2; exit 1; }
(( usage < ${FILMFRAME_BACKUP_DISK_WARN_PERCENT:-85} )) \
  || { echo "backup filesystem usage is ${usage}%" >&2; exit 1; }

echo "backup healthy: $latest, age ${age}s, filesystem ${usage}% used"
