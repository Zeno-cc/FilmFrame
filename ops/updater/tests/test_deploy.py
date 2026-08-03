from __future__ import annotations

import io
import json
import stat
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from filmframe_updater.config import Config
from filmframe_updater.deploy import ProductionDeployer, _extract_bundle
from filmframe_updater.errors import DeploymentError, UpdaterError
from filmframe_updater.system import CommandResult
from tests.helpers import manifest


class NoopSource:
    pass


class UntrustedSource:
    def download_bundle(self, release, destination):
        raise UpdaterError("release_untrusted")


class RecordingRunner:
    def __init__(self, compose_config: dict | None = None) -> None:
        self.calls: list[list[str]] = []
        self.compose_config = compose_config

    def run(self, arguments, **_options):
        args = list(arguments)
        self.calls.append(args)
        if "config" in args and "--format" in args:
            return CommandResult(json.dumps(self.compose_config).encode())
        if "inspect" in args:
            return CommandResult(b"healthy")
        if "exec" in args and "node" in args:
            return CommandResult(b"4")
        return CommandResult(b"")


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
        }
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
        for service in ("access", "access-backup"):
            restored["services"][service]["volumes"][0]["source"] = (
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


if __name__ == "__main__":
    unittest.main()
