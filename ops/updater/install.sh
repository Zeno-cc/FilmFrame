#!/usr/bin/env bash
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

usage() {
  echo "usage: sudo $0 --origin-ip <IPv4 address>" >&2
}

if [[ $# -ne 2 || $1 != "--origin-ip" || -z $2 ]]; then
  usage
  exit 2
fi

readonly SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly LIB_ROOT=/usr/lib/filmframe-updater
readonly CONFIG_ROOT=/etc/filmframe-updater
readonly STATE_ROOT=/var/lib/filmframe-updater
[[ -x /usr/bin/python3 ]] || { echo "required command is unavailable: /usr/bin/python3" >&2; exit 1; }
ORIGIN_IP=$(/usr/bin/python3 - "$2" <<'PY'
import ipaddress
import sys

try:
    address = ipaddress.ip_address(sys.argv[1])
except ValueError:
    raise SystemExit("--origin-ip must be a valid IPv4 address") from None
if not isinstance(address, ipaddress.IPv4Address):
    raise SystemExit("--origin-ip must be a valid IPv4 address")
print(address)
PY
)
readonly ORIGIN_IP

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "install.sh must run as root" >&2
  exit 1
fi

for command in /usr/bin/python3 /usr/bin/docker /usr/bin/gh /usr/bin/curl /usr/bin/systemctl /usr/bin/install; do
  [[ -x "$command" ]] || { echo "required command is unavailable: $command" >&2; exit 1; }
done
if ! /usr/bin/gh attestation verify --help >/dev/null 2>&1; then
  echo "GitHub CLI must support 'gh attestation verify'" >&2
  exit 1
fi
[[ -f "$SOURCE_ROOT/filmframe_updater/__main__.py" ]] || { echo "updater source is incomplete" >&2; exit 1; }
if [[ -e "$CONFIG_ROOT/config.json" ]]; then
  existing_origin=$(PYTHONPATH="$SOURCE_ROOT" /usr/bin/python3 - "$CONFIG_ROOT/config.json" <<'PY'
import sys
from pathlib import Path

from filmframe_updater.config import Config

print(Config.load(Path(sys.argv[1])).origin_ip)
PY
  )
  if [[ "$existing_origin" != "$ORIGIN_IP" ]]; then
    echo "existing updater config has a different origin IP; review it before reinstalling" >&2
    exit 1
  fi
fi

if ! getent group filmframe-updater-client >/dev/null; then
  groupadd --system filmframe-updater-client
fi
client_gid=$(getent group filmframe-updater-client | cut -d: -f3)
[[ "$client_gid" =~ ^[0-9]+$ ]] || { echo "cannot resolve updater client group" >&2; exit 1; }

install -d -m 0755 -o root -g root "$LIB_ROOT"
install -d -m 0755 -o root -g root "$LIB_ROOT/filmframe_updater"
find "$SOURCE_ROOT/filmframe_updater" -maxdepth 1 -type f -name '*.py' \
  -exec install -m 0644 -o root -g root '{}' "$LIB_ROOT/filmframe_updater/" ';'

install -d -m 0700 -o root -g root "$CONFIG_ROOT" "$STATE_ROOT" "$STATE_ROOT/artifacts"
if [[ ! -e "$CONFIG_ROOT/config.json" ]]; then
  install -m 0600 -o root -g root /dev/null "$CONFIG_ROOT/config.json"
  cat > "$CONFIG_ROOT/config.json" <<JSON
{
  "allowedPeerUids": [0, 10001],
  "bootstrapCurrentVersion": "1.0.0",
  "openrestyContainer": "1Panel-openresty",
  "originIp": "$ORIGIN_IP"
}
JSON
fi
if [[ ! -e "$CONFIG_ROOT/environment" ]]; then
  install -m 0600 -o root -g root /dev/null "$CONFIG_ROOT/environment"
  cat > "$CONFIG_ROOT/environment" <<'ENV'
# Public releases normally verify without a token. If GitHub rate limits the
# server, set a read-only fine-grained token here as GH_TOKEN=... .
ENV
fi

install -m 0644 -o root -g root "$SOURCE_ROOT/systemd/filmframe-updater.service" /etc/systemd/system/
install -m 0644 -o root -g root "$SOURCE_ROOT/systemd/filmframe-updater.socket" /etc/systemd/system/
install -m 0644 -o root -g root "$SOURCE_ROOT/systemd/filmframe-updater-check.service" /etc/systemd/system/
install -m 0644 -o root -g root "$SOURCE_ROOT/systemd/filmframe-updater-check.timer" /etc/systemd/system/
install -m 0644 -o root -g root "$SOURCE_ROOT/systemd/filmframe-updater.tmpfiles" \
  /etc/tmpfiles.d/filmframe-updater.conf

systemd-tmpfiles --create /etc/tmpfiles.d/filmframe-updater.conf
systemctl daemon-reload
systemctl enable --now filmframe-updater.socket filmframe-updater-check.timer

echo "FilmFrame updater installed without changing the running application."
echo "Set FILMFRAME_UPDATER_GID=$client_gid in the production .env before enabling the Access bridge."
echo "Mount /run/filmframe-updater read-only and use group_add with that GID; do not mount Docker socket."
