#!/bin/sh
set -eu

TARGET=${1:-/opt/1panel/www/conf.d/cloudflare-real-ip.conf}
OPENRESTY_BIN=${OPENRESTY_BIN:-}
OPENRESTY_CONTAINER=${OPENRESTY_CONTAINER:-}
TARGET_DIR=$(dirname "$TARGET")

case "$TARGET" in
  /*) ;;
  *) echo "target must be an absolute path" >&2; exit 2 ;;
esac

if [ -L "$TARGET" ] || [ -L "$TARGET_DIR" ]; then
  echo "refusing a symbolic-link target" >&2
  exit 2
fi

if [ -n "$OPENRESTY_BIN" ] && [ -n "$OPENRESTY_CONTAINER" ]; then
  echo "set only one of OPENRESTY_BIN or OPENRESTY_CONTAINER" >&2
  exit 2
fi

if [ -n "$OPENRESTY_CONTAINER" ]; then
  if ! printf '%s\n' "$OPENRESTY_CONTAINER" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'; then
    echo "OPENRESTY_CONTAINER is not a valid Docker container name" >&2
    exit 2
  fi
elif [ -z "$OPENRESTY_BIN" ]; then
  echo "set OPENRESTY_CONTAINER or OPENRESTY_BIN to test the active configuration" >&2
  exit 2
fi

mkdir -p "$TARGET_DIR"
WORK_DIR=$(mktemp -d "$TARGET_DIR/.cloudflare-real-ip.XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT HUP INT TERM

curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://www.cloudflare.com/ips-v4 > "$WORK_DIR/ips-v4"
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://www.cloudflare.com/ips-v6 > "$WORK_DIR/ips-v6"

python3 - "$WORK_DIR/ips-v4" "$WORK_DIR/ips-v6" "$WORK_DIR/generated.conf" <<'PY'
import ipaddress
import pathlib
import sys
from datetime import datetime, timezone

v4_path, v6_path, output_path = map(pathlib.Path, sys.argv[1:])
networks = []
for path, expected_version, minimum in ((v4_path, 4, 10), (v6_path, 6, 5)):
    values = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    if len(values) < minimum:
        raise SystemExit(f"{path.name} returned too few networks")
    for value in values:
        network = ipaddress.ip_network(value, strict=True)
        if network.version != expected_version:
            raise SystemExit(f"unexpected address family in {path.name}: {value}")
        networks.append(network)

if len(set(networks)) != len(networks):
    raise SystemExit("Cloudflare response contains duplicate networks")

stamp = datetime.now(timezone.utc).date().isoformat()
lines = [
    "# Generated from https://www.cloudflare.com/ips/.",
    f"# Updated: {stamp}.",
    *(f"set_real_ip_from {network};" for network in networks),
    "",
    "real_ip_header CF-Connecting-IP;",
    "real_ip_recursive on;",
    "",
]
output_path.write_text("\n".join(lines))
PY

chmod 0644 "$WORK_DIR/generated.conf"
BACKUP="$WORK_DIR/previous.conf"
if [ -f "$TARGET" ]; then
  cp -p "$TARGET" "$BACKUP"
fi

install -m 0644 "$WORK_DIR/generated.conf" "$TARGET.new"
mv -f "$TARGET.new" "$TARGET"

if [ -n "$OPENRESTY_CONTAINER" ]; then
  if docker exec "$OPENRESTY_CONTAINER" openresty -t; then
    CONFIG_VALID=true
  else
    CONFIG_VALID=false
  fi
elif "$OPENRESTY_BIN" -t; then
  CONFIG_VALID=true
else
  CONFIG_VALID=false
fi

if [ "$CONFIG_VALID" != true ]; then
  if [ -f "$BACKUP" ]; then
    install -m 0644 "$BACKUP" "$TARGET"
  else
    rm -f "$TARGET"
  fi
  echo "OpenResty validation failed; previous CIDR file restored" >&2
  exit 1
fi

echo "updated $TARGET; reload OpenResty only after reviewing the diff"
