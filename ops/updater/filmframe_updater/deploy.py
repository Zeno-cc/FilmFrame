from __future__ import annotations

import json
import os
import re
import shutil
import stat
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal, Optional, Protocol

from .config import Config
from .errors import DeploymentError, UpdaterError
from .models import CurrentRelease, Job, ReleaseManifest, parse_semver
from .release import ReleaseSource
from .system import CommandFailed, CommandRunner

DOCKER = "/usr/bin/docker"
CURL = "/usr/bin/curl"
COMPOSE_PROJECT_NAME = "filmframe"
SAFE_RELEASE_FILES = frozenset(
    {
        "compose.yaml",
        ".env.example",
        "ops/backup/README.md",
        "ops/backup/backup-access.sh",
        "ops/backup/check-access-backup.sh",
        "ops/backup/restore-access.sh",
        "ops/backup/filmframe-access-backup.service",
        "ops/backup/filmframe-access-backup.timer",
    }
)
EXECUTABLE_RELEASE_FILES = frozenset(
    {
        "ops/backup/backup-access.sh",
        "ops/backup/check-access-backup.sh",
        "ops/backup/restore-access.sh",
    }
)
BACKUP_NAME = re.compile(r"^access-[0-9]{8}T[0-9]{6}Z\.sqlite$")

SCHEMA_SCRIPT = """
import Database from 'better-sqlite3';
const db=new Database('/data/access.sqlite',{readonly:true,fileMustExist:true});
const row=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
db.close();
if(!Number.isInteger(row?.version))process.exit(2);
process.stdout.write(String(row.version));
""".strip()

class Deployer(Protocol):
    def inspect_current(self) -> CurrentRelease: ...

    def preflight(self, manifest: ReleaseManifest, current: CurrentRelease) -> None: ...

    def pull_artifacts(self, manifest: ReleaseManifest, job: Job) -> Path: ...

    def stage_release(self, manifest: ReleaseManifest, job: Job, bundle: Path) -> Path: ...

    def rehearse_migration(self, manifest: ReleaseManifest, job: Job) -> None: ...

    def final_backup(self) -> None: ...

    def switch(self, release: Path, job: Job) -> None: ...

    def verify_loopback(
        self,
        manifest: ReleaseManifest,
        *,
        revision: str,
        release: Path,
        expected_schema: Optional[int] = None,
        allowed_schemas: Optional[frozenset[int]] = None,
    ) -> None: ...

    def verify_origin(self) -> None: ...

    def verify_public(self) -> None: ...

    def rollback(self, job: Job, manifest: ReleaseManifest) -> None: ...

    def cleanup_artifacts(self, job: Job) -> None: ...


@dataclass(frozen=True)
class RuntimeIdentity:
    filmframe_image: str
    access_image: str
    revision: str


class ProductionDeployer:
    def __init__(
        self,
        config: Config,
        runner: CommandRunner,
        source: ReleaseSource,
        *,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config = config
        self.runner = runner
        self.source = source
        self.sleeper = sleeper
        self._production_data_volume: Optional[str] = None

    def inspect_current(self) -> CurrentRelease:
        release = self._current_release_path()
        values = _read_env(release / ".env")
        version = values.get("FILMFRAME_VERSION") or values.get("FILMFRAME_RELEASE", "")
        try:
            parse_semver(version)
        except ValueError:
            version = self.config.bootstrap_current_version
        revision = values.get("FILMFRAME_REVISION", "")
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise DeploymentError("preflight_failed")
        schema = self._schema_version(release)
        healthy = self._services_healthy(release)
        return CurrentRelease(version, revision, healthy, schema, str(release))

    def preflight(self, manifest: ReleaseManifest, current: CurrentRelease) -> None:
        try:
            if not current.healthy or current.schema_version != manifest.database.schema_from:
                raise DeploymentError("preflight_failed")
            if parse_semver(manifest.version) <= parse_semver(current.version):
                raise DeploymentError("preflight_failed")
            if parse_semver(current.version) < parse_semver(manifest.database.rollback_floor):
                raise DeploymentError("migration_incompatible")
            from .models import UPDATER_VERSION

            if parse_semver(UPDATER_VERSION) < parse_semver(manifest.min_updater_version):
                raise DeploymentError("updater_upgrade_required")
            if not manifest.database.backward_compatible:
                raise DeploymentError("migration_incompatible")
            self.config.release_root.mkdir(mode=0o750, parents=True, exist_ok=True)
            if self.config.release_root.is_symlink():
                raise DeploymentError("preflight_failed")
            free = shutil.disk_usage(self.config.release_root).free
            if free < 2 * 1024 * 1024 * 1024:
                raise DeploymentError("preflight_failed")
            self.runner.run([DOCKER, "version", "--format", "{{.Server.Version}}"], timeout=30)
            self.runner.run([CURL, "--version"], timeout=30)
            self._test_openresty()
            self._compose(release=Path(current.release_path), tail=["config", "--quiet"], timeout=30)
            self._assert_loopback_ports(Path(current.release_path))
            self._production_data_volume = self._assert_compose_security(
                Path(current.release_path), boundary="current"
            )
        except DeploymentError:
            raise
        except (CommandFailed, OSError, ValueError) as exc:
            raise DeploymentError("preflight_failed") from exc

    def pull_artifacts(self, manifest: ReleaseManifest, job: Job) -> Path:
        directory = self.config.artifact_root / job.id
        try:
            self.config.artifact_root.mkdir(mode=0o700, parents=True, exist_ok=True)
            if self.config.artifact_root.is_symlink():
                raise DeploymentError("artifact_pull_failed")
            directory.mkdir(mode=0o700)
            bundle = directory / f"filmframe-deploy-{manifest.version}.tar.gz"
            self.source.download_bundle(manifest, bundle)
            self.runner.run([DOCKER, "pull", manifest.filmframe_image], timeout=900)
            self.runner.run([DOCKER, "pull", manifest.access_image], timeout=900)
            self.source.verify_bundle_and_images(manifest, bundle)
            return bundle
        except UpdaterError as exc:
            if exc.code == "release_untrusted":
                raise DeploymentError("release_untrusted") from exc
            raise DeploymentError("artifact_pull_failed") from exc
        except (CommandFailed, OSError) as exc:
            raise DeploymentError("artifact_pull_failed") from exc

    def stage_release(self, manifest: ReleaseManifest, job: Job, bundle: Path) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        final = self.config.release_root / f"{timestamp}-v{manifest.version}-{manifest.commit[:12]}"
        try:
            if final.exists() or final.is_symlink():
                raise DeploymentError("staging_failed")
            with tempfile.TemporaryDirectory(prefix=".filmframe-stage-", dir=self.config.release_root) as temporary:
                extracted = Path(temporary) / "release"
                extracted.mkdir(mode=0o750)
                _extract_bundle(bundle, extracted, manifest.version)
                self._write_release_env(extracted, manifest)
                self._compose(release=extracted, tail=["config", "--quiet"], timeout=30)
                self._assert_loopback_ports(extracted)
                candidate_data_volume = self._assert_compose_security(
                    extracted, boundary="candidate"
                )
                if (
                    self._production_data_volume is None
                    or candidate_data_volume != self._production_data_volume
                ):
                    raise DeploymentError("staging_failed")
                os.rename(extracted, final)
            return final
        except DeploymentError:
            raise
        except (CommandFailed, OSError, tarfile.TarError, ValueError) as exc:
            raise DeploymentError("staging_failed") from exc

    def rehearse_migration(self, manifest: ReleaseManifest, job: Job) -> None:
        current = self._current_release_path()
        volume = f"filmframe_access_restore_update_{job.id.replace('-', '')}"
        container = f"filmframe-update-rehearsal-{job.id[:12]}"
        try:
            self._run_backup(current)
            backup_name = self._latest_backup_name()
            current_env = _read_env(current / ".env")
            current_access_image = current_env.get("FILMFRAME_ACCESS_IMAGE")
            if not current_access_image:
                raise DeploymentError("migration_rehearsal_failed")
            self.runner.run(
                [str(current / "ops/backup/restore-access.sh"), backup_name, volume],
                cwd=current,
                environment={"FILMFRAME_ACCESS_IMAGE": current_access_image},
                timeout=600,
            )
            self.runner.run(
                [
                    DOCKER,
                    "run",
                    "--detach",
                    "--name",
                    container,
                    "--network",
                    "none",
                    "--read-only",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges:true",
                    "--user",
                    "10001:10001",
                    "--tmpfs",
                    "/tmp:size=16m,mode=1777",
                    "--env-file",
                    str(current / ".env"),
                    "--env",
                    "NODE_ENV=production",
                    "--env",
                    "HOST=0.0.0.0",
                    "--env",
                    "PORT=3000",
                    "--env",
                    "DATABASE_PATH=/data/access.sqlite",
                    "-v",
                    f"{volume}:/data",
                    manifest.access_image,
                ],
                timeout=300,
            )
            for _attempt in range(30):
                health = self.runner.run(
                    [DOCKER, "inspect", "--format", "{{.State.Health.Status}}", container], timeout=30
                ).text().strip()
                if health == "healthy":
                    break
                if health == "unhealthy":
                    raise DeploymentError("migration_rehearsal_failed")
                self.sleeper(2)
            else:
                raise DeploymentError("migration_rehearsal_failed")
            result = self.runner.run(
                [
                    DOCKER,
                    "exec",
                    container,
                    "node",
                    "--input-type=module",
                    "-e",
                    SCHEMA_SCRIPT,
                ],
                timeout=30,
            ).text().strip()
            if result != str(manifest.database.schema_to):
                raise DeploymentError("migration_rehearsal_failed")
        except DeploymentError:
            raise
        except (CommandFailed, OSError, UnicodeDecodeError) as exc:
            raise DeploymentError("migration_rehearsal_failed") from exc
        finally:
            try:
                self.runner.run([DOCKER, "rm", "--force", container], timeout=60)
            except CommandFailed:
                pass
            try:
                self.runner.run([DOCKER, "volume", "rm", "--force", volume], timeout=60)
            except CommandFailed:
                pass

    def final_backup(self) -> None:
        try:
            self._run_backup(self._current_release_path())
        except (CommandFailed, DeploymentError, OSError) as exc:
            raise DeploymentError("backup_failed") from exc

    def switch(self, release: Path, job: Job) -> None:
        try:
            target = self._validated_release_path(release)
            temporary = self.config.current_link.parent / f".current-{job.id}"
            if temporary.exists() or temporary.is_symlink():
                temporary.unlink()
            os.symlink(target, temporary)
            os.replace(temporary, self.config.current_link)
            self._compose(
                release=self.config.current_link,
                tail=["up", "-d", "--no-deps", "--force-recreate", "filmframe", "access"],
                timeout=300,
            )
        except (CommandFailed, OSError, ValueError) as exc:
            raise DeploymentError("switch_failed") from exc

    def verify_loopback(
        self,
        manifest: ReleaseManifest,
        *,
        revision: str,
        release: Path,
        expected_schema: Optional[int] = None,
        allowed_schemas: Optional[frozenset[int]] = None,
    ) -> None:
        try:
            expected = _runtime_identity(release)
            if expected.revision != revision:
                raise DeploymentError("health_check_failed")
            for _attempt in range(30):
                if self._services_healthy(release) and self._loopback_probes():
                    break
                self.sleeper(2)
            else:
                raise DeploymentError("health_check_failed")
            self._verify_container_identity(release, expected)
            schema = self._schema_version(release)
            if allowed_schemas is not None:
                schema_valid = schema in allowed_schemas
            else:
                schema_valid = schema == (
                    manifest.database.schema_to if expected_schema is None else expected_schema
                )
            if not schema_valid:
                raise DeploymentError("health_check_failed")
        except DeploymentError:
            raise
        except (CommandFailed, OSError, ValueError) as exc:
            raise DeploymentError("health_check_failed") from exc

    def verify_origin(self) -> None:
        try:
            self._test_openresty()
            main = self._curl_status(
                f"https://{self.config.filmframe_host}/",
                resolve=f"{self.config.filmframe_host}:443:{self.config.origin_ip}",
            )
            admin = self._curl_status(
                f"https://{self.config.admin_host}/",
                resolve=f"{self.config.admin_host}:443:{self.config.origin_ip}",
            )
            if main != "303" or admin not in {"401", "403"}:
                raise DeploymentError("health_check_failed")
        except (CommandFailed, OSError) as exc:
            raise DeploymentError("health_check_failed") from exc

    def verify_public(self) -> None:
        try:
            main = self._curl_status(f"https://{self.config.filmframe_host}/")
            admin = self._curl_status(f"https://{self.config.admin_host}/")
            if main != "303" or admin != "302":
                raise DeploymentError("health_check_failed")
        except (CommandFailed, OSError) as exc:
            raise DeploymentError("health_check_failed") from exc

    def rollback(self, job: Job, manifest: ReleaseManifest) -> None:
        if not job.previous_release or not job.previous_revision:
            raise DeploymentError("rollback_failed")
        previous = Path(job.previous_release)
        try:
            self.switch(previous, job)
            self.verify_loopback(
                manifest,
                revision=job.previous_revision,
                release=previous,
                allowed_schemas=frozenset(
                    {manifest.database.schema_from, manifest.database.schema_to}
                ),
            )
            self.verify_origin()
            self.verify_public()
        except DeploymentError as exc:
            raise DeploymentError("rollback_failed") from exc

    def cleanup_artifacts(self, job: Job) -> None:
        container = f"filmframe-update-rehearsal-{job.id[:12]}"
        volume = f"filmframe_access_restore_update_{job.id.replace('-', '')}"
        for arguments in (
            [DOCKER, "rm", "--force", container],
            [DOCKER, "volume", "rm", "--force", volume],
        ):
            try:
                self.runner.run(arguments, timeout=60)
            except CommandFailed:
                pass
        directory = self.config.artifact_root / job.id
        if self.config.artifact_root.is_symlink():
            raise OSError("artifact root is a symbolic link")
        if directory.parent == self.config.artifact_root and directory.is_dir() and not directory.is_symlink():
            shutil.rmtree(directory)

    def _write_release_env(self, release: Path, manifest: ReleaseManifest) -> None:
        current_env = self._current_release_path() / ".env"
        source_info = current_env.lstat()
        source_mode = stat.S_IMODE(source_info.st_mode)
        if (
            not stat.S_ISREG(source_info.st_mode)
            or current_env.is_symlink()
            or source_info.st_uid not in {0, os.geteuid()}
            or source_mode & 0o077
            or source_mode & 0o200 == 0
        ):
            raise DeploymentError("staging_failed")
        source = current_env.read_text(encoding="utf-8")
        values = {
            "FILMFRAME_VERSION": manifest.version,
            "FILMFRAME_RELEASE": manifest.version,
            "FILMFRAME_REVISION": manifest.commit,
            "FILMFRAME_IMAGE": manifest.filmframe_image,
            "FILMFRAME_ACCESS_IMAGE": manifest.access_image,
        }
        result = _replace_env(source, values)
        destination = release / ".env"
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as output:
            output.write(result)
            output.flush()
            os.fsync(output.fileno())
        destination.chmod(source_mode)

    def _run_backup(self, release: Path) -> None:
        backup = release / "ops/backup/backup-access.sh"
        check = release / "ops/backup/check-access-backup.sh"
        for script in (backup, check):
            if not script.is_file() or script.is_symlink():
                raise CommandFailed("backup helper unavailable")
        self.runner.run(
            [str(backup)],
            cwd=release,
            environment={"COMPOSE_PROJECT_NAME": COMPOSE_PROJECT_NAME},
            timeout=600,
        )
        self.runner.run([str(check)], cwd=release, timeout=120)

    def _latest_backup_name(self) -> str:
        candidates = [
            entry
            for entry in self.config.backup_root.iterdir()
            if entry.is_file() and not entry.is_symlink() and BACKUP_NAME.fullmatch(entry.name)
        ]
        if not candidates:
            raise DeploymentError("migration_rehearsal_failed")
        return max(candidates, key=lambda path: path.stat().st_mtime_ns).name

    def _current_release_path(self) -> Path:
        if not self.config.current_link.is_symlink():
            raise DeploymentError("preflight_failed")
        return self._validated_release_path(self.config.current_link.resolve(strict=True))

    def _validated_release_path(self, release: Path) -> Path:
        root = self.config.release_root.resolve(strict=True)
        target = release.resolve(strict=True)
        if target.parent != root or target == root or target.is_symlink() or not target.is_dir():
            raise DeploymentError("preflight_failed")
        return target

    def _compose(self, *, release: Path, tail: list[str], timeout: int):
        return self.runner.run(
            [
                DOCKER,
                "compose",
                "--project-name",
                COMPOSE_PROJECT_NAME,
                "--project-directory",
                str(release),
                "-f",
                str(release / "compose.yaml"),
                *tail,
            ],
            cwd=release,
            timeout=timeout,
        )

    def _services_healthy(self, release: Path) -> bool:
        try:
            output = self._compose(
                release=release,
                tail=["ps", "--format", "json", "filmframe", "access"],
                timeout=30,
            ).text()
            records = _json_records(output)
            by_service = {record.get("Service"): record for record in records}
            return all(
                by_service.get(service, {}).get("State") == "running"
                and by_service.get(service, {}).get("Health") == "healthy"
                for service in ("filmframe", "access")
            )
        except (CommandFailed, UnicodeDecodeError, ValueError):
            return False

    def _loopback_probes(self) -> bool:
        return _http_ok("http://127.0.0.1:18082/healthz", host="filmframe") and _http_ok(
            "http://127.0.0.1:18083/healthz", host="access"
        )

    def _schema_version(self, release: Path) -> int:
        result = self._compose(
            release=release,
            tail=[
                "exec",
                "-T",
                "access",
                "node",
                "--input-type=module",
                "-e",
                SCHEMA_SCRIPT,
            ],
            timeout=30,
        ).text().strip()
        if not result.isdigit():
            raise DeploymentError("health_check_failed")
        return int(result)

    def _verify_container_identity(self, release: Path, expected: RuntimeIdentity) -> None:
        for service, expected_image in (
            ("filmframe", expected.filmframe_image),
            ("access", expected.access_image),
        ):
            container_id = self._compose(
                release=release, tail=["ps", "-q", service], timeout=30
            ).text().strip()
            if not re.fullmatch(r"[0-9a-f]{12,64}", container_id):
                raise DeploymentError("health_check_failed")
            identity = self.runner.run(
                [
                    DOCKER,
                    "inspect",
                    "--format",
                    '{{.Config.Image}}|{{index .Config.Labels "org.opencontainers.image.revision"}}',
                    container_id,
                ],
                timeout=30,
            ).text().strip()
            if identity != f"{expected_image}|{expected.revision}":
                raise DeploymentError("health_check_failed")

    def _assert_loopback_ports(self, release: Path) -> None:
        output = self._compose(
            release=release,
            tail=["--profile", "maintenance", "config", "--format", "json"],
            timeout=30,
        ).text()
        config = json.loads(output)
        services = config.get("services") if isinstance(config, dict) else None
        if not isinstance(services, dict):
            raise DeploymentError("preflight_failed")
        expected_ports = {"filmframe": (18082, 80), "access": (18083, 3000)}
        for service, (published, target) in expected_ports.items():
            definition = services.get(service)
            ports = definition.get("ports") if isinstance(definition, dict) else None
            if not isinstance(ports, list) or len(ports) != 1:
                raise DeploymentError("preflight_failed")
            for port in ports:
                if (
                    not isinstance(port, dict)
                    or port.get("host_ip") != "127.0.0.1"
                    or int(port.get("published", -1)) != published
                    or int(port.get("target", -1)) != target
                ):
                    raise DeploymentError("preflight_failed")

    def _assert_compose_security(
        self, release: Path, *, boundary: Literal["current", "candidate"]
    ) -> str:
        output = self._compose(
            release=release,
            tail=["--profile", "maintenance", "config", "--format", "json"],
            timeout=30,
        ).text()
        config = json.loads(output)
        services = config.get("services") if isinstance(config, dict) else None
        if not isinstance(services, dict):
            raise DeploymentError("preflight_failed")
        if set(services) != {"filmframe", "access", "access-backup"}:
            raise DeploymentError("preflight_failed")
        for name in ("filmframe", "access", "access-backup"):
            service = services.get(name)
            if not isinstance(service, dict):
                raise DeploymentError("preflight_failed")
            if (
                service.get("read_only") is not True
                or "ALL" not in service.get("cap_drop", [])
                or "no-new-privileges:true" not in service.get("security_opt", [])
                or service.get("privileged") is True
                or service.get("network_mode") == "host"
                or service.get("devices")
            ):
                raise DeploymentError("preflight_failed")
        filmframe = services["filmframe"]
        if filmframe.get("volumes") or set(filmframe.get("cap_add", [])) != {
            "CHOWN",
            "DAC_OVERRIDE",
            "SETGID",
            "SETUID",
        }:
            raise DeploymentError("preflight_failed")
        access = services["access"]
        if access.get("cap_add"):
            raise DeploymentError("preflight_failed")
        groups = access.get("group_add", [])
        if not isinstance(groups, list):
            raise DeploymentError("preflight_failed")
        actual_groups = {str(value) for value in groups}
        expected_groups = {str(value) for value in self.config.socket_group_gids}
        volumes = access.get("volumes", [])
        if not isinstance(volumes, list):
            raise DeploymentError("preflight_failed")
        targets: set[str] = set()
        access_data_volume: Optional[str] = None
        for volume in volumes:
            if not isinstance(volume, dict):
                raise DeploymentError("preflight_failed")
            target = volume.get("target")
            source = volume.get("source")
            volume_type = volume.get("type")
            targets.add(target)
            if target == "/data":
                if (
                    volume_type != "volume"
                    or not isinstance(source, str)
                    or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,254}", source)
                ):
                    raise DeploymentError("preflight_failed")
                access_data_volume = source
            elif target == "/run/filmframe-updater":
                if (
                    volume_type != "bind"
                    or source != "/run/filmframe-updater"
                    or volume.get("read_only") is not True
                ):
                    raise DeploymentError("preflight_failed")
            else:
                raise DeploymentError("preflight_failed")
            if source in {"/var/run/docker.sock", "/run/docker.sock"}:
                raise DeploymentError("preflight_failed")
        updater_targets = {"/data", "/run/filmframe-updater"}
        if boundary == "candidate":
            if (
                not expected_groups
                or actual_groups != expected_groups
                or len(volumes) != 2
                or targets != updater_targets
            ):
                raise DeploymentError("preflight_failed")
        elif boundary == "current":
            legacy = len(volumes) == 1 and targets == {"/data"} and not actual_groups
            managed = (
                bool(expected_groups)
                and actual_groups == expected_groups
                and len(volumes) == 2
                and targets == updater_targets
            )
            if not legacy and not managed:
                raise DeploymentError("preflight_failed")
        else:
            raise DeploymentError("preflight_failed")

        backup = services["access-backup"]
        if (
            backup.get("network_mode") != "none"
            or backup.get("ports")
            or set(backup.get("cap_add", [])) != {"DAC_OVERRIDE"}
        ):
            raise DeploymentError("preflight_failed")
        backup_volumes = backup.get("volumes")
        if not isinstance(backup_volumes, list) or len(backup_volumes) != 2:
            raise DeploymentError("preflight_failed")
        backup_targets: set[str] = set()
        for volume in backup_volumes:
            if not isinstance(volume, dict):
                raise DeploymentError("preflight_failed")
            target = volume.get("target")
            backup_targets.add(target)
            if target == "/data" and (
                volume.get("type") != "volume"
                or volume.get("source") != access_data_volume
            ):
                raise DeploymentError("preflight_failed")
            elif target == "/backups" and (
                volume.get("type") != "bind"
                or volume.get("source") != str(self.config.backup_root)
            ):
                raise DeploymentError("preflight_failed")
            elif target not in {"/data", "/backups"}:
                raise DeploymentError("preflight_failed")
        if backup_targets != {"/data", "/backups"}:
            raise DeploymentError("preflight_failed")
        if access_data_volume is None:
            raise DeploymentError("preflight_failed")
        return access_data_volume

    def _test_openresty(self) -> None:
        self.runner.run(
            [DOCKER, "exec", self.config.openresty_container, "openresty", "-t"], timeout=30
        )

    def _curl_status(self, url: str, *, resolve: Optional[str] = None) -> str:
        arguments = [
            CURL,
            "--silent",
            "--show-error",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            "--max-time",
            "20",
        ]
        if resolve:
            arguments.extend(["--noproxy", "*", "--resolve", resolve])
        arguments.append(url)
        result = self.runner.run(arguments, timeout=30).text().strip()
        if not re.fullmatch(r"[0-9]{3}", result):
            raise CommandFailed("invalid HTTP result")
        return result


def _extract_bundle(bundle: Path, destination: Path, version: str) -> None:
    prefix = f"filmframe-{version}/"
    total = 0
    seen: set[str] = set()
    with tarfile.open(bundle, mode="r:gz") as archive:
        for member in archive.getmembers():
            if member.name == prefix.rstrip("/") and member.isdir():
                continue
            if not member.name.startswith(prefix):
                raise ValueError("bundle root is invalid")
            relative = member.name[len(prefix) :]
            if not relative or relative.startswith("/") or ".." in Path(relative).parts:
                raise ValueError("bundle path is invalid")
            if member.isdir():
                continue
            if not member.isfile() or relative not in SAFE_RELEASE_FILES or relative in seen:
                raise ValueError("bundle member is invalid")
            total += member.size
            if total > 16 * 1024 * 1024:
                raise ValueError("bundle expands beyond its limit")
            source = archive.extractfile(member)
            if source is None:
                raise ValueError("bundle file is unavailable")
            target = destination / relative
            target.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
            mode = 0o750 if relative in EXECUTABLE_RELEASE_FILES else 0o640
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, mode)
            with source, os.fdopen(descriptor, "wb") as output:
                shutil.copyfileobj(source, output, length=64 * 1024)
            seen.add(relative)
    required = {"compose.yaml", ".env.example", *EXECUTABLE_RELEASE_FILES}
    if not required.issubset(seen):
        raise ValueError("bundle is missing required files")


def _read_env(path: Path) -> dict[str, str]:
    info = path.lstat()
    mode = stat.S_IMODE(info.st_mode)
    if (
        not stat.S_ISREG(info.st_mode)
        or path.is_symlink()
        or info.st_size > 256 * 1024
        or info.st_uid not in {0, os.geteuid()}
        or mode & 0o077
    ):
        raise ValueError("invalid environment file")
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if re.fullmatch(r"[A-Z][A-Z0-9_]*", key) and key not in result:
            result[key] = value.strip().strip('"').strip("'")
    return result


def _replace_env(source: str, replacements: dict[str, str]) -> str:
    lines = source.splitlines()
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        match = re.match(r"^([A-Z][A-Z0-9_]*)=", line)
        if match and match.group(1) in replacements:
            key = match.group(1)
            if key in seen:
                raise ValueError("duplicate managed environment key")
            output.append(f"{key}={replacements[key]}")
            seen.add(key)
        else:
            output.append(line)
    for key, value in replacements.items():
        if key not in seen:
            output.append(f"{key}={value}")
    return "\n".join(output) + "\n"


def _runtime_identity(release: Path) -> RuntimeIdentity:
    values = _read_env(release / ".env")
    identity = RuntimeIdentity(
        values.get("FILMFRAME_IMAGE", ""),
        values.get("FILMFRAME_ACCESS_IMAGE", ""),
        values.get("FILMFRAME_REVISION", ""),
    )
    if not identity.filmframe_image or not identity.access_image or not re.fullmatch(
        r"[0-9a-f]{40}", identity.revision
    ):
        raise ValueError("release identity is incomplete")
    return identity


def _json_records(output: str) -> list[dict]:
    stripped = output.strip()
    if not stripped:
        return []
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        records = [json.loads(line) for line in stripped.splitlines()]
        if all(isinstance(item, dict) for item in records):
            return records
    raise ValueError("invalid Compose status")


def _http_ok(url: str, *, host: str) -> bool:
    request = urllib.request.Request(url, headers={"Host": host}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False
