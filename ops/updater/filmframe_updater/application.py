from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Callable, Optional

from .deploy import Deployer
from .errors import DeploymentError, UpdaterError
from .models import PRE_SWITCH_STATES, UPDATER_VERSION, Job, ReleaseManifest, parse_semver
from .release import CachedReleaseService
from .store import StateStore
from .system import CommandFailed, DeploymentLock

LOGGER = logging.getLogger("filmframe-updater")


class DeploymentCoordinator:
    def __init__(
        self,
        store: StateStore,
        releases: CachedReleaseService,
        deployer: Deployer,
        lock_path: Path,
    ) -> None:
        self.store = store
        self.releases = releases
        self.deployer = deployer
        self.lock_path = lock_path

    def run_job(self, job_id: str) -> None:
        job = self.store.get_job(job_id)
        if not job or job.state != "queued":
            return
        switched = False
        try:
            with DeploymentLock(self.lock_path):
                manifest = self.releases.resolve(job.target_version)
                self._transition(job_id, "verifying_release")
                current = self.deployer.inspect_current()
                self.deployer.preflight(manifest, current)
                if not current.release_path:
                    raise DeploymentError("preflight_failed")
                self.store.set_release_paths(
                    job_id,
                    previous_version=current.version,
                    previous_revision=current.revision,
                    previous_release=current.release_path,
                )

                self._transition(job_id, "pulling_artifacts")
                bundle = self.deployer.pull_artifacts(manifest, self._job(job_id))

                self._transition(job_id, "staging_release")
                staged = self.deployer.stage_release(manifest, self._job(job_id), bundle)
                self.store.set_staged_release(job_id, str(staged))

                self._transition(job_id, "rehearsing_migration")
                self.deployer.rehearse_migration(manifest, self._job(job_id))

                self._transition(job_id, "backing_up")
                self.deployer.final_backup()

                self._transition(job_id, "ready_to_switch")
                self._transition(job_id, "switching")
                switched = True
                self.deployer.switch(staged, self._job(job_id))

                self._transition(job_id, "verifying_loopback")
                self.deployer.verify_loopback(manifest, revision=manifest.commit, release=staged)
                self._transition(job_id, "verifying_origin")
                self.deployer.verify_origin()
                self._transition(job_id, "verifying_public")
                self.deployer.verify_public()
                self._transition(job_id, "succeeded")
        except DeploymentError as exc:
            self._handle_failure(job_id, exc.code, switched=switched)
        except (UpdaterError, CommandFailed, OSError, ValueError):
            self._handle_failure(job_id, "health_check_failed" if switched else "preflight_failed", switched=switched)
        finally:
            final = self.store.get_job(job_id)
            if final and final.state in {"succeeded", "failed_pre_switch", "rolled_back"}:
                try:
                    self.deployer.cleanup_artifacts(final)
                except OSError:
                    LOGGER.warning("update_event job=%s state=artifact_cleanup_failed", final.id)

    def reconcile(self) -> Optional[Job]:
        job = self.store.get_active_job()
        if not job:
            return job
        if job.state == "recovery_required":
            self._cleanup(job)
            return job
        try:
            with DeploymentLock(self.lock_path):
                if job.state in PRE_SWITCH_STATES:
                    result = self._transition(job.id, "failed_pre_switch", error_code="interrupted")
                    self._cleanup(result)
                    return result
                manifest = self.releases.resolve(job.target_version)
                current = self.deployer.inspect_current()
                if current.revision == job.previous_revision and current.healthy:
                    if job.state != "rolling_back":
                        self._transition(job.id, "rolling_back", error_code="interrupted")
                    return self._complete_rollback(job.id, manifest, "interrupted")
                if current.revision != job.target_revision or not current.healthy:
                    if job.state != "rolling_back":
                        self._transition(job.id, "rolling_back", error_code="health_check_failed")
                    return self._complete_rollback(job.id, manifest, "health_check_failed")
                if (
                    not current.release_path
                    or not job.staged_release
                    or Path(current.release_path).resolve(strict=True)
                    != Path(job.staged_release).resolve(strict=True)
                ):
                    if job.state != "rolling_back":
                        self._transition(job.id, "rolling_back", error_code="health_check_failed")
                    return self._complete_rollback(job.id, manifest, "health_check_failed")
                return self._resume_verification(job.id, manifest)
        except (DeploymentError, UpdaterError, CommandFailed, OSError, ValueError):
            current = self.store.get_job(job.id)
            if current and current.state != "rolling_back":
                try:
                    self._transition(job.id, "rolling_back", error_code="interrupted")
                except ValueError:
                    pass
            try:
                manifest = self.releases.resolve(job.target_version)
                return self._complete_rollback(job.id, manifest, "interrupted")
            except Exception:
                current = self.store.get_job(job.id)
                if current and current.state == "rolling_back":
                    result = self._transition(job.id, "recovery_required", error_code="rollback_failed")
                    self._cleanup(result)
                    return result
                return current

    def _resume_verification(self, job_id: str, manifest: ReleaseManifest) -> Job:
        job = self._job(job_id)
        if not job.staged_release:
            self._transition(job_id, "rolling_back", error_code="interrupted")
            return self._complete_rollback(job_id, manifest, "interrupted")
        staged = Path(job.staged_release)
        if job.state == "switching":
            self._transition(job_id, "verifying_loopback")
            job = self._job(job_id)
        if job.state == "verifying_loopback":
            self.deployer.verify_loopback(manifest, revision=manifest.commit, release=staged)
            self._transition(job_id, "verifying_origin")
            job = self._job(job_id)
        if job.state == "verifying_origin":
            self.deployer.verify_origin()
            self._transition(job_id, "verifying_public")
            job = self._job(job_id)
        if job.state == "verifying_public":
            self.deployer.verify_public()
            result = self._transition(job_id, "succeeded")
            self._cleanup(result)
            return result
        if job.state == "rolling_back":
            return self._complete_rollback(job_id, manifest, job.error_code or "interrupted")
        return job

    def _handle_failure(self, job_id: str, error_code: str, *, switched: bool) -> None:
        job = self.store.get_job(job_id)
        if not job:
            return
        if not switched and job.state in PRE_SWITCH_STATES:
            self._transition(job_id, "failed_pre_switch", error_code=error_code)
            return
        if job.state != "rolling_back":
            self._transition(job_id, "rolling_back", error_code=error_code)
        try:
            manifest = self.releases.resolve(job.target_version)
            self._complete_rollback(job_id, manifest, error_code)
        except (DeploymentError, UpdaterError, OSError, ValueError):
            current = self.store.get_job(job_id)
            if current and current.state == "rolling_back":
                self._transition(job_id, "recovery_required", error_code="rollback_failed")

    def _complete_rollback(self, job_id: str, manifest: ReleaseManifest, error_code: str) -> Job:
        self.deployer.rollback(self._job(job_id), manifest)
        result = self._transition(job_id, "rolled_back", error_code=error_code)
        self._cleanup(result)
        return result

    def _cleanup(self, job: Job) -> None:
        try:
            self.deployer.cleanup_artifacts(job)
        except OSError:
            LOGGER.warning("update_event job=%s state=artifact_cleanup_failed", job.id)

    def _job(self, job_id: str) -> Job:
        job = self.store.get_job(job_id)
        if not job:
            raise UpdaterError("job_not_found")
        return job

    def _transition(self, job_id: str, state: str, *, error_code: Optional[str] = None) -> Job:
        job = self.store.transition(job_id, state, error_code=error_code)
        LOGGER.info(
            "update_event job=%s target=%s state=%s actor=%s code=%s",
            job.id,
            job.target_version,
            job.state,
            job.actor_hash,
            job.error_code or "none",
        )
        return job


class UpdaterApplication:
    def __init__(
        self,
        store: StateStore,
        releases: CachedReleaseService,
        deployer: Deployer,
        coordinator: DeploymentCoordinator,
        *,
        worker_launcher: Optional[Callable[[str], None]] = None,
    ) -> None:
        self.store = store
        self.releases = releases
        self.deployer = deployer
        self.coordinator = coordinator
        self.worker_launcher = worker_launcher or self._launch_thread

    def dispatch(self, action: str, params: dict):
        if action == "check":
            return self.status(force=params.get("force", False))
        if action == "create_job":
            return self.create_job(params)
        if action == "get_job":
            job = self.store.get_job(params["jobId"])
            if not job:
                raise UpdaterError("job_not_found")
            return job.public_dict()
        if action == "get_active_job":
            active = self.store.get_active_job()
            return active.public_dict() if active else None
        if action == "list_history":
            return {"jobs": [job.public_dict() for job in self.store.list_history(params.get("limit", 20))]}
        raise UpdaterError("invalid_request")

    def status(self, *, force: bool) -> dict:
        current = self.deployer.inspect_current()
        candidate, checked_at = self.releases.check(force=force)
        candidate_public = None
        if parse_semver(candidate.version) > parse_semver(current.version):
            blocked = _blocked_reason(candidate, current)
            candidate_public = candidate.public_dict(installable=blocked is None, blocked_reason=blocked)
        active = self.store.get_active_job()
        return {
            "current": current.public_dict(),
            "candidate": candidate_public,
            "activeJob": active.public_dict() if active else None,
            "checkedAt": checked_at,
            "updaterVersion": UPDATER_VERSION,
        }

    def create_job(self, params: dict) -> dict:
        reusable = self.store.find_reusable_job(
            target_version=params["version"],
            idempotency_key=params["idempotencyKey"],
        )
        if reusable:
            return reusable.public_dict()
        manifest = self.releases.resolve(params["version"])
        current = self.deployer.inspect_current()
        blocked = _blocked_reason(manifest, current)
        if blocked:
            raise UpdaterError(blocked)
        job, created = self.store.create_job(
            manifest,
            idempotency_key=params["idempotencyKey"],
            actor_hash=params["actorHash"],
        )
        if created:
            self.worker_launcher(job.id)
        return job.public_dict()

    def _launch_thread(self, job_id: str) -> None:
        thread = threading.Thread(
            target=self.coordinator.run_job,
            args=(job_id,),
            name=f"update-{job_id[:8]}",
            daemon=True,
        )
        thread.start()


def _blocked_reason(manifest: ReleaseManifest, current) -> Optional[str]:
    if parse_semver(manifest.version) <= parse_semver(current.version):
        return "release_not_found"
    if parse_semver(UPDATER_VERSION) < parse_semver(manifest.min_updater_version):
        return "updater_upgrade_required"
    if (
        not current.healthy
        or current.schema_version != manifest.database.schema_from
        or parse_semver(current.version) < parse_semver(manifest.database.rollback_floor)
        or not manifest.database.backward_compatible
    ):
        return "migration_incompatible"
    return None
