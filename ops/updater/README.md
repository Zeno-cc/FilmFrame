# FilmFrame host updater

The updater is the stable host-side boundary for administrator-approved
FilmFrame releases. It runs outside the application release lifecycle, listens
on a Unix socket only, persists jobs in SQLite, and is the only component that
may operate Docker or `/opt/filmframe`. The Access service remains non-root and
never receives the Docker socket, an SSH key, release paths, commands, or raw
updater output.

## Wire contract

`protocol.schema.json` is the machine-readable v1 request contract. Each Unix
connection carries one newline-terminated UTF-8 JSON request (maximum 16 KiB)
and one response (maximum 64 KiB):

```json
{"protocolVersion":1,"requestId":"UUID","action":"get_active_job","params":{}}
```

Actions are `check`, `create_job`, `get_job`, `get_active_job`, and
`list_history`. Unknown fields are rejected. `create_job` accepts only a stable
version, UUID idempotency key, and a 64-character administrator identity hash.
It never accepts a path, URL, image, command, environment key, or rollback
target.

Responses use `{protocolVersion, requestId, ok, result}` or a fixed safe error
object. Jobs expose only IDs, versions, revisions, states, timestamps, retry
metadata, and an error enum. Absolute paths, `.env`, subprocess arguments,
stdout/stderr, JWTs, cookies, database content, backup names, and other 1Panel
sites never cross the socket.

## Socket identity and Compose

There are two independent checks:

1. `filmframe-updater-client` owns the socket with mode `0660`. Compose adds its
   **dynamic host GID** through `group_add`, which grants connect permission.
2. Linux `SO_PEERCRED` authorizes the Access process by its fixed host-visible
   UID `10001`. `SO_PEERCRED` does not report supplementary groups, so the
   dynamic GID is deliberately not the application identity check. Root is
   allowed only for the fixed local check/status CLI.

Mount the parent directory, not the socket inode:

```yaml
group_add:
  - "${FILMFRAME_UPDATER_GID}"
volumes:
  - /run/filmframe-updater:/run/filmframe-updater:ro
```

Mounting the parent keeps reconnects working after socket recreation. Never
mount `/var/run/docker.sock`, `/opt/filmframe`, the updater state directory, or
the backup directory into Access.

## Installation

Install only after reviewing `install.sh`, the systemd units, and the root-only
configuration:

```bash
sudo ops/updater/install.sh --origin-ip "$FILMFRAME_ORIGIN_IP"
sudo systemctl status filmframe-updater.socket filmframe-updater-check.timer
sudo systemctl start filmframe-updater-check.service
```

`--origin-ip` is required and must be the server's public IPv4 address. Keeping
the value outside the repository makes the same installer usable in local,
staging, and production environments. For unattended installation, provide it
from the deployment system's host inventory rather than committing it to a
script or configuration template.

The installer does not switch the running release. It prints the generated
host group GID; place that value in the production `.env` as
`FILMFRAME_UPDATER_GID`, then deploy the separately reviewed Access bridge.
The root-owned config pins Access UID `10001`, the origin IP, and the exact
OpenResty container name. Change the container name only if 1Panel reports a
different actual name, then restart `filmframe-updater.service`. Reinstalling
does not overwrite that config; pass the same origin IP or review and update
`/etc/filmframe-updater/config.json` before reinstalling.

The six-hour timer invokes the fixed Unix-socket `check` action. It does not
install anything. Installation always requires the authenticated administrator
to create a job.

## GitHub attestation authentication

The updater downloads only the fixed `Zeno-cc/FilmFrame` stable Release. For
the manifest, deploy bundle, and both GHCR image digests, it computes or reads
the pinned SHA-256 and fetches Sigstore bundles from the fixed public GitHub
Attestations API. It writes those bundles to a temporary mode `0600` JSONL file
and runs `gh attestation verify --bundle`; the CLI never performs its own
network lookup and never inherits `GH_TOKEN` or `GITHUB_TOKEN`. Verification
still pins the GitHub OIDC issuer, repository, workflow, tag ref, commit, and
hosted-runner policy.

Do not use interactive `gh auth login` for the systemd service. Public artifacts
normally verify anonymously. If GitHub rate limits the server, put
`GH_TOKEN=...` in `/etc/filmframe-updater/environment` (mode `0600`, root only)
using a fine-grained token with read-only repository contents and attestations
permissions. The token is used only by the fixed-host HTTP client. Never grant
write or admin permissions.

## Recovery and removal

At startup, interrupted pre-switch jobs become `failed_pre_switch`. For a job
interrupted after cutover, the updater compares the real `current` symlink,
running revision, schema, and health before completing verification or rolling
the application back. Automatic rollback never restores SQLite. If the old
application cannot be proven healthy, the job becomes `recovery_required` and
keeps the global update lock; use the existing SSH release and database
recovery procedures.

To disable the feature without changing FilmFrame or deleting audit state:

```bash
sudo systemctl disable --now filmframe-updater-check.timer filmframe-updater.socket
```

Keep `/var/lib/filmframe-updater/state.sqlite`, old releases, images, and access
backups until the rollback window has closed. Removing those is a separate,
explicit maintenance operation.
