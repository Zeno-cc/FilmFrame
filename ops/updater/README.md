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
`list_history`. The host-maintenance-only `recover_previous` action also
requires a `jobId`; it is never dispatched through the Access service. Unknown
fields are rejected. `create_job` accepts only a stable
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
   dynamic GID is deliberately not the application identity check. Root may use
   the fixed local check/status CLI and the explicit `recover_previous`
   maintenance action. The server independently requires peer UID 0 for that
   action; Access UID 10001 cannot invoke it even if it knows a job ID.

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

The long-running service keeps `ProtectSystem=strict`. systemd creates the
private `/var/cache/filmframe-updater` directory with mode `0700` and exposes it
to `gh` through `XDG_CACHE_HOME`; this is only a cache for Sigstore verification
metadata, not release state or credentials. Do not add this directory to
`ReadWritePaths` or replace it with a broad writable home directory.

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

## Canvas budget compatibility

Before an upgrade and again before automatic rollback, the updater reads the
singleton `render_budget_settings` row through the production Access service's
Node process. SQLite is opened read-only with `fileMustExist`; the updater never
clamps the budget or writes the database or `.env` to make a release fit.

The Canvas-budget change at local commit `33f6b24` has no published version
tag. The published `v1.4.12` source still has a 2048 MiB maximum, so `1.5.0` is
the fixed first 6 GiB-capable candidate boundary in this updater. It must not be
replaced by the version of the manifest currently being installed. A target
below `1.5.0`, including the existing `v1.4.12`, accepts 128-2048 MiB; a target
at or above it accepts 128-6144 MiB. The same ceiling applies to an upgrade
into the candidate. This does not claim that `33f6b24` or `1.5.0` was
published. A later updater must establish any subsequent release line's actual
capability boundary from its published history rather than deriving it from
the target manifest.

An out-of-range budget, missing row, malformed value, unavailable Node service,
or SQLite read failure is `migration_incompatible`. Before an upgrade, the job
ends as `failed_pre_switch` without downloading or switching artifacts; keep
the current release, deliberately choose a compatible budget through the
existing administrator settings workflow, or use the separately reviewed manual
release procedure. The updater does not lower the budget on the administrator's
behalf.

If this check blocks automatic rollback, the job becomes `recovery_required`
with `migration_incompatible`, without calling `switch()` or reporting
`rolled_back`. The `current` symlink and persisted job remain inspectable with
`readlink /opt/filmframe/current` and the updater `status` command. The
`recovery_required` job blocks new jobs and survives updater restarts. An
operator must use SSH to inspect the host journal and running revision, repair
the runtime configuration deliberately, or perform the documented manual
release/restore procedure. Host-updater repair and the existing systemd
controls remain available independently of the failing one-click update path.

After the **previous** release has been restored and is actually running
healthy, retire the recovery lock through the root-only maintenance command:

```bash
sudo env PYTHONPATH=/usr/lib/filmframe-updater \
  /usr/bin/python3 -m filmframe_updater recover-previous
```

The server verifies peer UID 0, reads the active recovery job, and requires the
real `current` symlink, version, revision, health, loopback checks and stored
Canvas budget to match that previous release before recording `rolled_back`.
It does not switch releases, alter the budget or report a target release as
successful. Any failure leaves `recovery_required` and its original error code
intact. Access cannot dispatch this maintenance action. Do not delete
`state.sqlite` or edit job rows to bypass the lock, and do not expect an
updater restart to retry into success.

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
