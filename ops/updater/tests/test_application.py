from __future__ import annotations

import tempfile
import unittest
import uuid
from pathlib import Path

from filmframe_updater.application import DeploymentCoordinator, UpdaterApplication
from filmframe_updater.errors import DeploymentError, UpdaterError
from filmframe_updater.models import CurrentRelease
from filmframe_updater.store import StateStore
from tests.helpers import manifest


class FakeReleases:
    def __init__(self, release=None) -> None:
        self.release = release or manifest()

    def resolve(self, version: str):
        if version != self.release.version:
            raise UpdaterError("release_not_found")
        return self.release

    def check(self, *, force: bool):
        return self.release, "2026-08-02T00:00:00Z"


class FakeDeployer:
    def __init__(
        self,
        root: Path,
        *,
        fail_at: str | None = None,
        current_revision: str = "1" * 40,
        current_version: str = "1.0.0",
    ) -> None:
        self.root = root
        self.fail_at = fail_at
        self.calls: list[str] = []
        self.current = CurrentRelease(current_version, current_revision, True, 3, str(root / "old"))
        (root / "old").mkdir(exist_ok=True)
        (root / "new").mkdir(exist_ok=True)

    def _call(self, name: str) -> None:
        self.calls.append(name)
        if self.fail_at == name:
            code = "rollback_failed" if name == "rollback" else "health_check_failed"
            raise DeploymentError(code)

    def inspect_current(self):
        self._call("inspect_current")
        return self.current

    def preflight(self, manifest_obj, current): self._call("preflight")
    def pull_artifacts(self, manifest_obj, job): self._call("pull_artifacts"); return self.root / "bundle"
    def stage_release(self, manifest_obj, job, bundle): self._call("stage_release"); return self.root / "new"
    def rehearse_migration(self, manifest_obj, job): self._call("rehearse_migration")
    def final_backup(self): self._call("final_backup")
    def switch(self, release, job): self._call("switch")
    def verify_loopback(
        self,
        manifest_obj,
        *,
        revision,
        release: Path,
        expected_schema=None,
        allowed_schemas=None,
    ):
        self._call("verify_loopback")
    def verify_origin(self): self._call("verify_origin")
    def verify_public(self): self._call("verify_public")
    def rollback(self, job, manifest_obj): self._call("rollback")
    def cleanup_artifacts(self, job): self._call("cleanup_artifacts")


class ApplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.store = StateStore(self.root / "state.sqlite")
        self.store.initialize()
        self.releases = FakeReleases()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def create(self):
        return self.store.create_job(
            self.releases.release,
            idempotency_key=str(uuid.uuid4()),
            actor_hash="a" * 64,
        )[0]

    def coordinator(self, deployer):
        return DeploymentCoordinator(self.store, self.releases, deployer, self.root / "update.lock")

    def test_success_runs_every_gate_and_persists_real_states(self) -> None:
        deployer = FakeDeployer(self.root)
        job = self.create()
        self.coordinator(deployer).run_job(job.id)
        self.assertEqual(self.store.get_job(job.id).state, "succeeded")  # type: ignore[union-attr]
        self.assertEqual(
            self.store.event_states(job.id),
            [
                "queued",
                "verifying_release",
                "pulling_artifacts",
                "staging_release",
                "rehearsing_migration",
                "backing_up",
                "ready_to_switch",
                "switching",
                "verifying_loopback",
                "verifying_origin",
                "verifying_public",
                "succeeded",
            ],
        )
        self.assertNotIn("rollback", deployer.calls)

    def test_failure_before_switch_does_not_roll_back(self) -> None:
        deployer = FakeDeployer(self.root, fail_at="final_backup")
        job = self.create()
        self.coordinator(deployer).run_job(job.id)
        result = self.store.get_job(job.id)
        self.assertEqual(result.state, "failed_pre_switch")  # type: ignore[union-attr]
        self.assertNotIn("switch", deployer.calls)
        self.assertNotIn("rollback", deployer.calls)

    def test_failure_after_switch_rolls_back_application(self) -> None:
        deployer = FakeDeployer(self.root, fail_at="verify_origin")
        job = self.create()
        self.coordinator(deployer).run_job(job.id)
        result = self.store.get_job(job.id)
        self.assertEqual(result.state, "rolled_back")  # type: ignore[union-attr]
        self.assertIn("rollback", deployer.calls)

    def test_rollback_failure_holds_recovery_lock(self) -> None:
        deployer = FakeDeployer(self.root, fail_at="rollback")
        job = self.create()
        coordinator = self.coordinator(deployer)
        for state in (
            "verifying_release",
            "pulling_artifacts",
            "staging_release",
            "rehearsing_migration",
            "backing_up",
            "ready_to_switch",
            "switching",
            "rolling_back",
        ):
            self.store.transition(job.id, state)
        coordinator.reconcile()
        self.assertEqual(self.store.get_job(job.id).state, "recovery_required")  # type: ignore[union-attr]

    def test_reconcile_marks_pre_switch_interruption_failed(self) -> None:
        deployer = FakeDeployer(self.root)
        job = self.create()
        self.store.transition(job.id, "verifying_release")
        self.coordinator(deployer).reconcile()
        result = self.store.get_job(job.id)
        self.assertEqual(result.state, "failed_pre_switch")  # type: ignore[union-attr]
        self.assertEqual(result.error_code, "interrupted")  # type: ignore[union-attr]
        self.assertIn("cleanup_artifacts", deployer.calls)

    def test_reconcile_rolls_back_when_current_link_is_not_the_staged_release(self) -> None:
        deployer = FakeDeployer(
            self.root,
            current_revision=self.releases.release.commit,
            current_version=self.releases.release.version,
        )
        job = self.create()
        self.store.set_release_paths(
            job.id,
            previous_version="1.0.0",
            previous_revision="1" * 40,
            previous_release=str(self.root / "old"),
            staged_release=str(self.root / "new"),
        )
        for state in (
            "verifying_release",
            "pulling_artifacts",
            "staging_release",
            "rehearsing_migration",
            "backing_up",
            "ready_to_switch",
            "switching",
        ):
            self.store.transition(job.id, state)

        self.coordinator(deployer).reconcile()

        result = self.store.get_job(job.id)
        self.assertEqual(result.state, "rolled_back")  # type: ignore[union-attr]
        self.assertIn("rollback", deployer.calls)

    def test_wire_results_are_direct_jobs_and_null(self) -> None:
        deployer = FakeDeployer(self.root)
        coordinator = self.coordinator(deployer)
        app = UpdaterApplication(
            self.store,
            self.releases,
            deployer,
            coordinator,
            worker_launcher=lambda _job_id: None,
        )
        self.assertIsNone(app.dispatch("get_active_job", {}))
        created = app.dispatch(
            "create_job",
            {
                "version": "1.1.0",
                "idempotencyKey": str(uuid.uuid4()),
                "actorHash": "a" * 64,
            },
        )
        self.assertEqual(created["state"], "queued")
        self.assertEqual(app.dispatch("get_job", {"jobId": created["id"]})["id"], created["id"])

    def test_rejects_same_version_and_downgrade(self) -> None:
        deployer = FakeDeployer(self.root)
        coordinator = self.coordinator(deployer)
        for version, current_version in (("1.0.0", "1.0.0"), ("1.0.0", "1.1.0")):
            deployer = FakeDeployer(self.root, current_version=current_version)
            app = UpdaterApplication(
                self.store,
                FakeReleases(manifest(version, "b" * 40)),
                deployer,
                coordinator,
                worker_launcher=lambda _job_id: None,
            )
            with self.assertRaises(UpdaterError) as raised:
                app.create_job(
                    {
                        "version": version,
                        "idempotencyKey": str(uuid.uuid4()),
                        "actorHash": "a" * 64,
                    }
                )
            self.assertEqual(raised.exception.code, "release_not_found")

    def test_replays_existing_job_before_release_or_current_version_checks(self) -> None:
        deployer = FakeDeployer(self.root)
        app = UpdaterApplication(
            self.store,
            self.releases,
            deployer,
            self.coordinator(deployer),
            worker_launcher=lambda _job_id: None,
        )
        key = str(uuid.uuid4())
        params = {"version": "1.1.0", "idempotencyKey": key, "actorHash": "a" * 64}
        created = app.create_job(params)
        self.releases.release = manifest("1.2.0", "b" * 40)
        deployer.current = CurrentRelease("1.1.0", "2" * 40, True, 4, str(self.root / "new"))

        replay = app.create_job(params)

        self.assertEqual(replay["id"], created["id"])
        self.assertEqual(deployer.calls, ["inspect_current"])


if __name__ == "__main__":
    unittest.main()
