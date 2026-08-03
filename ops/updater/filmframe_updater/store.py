from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from .errors import UpdaterError
from .models import (
    ALLOWED_TRANSITIONS,
    BLOCKING_STATES,
    DEPLOYMENT_ERROR_CODES,
    JOB_STATES,
    TERMINAL_STATES,
    Job,
    ReleaseManifest,
    utc_now,
)


class StateStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.path.parent.is_symlink() or self.path.is_symlink():
            raise RuntimeError("updater state paths must not be symbolic links")
        try:
            self.path.parent.chmod(0o700)
        except PermissionError:
            pass
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    target_version TEXT NOT NULL,
                    target_revision TEXT NOT NULL,
                    state TEXT NOT NULL,
                    previous_version TEXT,
                    previous_revision TEXT,
                    previous_release TEXT,
                    staged_release TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    error_code TEXT,
                    retry_of TEXT REFERENCES jobs(id),
                    request_key_hash TEXT NOT NULL UNIQUE,
                    actor_hash TEXT NOT NULL,
                    CHECK (state IN (
                      'queued','verifying_release','pulling_artifacts','staging_release',
                      'rehearsing_migration','backing_up','ready_to_switch','switching',
                      'verifying_loopback','verifying_origin','verifying_public','rolling_back',
                      'succeeded','failed_pre_switch','rolled_back','recovery_required'
                    ))
                );
                CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active
                  ON jobs ((1))
                  WHERE state NOT IN ('succeeded','failed_pre_switch','rolled_back');
                CREATE INDEX IF NOT EXISTS jobs_created_at ON jobs(created_at DESC);
                CREATE TABLE IF NOT EXISTS job_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    from_state TEXT,
                    to_state TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    error_code TEXT
                );
                CREATE TABLE IF NOT EXISTS release_cache (
                    version TEXT PRIMARY KEY,
                    manifest_json TEXT NOT NULL,
                    checked_at TEXT NOT NULL,
                    is_latest INTEGER NOT NULL CHECK (is_latest IN (0,1))
                );
                CREATE UNIQUE INDEX IF NOT EXISTS releases_one_latest
                  ON release_cache ((1)) WHERE is_latest = 1;
                """
            )
        try:
            self.path.chmod(0o600)
        except PermissionError:
            pass

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        if self.path.is_symlink():
            raise RuntimeError("updater state database must not be a symbolic link")
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        try:
            yield connection
        finally:
            connection.close()

    @staticmethod
    def _job(row: sqlite3.Row) -> Job:
        return Job(
            id=row["id"],
            target_version=row["target_version"],
            target_revision=row["target_revision"],
            state=row["state"],
            previous_version=row["previous_version"],
            previous_revision=row["previous_revision"],
            previous_release=row["previous_release"],
            staged_release=row["staged_release"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            error_code=row["error_code"],
            retry_of=row["retry_of"],
            actor_hash=row["actor_hash"],
        )

    def get_job(self, job_id: str) -> Optional[Job]:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._job(row) if row else None

    def get_active_job(self) -> Optional[Job]:
        placeholders = ",".join("?" for _ in BLOCKING_STATES)
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT * FROM jobs WHERE state IN ({placeholders}) ORDER BY created_at DESC LIMIT 1",
                tuple(sorted(BLOCKING_STATES)),
            ).fetchone()
        return self._job(row) if row else None

    def create_job(
        self,
        manifest: ReleaseManifest,
        *,
        idempotency_key: str,
        actor_hash: str,
        retry_of: Optional[str] = None,
    ) -> tuple[Job, bool]:
        request_hash = hashlib.sha256(idempotency_key.encode("ascii")).hexdigest()
        timestamp = utc_now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                replay = connection.execute(
                    "SELECT * FROM jobs WHERE request_key_hash = ?", (request_hash,)
                ).fetchone()
                if replay:
                    if replay["target_version"] != manifest.version:
                        raise UpdaterError("idempotency_conflict")
                    connection.commit()
                    return self._job(replay), False

                active = connection.execute(
                    "SELECT * FROM jobs WHERE state NOT IN ('succeeded','failed_pre_switch','rolled_back') LIMIT 1"
                ).fetchone()
                if active:
                    if active["target_version"] == manifest.version:
                        connection.commit()
                        return self._job(active), False
                    raise UpdaterError("update_busy")

                if retry_of:
                    previous = connection.execute("SELECT state FROM jobs WHERE id = ?", (retry_of,)).fetchone()
                    if not previous or previous["state"] not in TERMINAL_STATES:
                        raise UpdaterError("invalid_request")

                job_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO jobs (
                      id,target_version,target_revision,state,created_at,updated_at,
                      request_key_hash,actor_hash,retry_of
                    ) VALUES (?,?,?,'queued',?,?,?,?,?)
                    """,
                    (
                        job_id,
                        manifest.version,
                        manifest.commit,
                        timestamp,
                        timestamp,
                        request_hash,
                        actor_hash,
                        retry_of,
                    ),
                )
                connection.execute(
                    "INSERT INTO job_events(job_id,from_state,to_state,occurred_at) VALUES (?,NULL,'queued',?)",
                    (job_id, timestamp),
                )
                row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
                connection.commit()
                return self._job(row), True
            except Exception:
                connection.rollback()
                raise

    def find_reusable_job(self, *, target_version: str, idempotency_key: str) -> Optional[Job]:
        request_hash = hashlib.sha256(idempotency_key.encode("ascii")).hexdigest()
        placeholders = ",".join("?" for _ in BLOCKING_STATES)
        with self._connect() as connection:
            replay = connection.execute(
                "SELECT * FROM jobs WHERE request_key_hash = ?", (request_hash,)
            ).fetchone()
            if replay:
                if replay["target_version"] != target_version:
                    raise UpdaterError("idempotency_conflict")
                return self._job(replay)

            active = connection.execute(
                f"SELECT * FROM jobs WHERE state IN ({placeholders}) ORDER BY created_at DESC LIMIT 1",
                tuple(sorted(BLOCKING_STATES)),
            ).fetchone()
            if not active:
                return None
            if active["target_version"] != target_version:
                raise UpdaterError("update_busy")
            return self._job(active)

    def set_release_paths(
        self,
        job_id: str,
        *,
        previous_version: str,
        previous_revision: str,
        previous_release: str,
        staged_release: Optional[str] = None,
    ) -> Job:
        timestamp = utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE jobs SET previous_version=?,previous_revision=?,previous_release=?,
                  staged_release=COALESCE(?,staged_release),updated_at=? WHERE id=?
                """,
                (
                    previous_version,
                    previous_revision,
                    previous_release,
                    staged_release,
                    timestamp,
                    job_id,
                ),
            )
        job = self.get_job(job_id)
        if not job:
            raise UpdaterError("job_not_found")
        return job

    def set_staged_release(self, job_id: str, release_path: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET staged_release=?,updated_at=? WHERE id=?",
                (release_path, utc_now(), job_id),
            )

    def transition(self, job_id: str, new_state: str, *, error_code: Optional[str] = None) -> Job:
        if new_state not in JOB_STATES:
            raise ValueError("unknown job state")
        if error_code is not None and error_code not in DEPLOYMENT_ERROR_CODES:
            error_code = "preflight_failed"
        timestamp = utc_now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
                if not row:
                    raise UpdaterError("job_not_found")
                current = row["state"]
                if new_state not in ALLOWED_TRANSITIONS[current]:
                    raise ValueError(f"invalid state transition: {current} -> {new_state}")
                started_at = row["started_at"] or (timestamp if current == "queued" else None)
                finished_at = timestamp if new_state in TERMINAL_STATES or new_state == "recovery_required" else None
                connection.execute(
                    """
                    UPDATE jobs SET state=?,updated_at=?,started_at=COALESCE(started_at,?),
                      finished_at=?,error_code=? WHERE id=?
                    """,
                    (new_state, timestamp, started_at, finished_at, error_code, job_id),
                )
                connection.execute(
                    """
                    INSERT INTO job_events(job_id,from_state,to_state,occurred_at,error_code)
                    VALUES (?,?,?,?,?)
                    """,
                    (job_id, current, new_state, timestamp, error_code),
                )
                if new_state in TERMINAL_STATES:
                    self._prune_history(connection)
                result = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
                connection.commit()
                return self._job(result)
            except Exception:
                connection.rollback()
                raise

    def list_history(self, limit: int = 20) -> list[Job]:
        limit = max(1, min(limit, 50))
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM jobs
                WHERE state IN ('succeeded','failed_pre_switch','rolled_back','recovery_required')
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [self._job(row) for row in rows]

    def cache_release(self, manifest: ReleaseManifest, *, checked_at: Optional[str] = None) -> None:
        timestamp = checked_at or utc_now()
        encoded = json.dumps(manifest.storage_dict(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute("UPDATE release_cache SET is_latest=0")
                connection.execute(
                    """
                    INSERT INTO release_cache(version,manifest_json,checked_at,is_latest)
                    VALUES (?,?,?,1)
                    ON CONFLICT(version) DO UPDATE SET
                      manifest_json=excluded.manifest_json,
                      checked_at=excluded.checked_at,
                      is_latest=1
                    """,
                    (manifest.version, encoded, timestamp),
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def get_cached_release(self, version: Optional[str] = None) -> tuple[ReleaseManifest, str] | None:
        with self._connect() as connection:
            if version:
                row = connection.execute(
                    "SELECT manifest_json,checked_at FROM release_cache WHERE version=?", (version,)
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT manifest_json,checked_at FROM release_cache WHERE is_latest=1"
                ).fetchone()
        if not row:
            return None
        try:
            return ReleaseManifest.from_dict(json.loads(row["manifest_json"])), row["checked_at"]
        except (ValueError, json.JSONDecodeError) as exc:
            raise UpdaterError("release_untrusted") from exc

    def event_states(self, job_id: str) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT to_state FROM job_events WHERE job_id=? ORDER BY id", (job_id,)
            ).fetchall()
        return [row["to_state"] for row in rows]

    @staticmethod
    def _prune_history(connection: sqlite3.Connection) -> None:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=90)
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        connection.execute(
            """
            DELETE FROM jobs
            WHERE state IN ('succeeded','failed_pre_switch','rolled_back')
              AND id NOT IN (
                SELECT id FROM jobs
                WHERE state IN ('succeeded','failed_pre_switch','rolled_back')
                ORDER BY created_at DESC LIMIT 50
              )
              AND id NOT IN (SELECT retry_of FROM jobs WHERE retry_of IS NOT NULL)
            """
        )
        connection.execute(
            """
            DELETE FROM jobs
            WHERE state IN ('succeeded','failed_pre_switch','rolled_back')
              AND created_at < ?
              AND id NOT IN (SELECT retry_of FROM jobs WHERE retry_of IS NOT NULL)
            """,
            (cutoff,),
        )
