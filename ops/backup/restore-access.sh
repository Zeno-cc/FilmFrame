#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_BACKUP_ROOT=/opt/filmframe/backups/access
readonly BACKUP_ROOT=${FILMFRAME_BACKUP_DIR:-$DEFAULT_BACKUP_ROOT}
readonly ACCESS_IMAGE=${FILMFRAME_ACCESS_IMAGE:-filmframe-access:local}
readonly STATUS_FILE=$BACKUP_ROOT/restore-status.env

usage() {
  echo "usage: restore-access.sh <access-YYYYMMDDTHHMMSSZ.sqlite> <new-volume-name>" >&2
  exit 2
}

write_status() {
  local status=$1 message=$2 backup=${3:-} volume=${4:-}
  local temporary=$BACKUP_ROOT/.restore-status.$$
  umask 077
  {
    printf 'STATUS=%s\n' "$status"
    printf 'TIMESTAMP=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'BACKUP=%s\n' "$backup"
    printf 'VOLUME=%s\n' "$volume"
    printf 'MESSAGE=%s\n' "$message"
  } > "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$STATUS_FILE"
}

[[ $# -eq 2 ]] || usage
backup_name=${1##*/}
volume_name=$2

if [[ "$BACKUP_ROOT" != "$DEFAULT_BACKUP_ROOT" && "${FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR:-0}" != "1" ]]; then
  echo "custom backup root requires FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR=1" >&2
  exit 2
fi
if [[ -L "$BACKUP_ROOT" || ! -d "$BACKUP_ROOT" ]]; then
  echo "backup root must be an existing regular directory" >&2
  exit 2
fi
if [[ "$backup_name" != "$1" || ! "$backup_name" =~ ^access-[0-9]{8}T[0-9]{6}Z\.sqlite$ ]]; then
  usage
fi
if [[ ! "$volume_name" =~ ^filmframe_access_restore_[a-z0-9][a-z0-9_.-]{0,62}$ ]]; then
  echo "new volume must begin with filmframe_access_restore_" >&2
  exit 2
fi

backup_path=$BACKUP_ROOT/$backup_name
manifest_path=$backup_path.sha256
[[ -f "$backup_path" && ! -L "$backup_path" ]] || { echo "backup not found" >&2; exit 1; }
[[ -f "$manifest_path" && ! -L "$manifest_path" ]] || { echo "checksum manifest not found" >&2; exit 1; }
(cd "$BACKUP_ROOT" && sha256sum --check --status "$backup_name.sha256") \
  || { write_status failure "checksum validation failed" "$backup_name" "$volume_name"; exit 1; }

if docker volume inspect "$volume_name" >/dev/null 2>&1; then
  write_status failure "target volume already exists; refusing overwrite" "$backup_name" "$volume_name"
  echo "target volume already exists; refusing overwrite" >&2
  exit 1
fi

snapshot_script=$(cat <<'NODE'
import Database from "better-sqlite3";
const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
const integrity = db.pragma("integrity_check", { simple: true });
if (integrity !== "ok") process.exit(2);
const schemaVersion = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get().version;
const invites = db.prepare(`
  SELECT id, hex(code_hash) AS codeHash, label, created_at AS createdAt,
         redeem_by AS redeemBy, max_redemptions AS maxRedemptions,
         redemption_count AS redemptionCount, last_redeemed_at AS lastRedeemedAt,
         revoked_at AS revokedAt
  FROM invites
  ORDER BY id
`).all();
const sessions = db.prepare(`
  SELECT id, hex(token_hash) AS tokenHash, invite_id AS inviteId,
         created_at AS createdAt, last_seen_at AS lastSeenAt,
         expires_at AS expiresAt, revoked_at AS revokedAt
  FROM sessions
  ORDER BY id
`).all();
db.close();
process.stdout.write(JSON.stringify({ schemaVersion, invites, sessions }));
NODE
)

source_state=$(docker run --rm --read-only --network none --user 0:0 \
  -v "$BACKUP_ROOT:/backups:ro" --entrypoint node "$ACCESS_IMAGE" \
  --input-type=module -e "$snapshot_script" "/backups/$backup_name") \
  || { write_status failure "source backup validation failed" "$backup_name" "$volume_name"; exit 1; }

docker volume create "$volume_name" >/dev/null
if ! docker run --rm --network none --user 0:0 \
  -v "$volume_name:/data" -v "$BACKUP_ROOT:/backups:ro" \
  --entrypoint /bin/sh "$ACCESS_IMAGE" -c '
    set -eu
    cp "/backups/$1" /data/access.sqlite
    chown 10001:10001 /data
    chown 10001:10001 /data/access.sqlite
    chmod 0600 /data/access.sqlite
    chmod 0700 /data
  ' -- "$backup_name"; then
  write_status failure "copy into new volume failed; volume preserved for inspection" "$backup_name" "$volume_name"
  exit 1
fi

if ! docker run --rm --network none -v "$volume_name:/data" --entrypoint node "$ACCESS_IMAGE" \
  --input-type=module -e '
    import { openDatabase } from "./dist/src/db.js";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const db = openDatabase("/data/access.sqlite");
      db.close();
    }
  '; then
  write_status failure "repeated migration validation failed; volume preserved for inspection" "$backup_name" "$volume_name"
  exit 1
fi

target_state=$(docker run --rm --read-only --network none --user 0:0 -v "$volume_name:/data:ro" \
  --entrypoint node "$ACCESS_IMAGE" --input-type=module -e "$snapshot_script" /data/access.sqlite) \
  || { write_status failure "restored volume validation failed" "$backup_name" "$volume_name"; exit 1; }

if [[ "$source_state" != "$target_state" ]]; then
  write_status failure "database rows differ after restore" "$backup_name" "$volume_name"
  exit 1
fi

permissions=$(docker run --rm --read-only --network none --user 0:0 -v "$volume_name:/data:ro" \
  --entrypoint /bin/sh "$ACCESS_IMAGE" -c \
  'stat -c "%a:%u:%g" /data; stat -c "%a:%u:%g" /data/access.sqlite') \
  || { write_status failure "restored volume permission check failed" "$backup_name" "$volume_name"; exit 1; }
if [[ "$permissions" != $'700:10001:10001\n600:10001:10001' ]]; then
  write_status failure "restored volume permissions or ownership are invalid" "$backup_name" "$volume_name"
  exit 1
fi

write_status success "restored and validated in a new volume; no production switch performed" "$backup_name" "$volume_name"
echo "restore validated in volume $volume_name"
echo "set FILMFRAME_ACCESS_VOLUME=$volume_name only during an approved cutover"
