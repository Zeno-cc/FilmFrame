#!/usr/bin/env bash
set -Eeuo pipefail

readonly updater_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
temporary=$(mktemp -d)
trap 'find "$temporary" -depth -delete' EXIT
readonly lib_root=$temporary/usr/lib/filmframe-updater

bash -n "$updater_root/install.sh"
grep -Fq '"$LIB_ROOT/filmframe_updater"' "$updater_root/install.sh"
grep -Fq '/usr/bin/gh attestation verify --help' "$updater_root/install.sh"
grep -Fq -- '--origin-ip <IPv4 address>' "$updater_root/install.sh"
grep -Fq '"originIp": "$ORIGIN_IP"' "$updater_root/install.sh"
if grep -Eq '"originIp": "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' "$updater_root/install.sh"; then
  echo "install.sh must not contain a deployment-specific origin IP" >&2
  exit 1
fi
if "$updater_root/install.sh" --origin-ip invalid >"$temporary/invalid-ip.log" 2>&1; then
  echo "install.sh accepted an invalid origin IP" >&2
  exit 1
fi
grep -Fq -- '--origin-ip must be a valid IPv4 address' "$temporary/invalid-ip.log"

install -d -m 0755 "$lib_root/filmframe_updater"
find "$updater_root/filmframe_updater" -maxdepth 1 -type f -name '*.py' \
  -exec install -m 0644 '{}' "$lib_root/filmframe_updater/" ';'

PYTHONPATH="$lib_root" python3 -c \
  'import filmframe_updater; import filmframe_updater.__main__; assert filmframe_updater.UPDATER_VERSION == "1.0.0"'

echo "updater install layout is importable"
