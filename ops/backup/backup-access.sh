#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_BACKUP_ROOT=/opt/filmframe/backups/access
readonly RETENTION_DAYS=${FILMFRAME_BACKUP_RETENTION_DAYS:-30}
readonly BACKUP_ROOT=${FILMFRAME_BACKUP_DIR:-$DEFAULT_BACKUP_ROOT}
readonly APP_DIR=${FILMFRAME_APP_DIR:-/opt/filmframe/current}
readonly COMPOSE_FILE=${FILMFRAME_COMPOSE_FILE:-$APP_DIR/compose.yaml}
readonly STATUS_FILE=$BACKUP_ROOT/backup-status.env

backup_name=""
backup_hash=""

file_mode() {
  stat -c %a -- "$1" 2>/dev/null || stat -f %Lp -- "$1"
}

file_mtime() {
  stat -c %Y -- "$1" 2>/dev/null || stat -f %m -- "$1"
}

write_status() {
  local status=$1
  local message=$2
  local temporary=$BACKUP_ROOT/.backup-status.$$
  umask 077
  {
    printf 'STATUS=%s\n' "$status"
    printf 'TIMESTAMP=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'BACKUP=%s\n' "$backup_name"
    printf 'SHA256=%s\n' "$backup_hash"
    printf 'MESSAGE=%s\n' "$message"
  } > "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$STATUS_FILE"
}

fail() {
  local message=$1
  trap - ERR
  write_status failure "$message" || true
  echo "backup failed: $message" >&2
  exit 1
}

require_backup_root() {
  case "$BACKUP_ROOT" in
    /*) ;;
    *) echo "backup root must be absolute" >&2; exit 2 ;;
  esac

  if [[ "$BACKUP_ROOT" == "/" || -z "$BACKUP_ROOT" ]]; then
    echo "unsafe backup root" >&2
    exit 2
  fi
  if [[ "$BACKUP_ROOT" != "$DEFAULT_BACKUP_ROOT" && "${FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR:-0}" != "1" ]]; then
    echo "custom backup root requires FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR=1" >&2
    exit 2
  fi
  if [[ -L "$BACKUP_ROOT" ]]; then
    echo "backup root must not be a symbolic link" >&2
    exit 2
  fi

  umask 077
  mkdir -p "$BACKUP_ROOT"
  chmod 0700 "$BACKUP_ROOT"
  local resolved
  resolved=$(cd -P "$BACKUP_ROOT" && pwd)
  if [[ "$resolved" != "$BACKUP_ROOT" ]]; then
    echo "backup root must be canonical: $resolved" >&2
    exit 2
  fi
}

run_session_maintenance() {
  local result pattern
  pattern='^\{"deletedSessions":[0-9]+,"deletedChallenges":[0-9]+\}$'
  [[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found"
  result=$(docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE" exec -T access \
    node dist/src/cli.js maintenance) \
    || fail "session maintenance failed"
  [[ "$result" =~ $pattern ]] \
    || fail "session maintenance returned an invalid result"
  echo "session maintenance complete: $result"
}

cleanup_expired() {
  local now cutoff path basename modified
  now=$(date +%s)
  cutoff=$((now - RETENTION_DAYS * 86400))

  while IFS= read -r -d '' path; do
    basename=${path##*/}
    if [[ ! "$basename" =~ ^access-[0-9]{8}T[0-9]{6}Z\.sqlite(\.sha256)?$ ]]; then
      continue
    fi
    if [[ -L "$path" || ! -f "$path" ]]; then
      continue
    fi
    modified=$(file_mtime "$path")
    if (( modified < cutoff )); then
      rm -f -- "$path"
      echo "removed expired backup artifact: $basename"
    fi
  done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type f -print0)
}

run_online_backup() {
  local timestamp temporary_name temporary_path final_path manifest_path permissions
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup_name="access-$timestamp.sqlite"
  temporary_name=".$backup_name.tmp.$$"
  temporary_path=$BACKUP_ROOT/$temporary_name
  final_path=$BACKUP_ROOT/$backup_name
  manifest_path=$final_path.sha256

  [[ ! -e "$temporary_path" && ! -e "$final_path" ]] || fail "backup name collision"
  [[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found"

  docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE" \
    --profile maintenance run --rm --no-deps access-backup \
    node dist/src/cli.js backup "/backups/$temporary_name" >/dev/null \
    || fail "SQLite online backup command failed"

  [[ -f "$temporary_path" && ! -L "$temporary_path" ]] || fail "backup output is not a regular file"
  permissions=$(file_mode "$temporary_path")
  [[ "$permissions" == "600" ]] || fail "backup permissions are $permissions, expected 600"

  docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE" \
    --profile maintenance run --rm --no-deps access-backup \
    node --input-type=module -e '
      import Database from "better-sqlite3";
      const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
      const integrity = db.pragma("integrity_check", { simple: true });
      const migration = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
      db.close();
      if (integrity !== "ok" || !Number.isInteger(migration?.version)) process.exit(1);
    ' "/backups/$temporary_name" || fail "backup integrity or schema validation failed"

  backup_hash=$(sha256sum "$temporary_path" | awk '{print $1}')
  [[ "$backup_hash" =~ ^[0-9a-f]{64}$ ]] || fail "invalid SHA-256 output"

  mv "$temporary_path" "$final_path"
  printf '%s  %s\n' "$backup_hash" "$backup_name" > "$manifest_path.tmp.$$"
  chmod 0600 "$manifest_path.tmp.$$"
  mv "$manifest_path.tmp.$$" "$manifest_path"
  sync -f "$BACKUP_ROOT" 2>/dev/null || true
}

require_backup_root

if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 || RETENTION_DAYS > 3650 )); then
  fail "backup retention must be an integer between 1 and 3650 days"
fi

case "${1:-}" in
  --cleanup-only)
    cleanup_expired
    exit 0
    ;;
  "") ;;
  *) echo "usage: backup-access.sh [--cleanup-only]" >&2; exit 2 ;;
esac

trap 'fail "unexpected command failure"' ERR
run_session_maintenance
run_online_backup
cleanup_expired
write_status success "online backup, integrity check, and retention cleanup completed"
echo "backup complete: $BACKUP_ROOT/$backup_name"
