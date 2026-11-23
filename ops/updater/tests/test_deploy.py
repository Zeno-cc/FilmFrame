from __future__ import annotations

import io
import json
import stat
import tarfile
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from filmframe_updater.config import Config
from filmframe_updater.deploy import ProductionDeployer, _extract_bundle
from filmframe_updater.errors import DeploymentError, UpdaterError
from filmframe_updater.models import CurrentRelease, Job
from filmframe_updater.system import CommandFailed, CommandResult
from tests.helpers import manifest


class NoopSource:
    pass


class UntrustedSource:
    def download_bundle(self, release, destination):
        raise UpdaterError("release_untrusted")


class RecordingRunner:
    def __init__(self, compose_config: dict | None = None, *, budget_output=None) -> None:
        self.calls: list[list[str]] = []
        self.compose_config = compose_config
        self.budget_output = budget_output

    def run(self, arguments, **_options):
        args = list(arguments)
        self.calls.append(args)
        if "config" in args and "--format" in args:
            return CommandResult(json.dumps(self.compose_config).encode())
        if "inspect" in args:
            return CommandResult(b"healthy")
        if "exec" in args and "node" in args:
            if "render_budget_settings" in args[-1]:
                if isinstance(self.budget_output, BaseException):
                    raise self.budget_output
                if self.budget_output is not None:
                    output = self.budget_output
                    return CommandResult(
                        output.encode() if isinstance(output, str) else output
                    )
            return CommandResult(b"4")
        return CommandResult(b"")


def budget_output(value) -> str:
    return json.dumps([value, 0])


def rollback_job(previous_version: str = "1.4.12") -> Job:
    return Job(
        id="9cb5c3d2-e26d-4f03-83d9-85e56e2b819b",
        target_version="1.5.0",
        target_revision="2" * 40,
        state="rolling_back",
        previous_version=previous_version,
        previous_revision="1" * 40,
        previous_release="previous",
        staged_release="candidate",
        created_at="2026-11-15T00:00:00Z",
        updated_at="2026-11-15T00:00:00Z",
        started_at="2026-11-15T00:00:00Z",
        finished_at=None,
        error_code="health_check_failed",
        retry_of=None,
        actor_hash="a" * 64,
    )


def secure_compose() -> dict:
    base = {
        "read_only": True,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
    }
    return {
        "services": {
            "filmframe": {
                **base,
                "cap_add": ["CHOWN", "DAC_OVERRIDE", "SETGID", "SETUID"],
                "ports": [{"host_ip": "127.0.0.1", "published": "18082", "target": 80}],
            },
            "access": {
                **base,
                "group_add": ["10001"],
                "ports": [{"host_ip": "127.0.0.1", "published": "18083", "target": 3000}],
                "volumes": [
                    {"type": "volume", "source": "filmframe_access_data", "target": "/data"},
                    {
                        "type": "bind",
                        "source": "/run/filmframe-updater",
                        "target": "/run/filmframe-updater",
                        "read_only": True,
                    },
                ],
            },
            "access-backup": {
                **base,
                "cap_add": ["DAC_OVERRIDE"],
                "network_mode": "none",
                "volumes": [
                    {"type": "volume", "source": "filmframe_access_data", "target": "/data"},
                    {
                        "type": "bind",
                        "source": "/opt/filmframe/backups/access",
                        "target": "/backups",
                    },
                ],
            },
        },
        "volumes": {"filmframe_access_data": {"name": "filmframe_access_data"}},
    }


class DeploymentBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.release_root = self.root / "releases"
        self.release_root.mkdir()
        self.old = self.release_root / "old"
        self.old.mkdir()
        env = self.old / ".env"
        env.write_text(
            "FILMFRAME_VERSION=1.0.0\n"
            f"FILMFRAME_REVISION={'1' * 40}\n"
            "FILMFRAME_IMAGE=filmframe:old\n"
            "FILMFRAME_ACCESS_IMAGE=filmframe-access:old\n"
            "SECRET=preserved\n",
            encoding="utf-8",
        )
        env.chmod(0o600)
        self.current = self.root / "current"
        self.current.symlink_to(self.old)
        self.config = Config(
            origin_ip="192.0.2.10",
            release_root=self.release_root,
            current_link=self.current,
            artifact_root=self.root / "artifacts",
            socket_group_gids=frozenset({10001}),
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_compose_contract_accepts_only_loopback_and_hardened_mounts(self) -> None:
        runner = RecordingRunner(secure_compose())
        deployer = ProductionDeployer(self.config, runner, NoopSource())  # type: ignore[arg-type]
        deployer._assert_loopback_ports(self.old)

        compose_calls = [call for call in runner.calls if "compose" in call]
        self.assertTrue(compose_calls)
        for call in compose_calls:
            project_index = call.index("--project-name")
            self.assertEqual(call[project_index + 1], "filmframe")
        deployer._assert_compose_security(self.old, boundary="candidate")

        unsafe = secure_compose()
        unsafe["services"]["access"]["volumes"].append(
            {"type": "bind", "source": "/var/run/docker.sock", "target": "/var/run/docker.sock"}
        )
        with self.assertRaises(DeploymentError):
            ProductionDeployer(
                self.config, RecordingRunner(unsafe), NoopSource()  # type: ignore[arg-type]
            )._assert_compose_security(self.old, boundary="candidate")

        static_mount = secure_compose()
        static_mount["services"]["filmframe"]["volumes"] = [
            {"type": "bind", "source": "/var/run/docker.sock", "target": "/var/run/docker.sock"}
        ]
        with self.assertRaises(DeploymentError):
            ProductionDeployer(
                self.config, RecordingRunner(static_mount), NoopSource()  # type: ignore[arg-type]
            )._assert_compose_security(self.old, boundary="candidate")

        for service in ("access", "access-backup"):
            wrong_data_volume = secure_compose()
            wrong_data_volume["services"][service]["volumes"][0]["source"] = "other_data"
            with self.subTest(service=service), self.assertRaises(DeploymentError):
                ProductionDeployer(
                    self.config,
                    RecordingRunner(wrong_data_volume),
                    NoopSource(),  # type: ignore[arg-type]
                )._assert_compose_security(self.old, boundary="candidate")

        restored = secure_compose()
        restored["volumes"]["filmframe_access_data"]["name"] = (
            "filmframe_access_restore_validated"
        )
        self.assertEqual(
            ProductionDeployer(
                self.config,
                RecordingRunner(restored),
                NoopSource(),  # type: ignore[arg-type]
            )._assert_compose_security(self.old, boundary="candidate"),
            "filmframe_access_restore_validated",
        )

        legacy = secure_compose()
        legacy_access = legacy["services"]["access"]
        legacy_access.pop("group_add")
        legacy_access["volumes"] = [legacy_access["volumes"][0]]
        legacy_deployer = ProductionDeployer(
            self.config,
            RecordingRunner(legacy),
            NoopSource(),  # type: ignore[arg-type]
        )
        self.assertEqual(
            legacy_deployer._assert_compose_security(self.old, boundary="current"),
            "filmframe_access_data",
        )
        with self.assertRaises(DeploymentError):
            legacy_deployer._assert_compose_security(self.old, boundary="candidate")

        missing_gid = secure_compose()
        missing_gid["services"]["access"].pop("group_add")
        with self.assertRaises(DeploymentError):
            ProductionDeployer(
                self.config,
                RecordingRunner(missing_gid),
                NoopSource(),  # type: ignore[arg-type]
            )._assert_compose_security(self.old, boundary="candidate")

        public = secure_compose()
        public["services"]["filmframe"]["ports"][0]["host_ip"] = "0.0.0.0"
        with self.assertRaises(DeploymentError):
            ProductionDeployer(
                self.config, RecordingRunner(public), NoopSource()  # type: ignore[arg-type]
            )._assert_loopback_ports(self.old)

    def test_staging_rejects_a_different_physical_database_volume(self) -> None:
        current = secure_compose()
        candidate = secure_compose()
        candidate["volumes"]["filmframe_access_data"]["name"] = "empty_data"
        runner = RecordingRunner(current)
        deployer = ProductionDeployer(self.config, runner, NoopSource())  # type: ignore[arg-type]
        deployer._production_data_volume = deployer._assert_compose_security(
            self.old, boundary="current"
        )
        runner.compose_config = candidate
        job = type("Job", (), {"id": "9cb5c3d2-e26d-4f03-83d9-85e56e2b819b"})()
        archive = self.root / "bundle.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            for name in (
                "compose.yaml", ".env.example", "ops/backup/backup-access.sh",
                "ops/backup/check-access-backup.sh", "ops/backup/restore-access.sh",
            ):
                info = tarfile.TarInfo(f"filmframe-1.1.0/{name}")
                info.size = 1
                output.addfile(info, io.BytesIO(b"x"))
        with self.assertRaises(DeploymentError) as raised:
            deployer.stage_release(manifest(), job, archive)  # type: ignore[arg-type]
        self.assertEqual(raised.exception.code, "staging_failed")
        self.assertEqual(self.current.resolve(), self.old.resolve())
        self.assertEqual(list(self.release_root.iterdir()), [self.old])

    def test_compose_rejects_missing_or_invalid_physical_volume_names(self) -> None:
        for definitions in ({}, {"filmframe_access_data": {}},
                            {"filmframe_access_data": {"name": "/host/data"}}):
            config = secure_compose()
            config["volumes"] = definitions
            with self.subTest(definitions=definitions), self.assertRaises(DeploymentError):
                ProductionDeployer(
                    self.config, RecordingRunner(config), NoopSource()  # type: ignore[arg-type]
                )._assert_compose_security(self.old, boundary="candidate")

    def test_release_env_preserves_secret_and_safe_mode(self) -> None:
        new = self.release_root / "new"
        new.mkdir()
        deployer = ProductionDeployer(
            self.config, RecordingRunner(), NoopSource()  # type: ignore[arg-type]
        )
        deployer._write_release_env(new, manifest())
        result = (new / ".env").read_text(encoding="utf-8")
        self.assertIn("SECRET=preserved", result)
        self.assertIn("FILMFRAME_VERSION=1.1.0", result)
        self.assertIn("FILMFRAME_IMAGE=ghcr.io/zeno-cc/filmframe/filmframe@sha256:", result)
        self.assertEqual(stat.S_IMODE((new / ".env").stat().st_mode), 0o600)

        (self.old / ".env").chmod(0o644)
        another = self.release_root / "another"
        another.mkdir()
        with self.assertRaises(DeploymentError):
            deployer._write_release_env(another, manifest())

    def test_rehearsal_starts_hardened_candidate_and_always_cleans_resources(self) -> None:
        runner = RecordingRunner()
        deployer = ProductionDeployer(
            self.config, runner, NoopSource(), sleeper=lambda _seconds: None  # type: ignore[arg-type]
        )
        job = type("Job", (), {"id": "9cb5c3d2-e26d-4f03-83d9-85e56e2b819b"})()
        with patch.object(deployer, "_run_backup"), patch.object(
            deployer, "_latest_backup_name", return_value="access-20260802T000000Z.sqlite"
        ):
            deployer.rehearse_migration(manifest(), job)  # type: ignore[arg-type]
        flattened = [" ".join(call) for call in runner.calls]
        run = next(call for call in flattened if "/usr/bin/docker run" in call)
        self.assertIn("--network none", run)
        self.assertIn("--read-only", run)
        self.assertIn("--cap-drop ALL", run)
        self.assertTrue(any("docker rm --force" in call for call in flattened))
        self.assertTrue(any("docker volume rm --force" in call for call in flattened))

    def test_untrusted_release_remains_a_trust_failure(self) -> None:
        job = type("Job", (), {"id": "9cb5c3d2-e26d-4f03-83d9-85e56e2b819b"})()
        deployer = ProductionDeployer(
            self.config, RecordingRunner(), UntrustedSource()  # type: ignore[arg-type]
        )
        with self.assertRaises(DeploymentError) as raised:
            deployer.pull_artifacts(manifest(), job)  # type: ignore[arg-type]
        self.assertEqual(raised.exception.code, "release_untrusted")

    def test_bundle_extraction_rejects_traversal_and_unlisted_files(self) -> None:
        for name in ("filmframe-1.1.0/../../escape", "filmframe-1.1.0/compose.override.yaml"):
            archive = self.root / ("bad-" + str(abs(hash(name))) + ".tar.gz")
            with tarfile.open(archive, "w:gz") as output:
                info = tarfile.TarInfo(name)
                info.size = 1
                output.addfile(info, io.BytesIO(b"x"))
            destination = self.root / ("extract-" + str(abs(hash(name))))
            destination.mkdir()
            with self.assertRaises(ValueError):
                _extract_bundle(archive, destination, "1.1.0")


class CanvasBudgetCompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.release_root = self.root / "releases"
        self.release_root.mkdir()
        self.old = self.release_root / "old"
        self.old.mkdir()
        self.env = self.old / ".env"
        self.env.write_text(
            "FILMFRAME_VERSION=1.4.12\n"
            f"FILMFRAME_REVISION={'1' * 40}\n"
            "FILMFRAME_IMAGE=filmframe:old\n"
            "FILMFRAME_ACCESS_IMAGE=filmframe-access:old\n"
            "SECRET=preserved\n",
            encoding="utf-8",
        )
        self.env.chmod(0o600)
        self.current = self.root / "current"
        self.current.symlink_to(self.old)
        self.config = Config(
            origin_ip="192.0.2.10",
            release_root=self.release_root,
            current_link=self.current,
            artifact_root=self.root / "artifacts",
            socket_group_gids=frozenset({10001}),
        )
        self.manifest = manifest("1.5.0", "2" * 40)
        self.job = rollback_job()
        self.job = Job(**{**self.job.__dict__, "previous_release": str(self.old)})

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def deployer(self, runner):
        return ProductionDeployer(self.config, runner, NoopSource())  # type: ignore[arg-type]

    def test_upgrade_accepts_128_700_and_2048_with_a_read_only_query(self) -> None:
        for value in (128, 700, 2048):
            with self.subTest(value=value):
                runner = RecordingRunner(secure_compose(), budget_output=budget_output(value))
                with patch.object(
                    self.deployer(runner), "_test_openresty"
                ), patch("filmframe_updater.deploy.shutil.disk_usage") as disk:
                    disk.return_value.free = 3 * 1024 * 1024 * 1024
                    current = CurrentRelease("1.4.12", "1" * 40, True, 3, str(self.old))
                    self.deployer(runner).preflight(self.manifest, current)
                budget_calls = [
                    call for call in runner.calls if "render_budget_settings" in call[-1]
                ]
                self.assertEqual(len(budget_calls), 1)
                script = budget_calls[0][-1]
                self.assertIn("readonly:true", script)
                self.assertIn("fileMustExist:true", script)
                self.assertIn("SELECT max_canvas_mib,updated_at", script)
                self.assertNotIn("UPDATE", script)
                self.assertNotIn("INSERT", script)

    def test_preflight_accepts_the_migrated_schema_only_for_the_matching_rollback(self) -> None:
        runner = RecordingRunner(secure_compose(), budget_output=budget_output(2048))
        deployer = self.deployer(runner)
        current = CurrentRelease("1.4.12", "1" * 40, True, 4, str(self.old))
        rollback = replace(self.job, state="rolled_back")
        with patch.object(deployer, "_test_openresty"), patch(
            "filmframe_updater.deploy.shutil.disk_usage"
        ) as disk:
            disk.return_value.free = 3 * 1024 * 1024 * 1024
            for evidence in (None, self.job, replace(rollback, target_revision="9" * 40)):
                with self.subTest(evidence=evidence):
                    with self.assertRaises(DeploymentError) as raised:
                        deployer.preflight(self.manifest, current, rollback=evidence)
                    self.assertEqual(raised.exception.code, "migration_incompatible")
            self.assertEqual(runner.calls, [])
            deployer.preflight(self.manifest, current, rollback=rollback)
        self.assertTrue(any("render_budget_settings" in call[-1] for call in runner.calls))

    def test_upgrade_accepts_6144_for_the_first_6gib_candidate(self) -> None:
        self.manifest = manifest("1.5.0")
        runner = RecordingRunner(secure_compose(), budget_output=budget_output(6144))
        deployer = self.deployer(runner)
        current = CurrentRelease("1.4.12", "1" * 40, True, 3, str(self.old))
        with patch.object(deployer, "_test_openresty"), patch(
            "filmframe_updater.deploy.shutil.disk_usage"
        ) as disk:
            disk.return_value.free = 3 * 1024 * 1024 * 1024
            deployer.preflight(self.manifest, current)
        self.assertTrue(any("render_budget_settings" in call[-1] for call in runner.calls))

    def test_upgrade_rejects_4096_for_the_published_1412_release(self) -> None:
        runner = RecordingRunner(secure_compose(), budget_output=budget_output(4096))
        deployer = self.deployer(runner)
        current = CurrentRelease("1.4.11", "1" * 40, True, 3, str(self.old))
        with patch.object(deployer, "_test_openresty"), patch(
            "filmframe_updater.deploy.shutil.disk_usage"
        ) as disk:
            disk.return_value.free = 3 * 1024 * 1024 * 1024
            with self.assertRaises(DeploymentError) as raised:
                deployer.preflight(manifest("1.4.12"), current)
        self.assertEqual(raised.exception.code, "migration_incompatible")
        self.assertFalse(any("pull" in call for call in runner.calls))

    def test_upgrade_rejects_values_outside_the_candidate_range(self) -> None:
        for value in (127, 6145):
            with self.subTest(value=value):
                runner = RecordingRunner(secure_compose(), budget_output=budget_output(value))
                deployer = self.deployer(runner)
                current = CurrentRelease("1.4.12", "1" * 40, True, 3, str(self.old))
                with patch.object(deployer, "_test_openresty"), patch(
                    "filmframe_updater.deploy.shutil.disk_usage"
                ) as disk:
                    disk.return_value.free = 3 * 1024 * 1024 * 1024
                    with self.assertRaises(DeploymentError) as raised:
                        deployer.preflight(self.manifest, current)
                self.assertEqual(raised.exception.code, "migration_incompatible")
                self.assertEqual(self.current.resolve(), self.old.resolve())

    def test_rollback_accepts_128_700_and_2048_before_switching(self) -> None:
        for value in (128, 700, 2048):
            with self.subTest(value=value):
                runner = RecordingRunner(budget_output=budget_output(value))
                deployer = self.deployer(runner)
                with patch.object(deployer, "switch") as switch, patch.object(
                    deployer, "verify_loopback"
                ), patch.object(deployer, "verify_origin"), patch.object(
                    deployer, "verify_public"
                ):
                    deployer.rollback(self.job, self.manifest)
                switch.assert_called_once_with(self.old, self.job)

    def test_rollback_accepts_6144_at_or_above_the_fixed_capability_boundary(self) -> None:
        for previous_version, manifest_version in (("1.5.0", "1.5.0"), ("1.5.1", "1.5.0"), ("1.5.0", "1.5.1")):
            with self.subTest(previous_version=previous_version, manifest_version=manifest_version):
                runner = RecordingRunner(budget_output=budget_output(6144))
                deployer = self.deployer(runner)
                job = Job(**{**self.job.__dict__, "previous_version": previous_version})
                with patch.object(deployer, "switch"), patch.object(
                    deployer, "verify_loopback"
                ), patch.object(deployer, "verify_origin"), patch.object(
                    deployer, "verify_public"
                ):
                    deployer.rollback(job, manifest(manifest_version))

    def test_rollback_rejects_2049_and_4096_without_switch_or_mutation(self) -> None:
        for value in (2049, 4096):
            with self.subTest(value=value):
                runner = RecordingRunner(budget_output=budget_output(value))
                deployer = self.deployer(runner)
                with patch.object(deployer, "switch") as switch, patch.object(
                    deployer, "verify_loopback"
                ) as verify:
                    with self.assertRaises(DeploymentError) as raised:
                        deployer.rollback(self.job, self.manifest)
                self.assertEqual(raised.exception.code, "migration_incompatible")
                switch.assert_not_called()
                verify.assert_not_called()
                self.assertFalse(any("up" in call for call in runner.calls))
                self.assertEqual(self.current.resolve(), self.old.resolve())
                self.assertEqual(
                    self.env.read_text(encoding="utf-8"),
                    "FILMFRAME_VERSION=1.4.12\n"
                    f"FILMFRAME_REVISION={'1' * 40}\n"
                    "FILMFRAME_IMAGE=filmframe:old\n"
                    "FILMFRAME_ACCESS_IMAGE=filmframe-access:old\n"
                    "SECRET=preserved\n",
                )

    def test_malformed_missing_and_failed_reads_fail_closed(self) -> None:
        cases = (
            "not-json",
            "[]",
            "[700]",
            "[700,0,1]",
            '["700",0]',
            "[700,-1]",
            "[true,0]",
            CommandFailed("missing table or row"),
            OSError("read failed"),
        )
        for output in cases:
            with self.subTest(output=output):
                runner = RecordingRunner(budget_output=output)
                deployer = self.deployer(runner)
                current = CurrentRelease("1.4.12", "1" * 40, True, 3, str(self.old))
                with patch.object(deployer, "_test_openresty"), patch.object(
                    deployer, "switch"
                ) as switch, patch("filmframe_updater.deploy.shutil.disk_usage") as disk:
                    disk.return_value.free = 3 * 1024 * 1024 * 1024
                    with self.assertRaises(DeploymentError) as raised:
                        deployer.preflight(self.manifest, current)
                self.assertEqual(raised.exception.code, "migration_incompatible")
                switch.assert_not_called()
                self.assertEqual(self.current.resolve(), self.old.resolve())

    def test_recovery_verifies_the_previous_running_release_without_switching(self) -> None:
        runner = RecordingRunner(budget_output=budget_output(2048))
        deployer = self.deployer(runner)
        current = CurrentRelease("1.4.12", "1" * 40, True, 7, str(self.old.resolve()))
        with patch.object(deployer, "inspect_current", return_value=current), patch.object(
            deployer, "switch"
        ) as switch, patch.object(deployer, "verify_loopback") as loopback, patch.object(
            deployer, "verify_origin"
        ) as origin, patch.object(deployer, "verify_public") as public:
            deployer.verify_recovery(self.job, self.manifest)
        switch.assert_not_called()
        loopback.assert_called_once()
        origin.assert_called_once()
        public.assert_called_once()

    def test_recovery_rejects_wrong_or_unhealthy_release_and_preserves_lock_state(self) -> None:
        runner = RecordingRunner(budget_output=budget_output(4096))
        deployer = self.deployer(runner)
        with patch.object(deployer, "inspect_current", return_value=CurrentRelease(
            "1.4.12", "1" * 40, True, 7, str(self.old)
        )), patch.object(deployer, "switch") as switch, patch.object(
            deployer, "verify_loopback"
        ) as loopback:
            with self.assertRaises(DeploymentError) as raised:
                deployer.verify_recovery(self.job, self.manifest)
        self.assertEqual(raised.exception.code, "migration_incompatible")
        switch.assert_not_called()
        loopback.assert_not_called()
        self.assertEqual(self.current.resolve(), self.old.resolve())

    def test_rollback_read_failure_preserves_the_specific_recovery_error(self) -> None:
        runner = RecordingRunner(budget_output=CommandFailed("database unreadable"))
        deployer = self.deployer(runner)
        with patch.object(deployer, "switch") as switch:
            with self.assertRaises(DeploymentError) as raised:
                deployer.rollback(self.job, self.manifest)
        self.assertEqual(raised.exception.code, "migration_incompatible")
        switch.assert_not_called()
        self.assertEqual(self.current.resolve(), self.old.resolve())


if __name__ == "__main__":
    unittest.main()
