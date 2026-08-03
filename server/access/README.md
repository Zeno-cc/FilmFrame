# FilmFrame Access Service

FilmFrame's standalone server-enforced access gateway. It owns one-use
invitation codes, persistent browser sessions, and the administrator API. It
never receives photos, EXIF data, rendered output, or browser workspace data.

## Requirements

- Node.js 22 LTS
- A writable SQLite data directory
- OpenResty routes the public and administrator hosts to this service
- Cloudflare Access protects the administrator host with the exact approved
  Google identity

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `FILMFRAME_HOST` | Public FilmFrame hostname without a scheme |
| `ADMIN_HOST` | Administrator hostname without a scheme |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain |
| `CF_ACCESS_AUDIENCE` | Administrator Access application audience |
| `CF_ACCESS_ADMIN_EMAIL` | Exact administrator email allowlist |

Common optional variables are `HOST` (default `127.0.0.1`), `PORT` (default
`3000`), `DATABASE_PATH` (default `./data/access.sqlite`), `INTERNAL_HOSTS`
(default `access,localhost,127.0.0.1`), and `SECURE_COOKIES` (default `true` and
mandatory in production).

`FILMFRAME_UPDATER_ENABLED` remains `false` until the separately installed host
updater passes its rollback rehearsal. When enabled in production, Access is
pinned to `/run/filmframe-updater/updater.sock` with a bounded request timeout.
The container receives only that read-only Unix socket directory. It does not
mount the Docker socket, SSH credentials, the release tree, or a host-writable
deployment directory.

## Local Checks

```bash
npm ci
npm run check
```

Local HTTP development must set both `NODE_ENV=development` and
`SECURE_COOKIES=false`. This uses a development-only cookie without the
`__Host-` prefix and must never be copied into production.

## Route Contract

- FilmFrame host: `GET /access`, `POST /auth/redeem`, `POST /auth/refresh`
- Internal host `access`: `GET /healthz`, `GET /internal/session-check`
- Administrator host: `GET /`, `GET /api/invites`, `POST /api/invites`,
  `POST /api/invites/:id/revoke`, `GET /api/invite-batches`,
  `POST /api/invite-batches`, `POST /api/invite-batches/:id/revoke`,
  `GET /api/sessions`, `POST /api/sessions/:id/revoke`,
  `GET /api/system-update`, `POST /api/system-update/check`,
  `POST /api/system-update/jobs`, `GET /api/system-update/jobs/:id`, and
  `GET /api/system-update/history`

Internal checks accept only a loopback/private proxy address and the internal
Host. Administrator writes require the exact administrator Origin,
`X-FilmFrame-CSRF: 1`, and a JSON request body. Invitation creation also
requires a UUID `Idempotency-Key`: the first response returns plaintext once,
while a replay returns only the existing invitation metadata.

Batch creation accepts a strict `{ "name": string, "count": integer }` body
with 1–50 invitations. The whole batch is committed atomically and one
idempotency key is bound to its normalized name and count; reusing the key with
another payload returns `409`. The first `201` response is the only place that
contains the ordered plaintext codes. Replays and all list endpoints return
metadata only. Batch generation is limited to 100 codes per source IP per
minute in addition to the ordinary administrator request limit.

The administrator page keeps fresh codes only in memory and the current DOM.
It supports copy-all and spreadsheet-safe CSV download, then clears the result
on explicit request or page exit. Revoking a batch is transactional and also
revokes every live device session issued by its invitations. Successful create
and revoke operations write structured redacted audit events in production;
these events do not include invite codes, tokens, request bodies, or email
addresses.

The system-update routes forward only schema-validated, bounded messages to the
host updater. Update writes retain administrator authentication, exact Origin,
CSRF, JSON, rate-limit, and UUID idempotency gates. The browser receives only
allowlisted release, stage, history, and fixed error fields; raw updater logs,
commands, paths, environment values, and authentication assertions never cross
the socket bridge.

Device sessions use a 400-day rolling lifetime. `POST /auth/refresh` rotates
the opaque token atomically and requires the exact public Origin plus the CSRF
header. The public surface intentionally has no logout endpoint. Authorization
ends when an administrator revokes the device session or parent invitation,
the session expires without renewal, or the user clears browser site data.

## SSH Break-Glass Commands

Run these commands only over server SSH or through `docker compose exec`:

```bash
node dist/src/cli.js create --label "Temporary visitor"
node dist/src/cli.js list
node dist/src/cli.js revoke <invite-id>
node dist/src/cli.js sessions list
node dist/src/cli.js sessions revoke <session-id>
node dist/src/cli.js maintenance
docker compose --profile maintenance run --rm --no-deps access-backup \
  node dist/src/cli.js backup /backups/access-$(date -u +%Y%m%dT%H%M%SZ).sqlite
```

The database stores only SHA-256 hashes of invitation codes and session tokens.
The `create` command prints invitation plaintext once, so its output must not be
written to shell history or logs. Session listing never returns a token or hash.
`maintenance` prunes old expired or revoked sessions and reports only the number
deleted. The production daily backup service runs it before taking a backup.
The manual backup command runs in a short-lived, network-isolated Compose
profile and targets the `/backups` bind mount outside the database named
volume. The long-running access service cannot modify that directory. Prefer
`ops/backup/backup-access.sh` in production because it also verifies integrity,
writes a checksum, applies the retention boundary, and records status.
Production release validation still requires an independent restore drill.
