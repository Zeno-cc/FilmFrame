from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

UPDATER_VERSION = "1.0.2"
PROTOCOL_VERSION = 1

SEMVER_PATTERN = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
ACTOR_HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FILMFRAME_IMAGE_PATTERN = re.compile(
    r"^ghcr\.io/zeno-cc/filmframe/filmframe@sha256:[0-9a-f]{64}$"
)
ACCESS_IMAGE_PATTERN = re.compile(r"^ghcr\.io/zeno-cc/filmframe/access@sha256:[0-9a-f]{64}$")

JOB_STATES = (
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
    "rolling_back",
    "succeeded",
    "failed_pre_switch",
    "rolled_back",
    "recovery_required",
)

TERMINAL_STATES = frozenset({"succeeded", "failed_pre_switch", "rolled_back"})
BLOCKING_STATES = frozenset(set(JOB_STATES) - TERMINAL_STATES)
PRE_SWITCH_STATES = frozenset(
    {
        "queued",
        "verifying_release",
        "pulling_artifacts",
        "staging_release",
        "rehearsing_migration",
        "backing_up",
        "ready_to_switch",
    }
)

ALLOWED_TRANSITIONS = {
    "queued": frozenset({"verifying_release", "failed_pre_switch"}),
    "verifying_release": frozenset({"pulling_artifacts", "failed_pre_switch"}),
    "pulling_artifacts": frozenset({"staging_release", "failed_pre_switch"}),
    "staging_release": frozenset({"rehearsing_migration", "failed_pre_switch"}),
    "rehearsing_migration": frozenset({"backing_up", "failed_pre_switch"}),
    "backing_up": frozenset({"ready_to_switch", "failed_pre_switch"}),
    "ready_to_switch": frozenset({"switching", "failed_pre_switch"}),
    "switching": frozenset({"verifying_loopback", "rolling_back"}),
    "verifying_loopback": frozenset({"verifying_origin", "rolling_back"}),
    "verifying_origin": frozenset({"verifying_public", "rolling_back"}),
    "verifying_public": frozenset({"succeeded", "rolling_back"}),
    "rolling_back": frozenset({"rolled_back", "recovery_required"}),
    "succeeded": frozenset(),
    "failed_pre_switch": frozenset(),
    "rolled_back": frozenset(),
    "recovery_required": frozenset(),
}

DEPLOYMENT_ERROR_CODES = frozenset(
    {
        "interrupted",
        "preflight_failed",
        "release_untrusted",
        "updater_upgrade_required",
        "migration_incompatible",
        "artifact_pull_failed",
        "staging_failed",
        "migration_rehearsal_failed",
        "backup_failed",
        "switch_failed",
        "health_check_failed",
        "rollback_failed",
    }
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_semver(value: str) -> tuple[int, int, int]:
    match = SEMVER_PATTERN.fullmatch(value)
    if not match:
        raise ValueError("invalid stable semantic version")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def require_exact_keys(value: Mapping[str, Any], required: set[str], optional: set[str] = set()) -> None:
    keys = set(value)
    if not required.issubset(keys) or not keys.issubset(required | optional):
        raise ValueError("unexpected object fields")


def _required_string(value: Any, *, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise ValueError("invalid string")
    return value


def _parse_timestamp(value: Any) -> str:
    text = _required_string(value, maximum=40)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", text):
        raise ValueError("invalid UTC timestamp")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError("timestamp must have a timezone")
    return text


@dataclass(frozen=True)
class DatabaseContract:
    schema_from: int
    schema_to: int
    rollback_floor: str
    backward_compatible: bool

    @classmethod
    def from_dict(cls, raw: Any) -> "DatabaseContract":
        if not isinstance(raw, dict):
            raise ValueError("database contract must be an object")
        require_exact_keys(raw, {"schemaFrom", "schemaTo", "rollbackFloor", "backwardCompatible"})
        schema_from = raw["schemaFrom"]
        schema_to = raw["schemaTo"]
        backward_compatible = raw["backwardCompatible"]
        if (
            isinstance(schema_from, bool)
            or not isinstance(schema_from, int)
            or not 1 <= schema_from <= 999
            or isinstance(schema_to, bool)
            or not isinstance(schema_to, int)
            or not schema_from <= schema_to <= 999
            or not isinstance(backward_compatible, bool)
            or not backward_compatible
        ):
            raise ValueError("invalid database contract")
        rollback_floor = _required_string(raw["rollbackFloor"], maximum=32)
        parse_semver(rollback_floor)
        return cls(schema_from, schema_to, rollback_floor, backward_compatible)

    def public_dict(self) -> dict[str, Any]:
        return {
            "schemaFrom": self.schema_from,
            "schemaTo": self.schema_to,
            "rollbackFloor": self.rollback_floor,
            "backwardCompatible": self.backward_compatible,
        }


@dataclass(frozen=True)
class SummaryItem:
    kind: str
    text: str

    @classmethod
    def from_dict(cls, raw: Any) -> "SummaryItem":
        if not isinstance(raw, dict):
            raise ValueError("summary entry must be an object")
        require_exact_keys(raw, {"kind", "text"})
        kind = _required_string(raw["kind"], maximum=20)
        if kind not in {"feature", "fix", "security"}:
            raise ValueError("invalid summary kind")
        text = _required_string(raw["text"], maximum=120).strip()
        original = raw["text"]
        if (
            text != original
            or len(text) < 8
            or not re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", text)
            or re.search(r"[<>\x00-\x1f]", text)
            or re.search(r"https?://", text, re.IGNORECASE)
        ):
            raise ValueError("invalid Chinese summary text")
        return cls(kind, text)

    def public_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "text": self.text}


@dataclass(frozen=True)
class ReleaseManifest:
    version: str
    commit: str
    published_at: str
    min_updater_version: str
    filmframe_image: str
    access_image: str
    bundle_url: str
    bundle_sha256: str
    database: DatabaseContract
    summary_zh: tuple[SummaryItem, ...]
    provenance_issuer: str
    provenance_repository: str
    provenance_workflow: str
    provenance_ref: str

    @classmethod
    def from_dict(cls, raw: Any) -> "ReleaseManifest":
        if not isinstance(raw, dict):
            raise ValueError("manifest must be an object")
        require_exact_keys(
            raw,
            {
                "manifestVersion",
                "version",
                "commit",
                "publishedAt",
                "minUpdaterVersion",
                "images",
                "deployBundle",
                "database",
                "summaryZh",
                "provenance",
            },
        )
        if raw["manifestVersion"] != 1:
            raise ValueError("unsupported manifest version")
        version = _required_string(raw["version"], maximum=32)
        version_tuple = parse_semver(version)
        commit = _required_string(raw["commit"], maximum=40)
        if not COMMIT_PATTERN.fullmatch(commit):
            raise ValueError("invalid commit")
        min_updater = _required_string(raw["minUpdaterVersion"], maximum=32)
        parse_semver(min_updater)

        images = raw["images"]
        if not isinstance(images, dict):
            raise ValueError("images must be an object")
        require_exact_keys(images, {"filmframe", "access"})
        filmframe_image = _required_string(images["filmframe"], maximum=240)
        access_image = _required_string(images["access"], maximum=240)
        if not FILMFRAME_IMAGE_PATTERN.fullmatch(filmframe_image):
            raise ValueError("invalid FilmFrame image")
        if not ACCESS_IMAGE_PATTERN.fullmatch(access_image):
            raise ValueError("invalid access image")

        bundle = raw["deployBundle"]
        if not isinstance(bundle, dict):
            raise ValueError("deployBundle must be an object")
        require_exact_keys(bundle, {"url", "sha256"})
        bundle_url = _required_string(bundle["url"], maximum=500)
        bundle_sha256 = _required_string(bundle["sha256"], maximum=64)
        expected_bundle_url = (
            f"https://github.com/Zeno-cc/FilmFrame/releases/download/v{version}/"
            f"filmframe-deploy-{version}.tar.gz"
        )
        if bundle_url != expected_bundle_url:
            raise ValueError("invalid bundle URL")
        if not re.fullmatch(r"[0-9a-f]{64}", bundle_sha256):
            raise ValueError("invalid bundle checksum")

        summary_raw = raw["summaryZh"]
        if not isinstance(summary_raw, list) or not 1 <= len(summary_raw) <= 6:
            raise ValueError("invalid Chinese summary")
        summary = tuple(SummaryItem.from_dict(item) for item in summary_raw)

        provenance = raw["provenance"]
        if not isinstance(provenance, dict):
            raise ValueError("provenance must be an object")
        require_exact_keys(provenance, {"issuer", "repository", "workflow", "ref"})
        if (
            provenance["issuer"] != "https://token.actions.githubusercontent.com"
            or provenance["repository"] != "Zeno-cc/FilmFrame"
            or provenance["workflow"] != ".github/workflows/release.yml"
            or provenance["ref"] != f"refs/tags/v{version}"
        ):
            raise ValueError("invalid provenance identity")

        database = DatabaseContract.from_dict(raw["database"])
        if parse_semver(database.rollback_floor) > version_tuple:
            raise ValueError("rollback floor is newer than release")

        return cls(
            version=version,
            commit=commit,
            published_at=_parse_timestamp(raw["publishedAt"]),
            min_updater_version=min_updater,
            filmframe_image=filmframe_image,
            access_image=access_image,
            bundle_url=bundle_url,
            bundle_sha256=bundle_sha256,
            database=database,
            summary_zh=summary,
            provenance_issuer=provenance["issuer"],
            provenance_repository=provenance["repository"],
            provenance_workflow=provenance["workflow"],
            provenance_ref=provenance["ref"],
        )

    def public_dict(self, *, installable: bool, blocked_reason: Optional[str] = None) -> dict[str, Any]:
        result: dict[str, Any] = {
            "version": self.version,
            "revision": self.commit,
            "publishedAt": self.published_at,
            "summaryZh": [item.public_dict() for item in self.summary_zh],
            "database": self.database.public_dict(),
            "installable": installable,
        }
        if blocked_reason:
            result["blockedReason"] = blocked_reason
        result["releaseUrl"] = f"https://github.com/Zeno-cc/FilmFrame/releases/tag/v{self.version}"
        return result

    def storage_dict(self) -> dict[str, Any]:
        result = {
            "manifestVersion": 1,
            "version": self.version,
            "commit": self.commit,
            "publishedAt": self.published_at,
            "minUpdaterVersion": self.min_updater_version,
            "images": {"filmframe": self.filmframe_image, "access": self.access_image},
            "deployBundle": {"url": self.bundle_url, "sha256": self.bundle_sha256},
            "database": self.database.public_dict(),
            "summaryZh": [item.public_dict() for item in self.summary_zh],
            "provenance": {
                "issuer": self.provenance_issuer,
                "repository": self.provenance_repository,
                "workflow": self.provenance_workflow,
                "ref": self.provenance_ref,
            },
        }
        return result


@dataclass(frozen=True)
class CurrentRelease:
    version: str
    revision: str
    healthy: bool
    schema_version: int
    release_path: Optional[str] = None

    def public_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "revision": self.revision,
            "healthy": self.healthy,
            "schemaVersion": self.schema_version,
        }


@dataclass(frozen=True)
class Job:
    id: str
    target_version: str
    target_revision: str
    state: str
    previous_version: Optional[str]
    previous_revision: Optional[str]
    previous_release: Optional[str]
    staged_release: Optional[str]
    created_at: str
    updated_at: str
    started_at: Optional[str]
    finished_at: Optional[str]
    error_code: Optional[str]
    retry_of: Optional[str]
    actor_hash: str

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "targetVersion": self.target_version,
            "targetRevision": self.target_revision,
            "state": self.state,
            "previousVersion": self.previous_version,
            "previousRevision": self.previous_revision,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "errorCode": self.error_code,
            "retryOf": self.retry_of,
        }
