#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: build-deploy-bundle.sh <40-char-commit> <version> <output.tar.gz>" >&2
  exit 2
fi

commit="$1"
version="$2"
output="$3"

[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "commit must be a lowercase 40-character SHA" >&2; exit 2; }
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo "version must be stable major.minor.patch" >&2; exit 2; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
resolved_commit="$(git -C "$root" rev-parse --verify "${commit}^{commit}")"
[[ "$resolved_commit" == "$commit" ]] || { echo "commit does not resolve exactly" >&2; exit 2; }

mkdir -p "$(dirname "$output")"
git -C "$root" archive \
  --format=tar \
  --prefix="filmframe-${version}/" \
  "$commit" \
  -- compose.yaml .env.example ops/backup \
  | gzip -9 -n > "$output"
