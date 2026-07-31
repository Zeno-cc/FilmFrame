# Access database backup and restore

The production access database lives in a Docker named volume. Online backups
are written to `/opt/filmframe/backups/access` on the host, outside that volume.
This protects against volume-level mistakes, not host or provider loss.

## Prepare the host

The deployed release is addressed through the stable
`/opt/filmframe/current` symlink. The service and scripts use that path by
default so a release switch does not require rewriting the timer.
Set `COMPOSE_PROJECT_NAME=filmframe` in the production `.env` so interactive
deployments and the systemd backup service always address the same data volume.

```bash
install -d -m 0700 -o root -g root /opt/filmframe/backups/access
install -m 0644 ops/backup/filmframe-access-backup.service /etc/systemd/system/
install -m 0644 ops/backup/filmframe-access-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now filmframe-access-backup.timer
systemctl start filmframe-access-backup.service
systemctl status filmframe-access-backup.service
```

The same backup script may be configured as a daily 1Panel scheduled task. Run
it as root from the deployed repository and alert on any non-zero exit. Do not
configure both schedulers.

Each successful run creates an atomically named SQLite file, a SHA-256 manifest,
and `backup-status.env`. Before the backup it prunes sessions that have been
expired or revoked beyond their retention window. It then validates
`integrity_check`, the migration table, permissions, and removes only strictly
named regular backup files older than 30 days. `check-access-backup.sh` is
suitable for a local monitoring probe.

The online copy and integrity check run through the short-lived
`access-backup` Compose profile. That job has no network, mounts the database
volume and host backup directory only for the command, and exits afterward.
The CLI opens the source database with `readonly` and `fileMustExist`; the data
volume remains writable only because SQLite WAL mode may need to create or
coordinate `-wal`/`-shm` files even for a read-only application connection.
The long-running access service has no `/backups` mount.

## Restore rehearsal

Restore always targets a new, non-existing named volume:

```bash
FILMFRAME_ACCESS_IMAGE='sha256:...' \
  ops/backup/restore-access.sh \
  access-20260731T032000Z.sqlite \
  filmframe_access_restore_20260731
```

The script checks the manifest and database integrity, compares every invite
and session row including hashed credentials and revocation timestamps, runs
migrations twice, and verifies `0700`/`0600` ownership and permissions. It never
changes the live Compose volume. After approval, set
`FILMFRAME_ACCESS_VOLUME` to the validated volume and perform the normal
fail-closed cutover. Preserve the old volume until the rollback window closes.
