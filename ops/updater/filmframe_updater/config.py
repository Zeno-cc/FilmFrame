from __future__ import annotations

import grp
import ipaddress
import json
import re
import stat
from dataclasses import dataclass
from pathlib import Path

from .models import parse_semver

CONFIG_PATH = Path("/etc/filmframe-updater/config.json")


@dataclass(frozen=True)
class Config:
    origin_ip: str
    state_path: Path = Path("/var/lib/filmframe-updater/state.sqlite")
    lock_path: Path = Path("/run/lock/filmframe-updater.lock")
    socket_path: Path = Path("/run/filmframe-updater/updater.sock")
    release_root: Path = Path("/opt/filmframe/releases")
    current_link: Path = Path("/opt/filmframe/current")
    backup_root: Path = Path("/opt/filmframe/backups/access")
    artifact_root: Path = Path("/var/lib/filmframe-updater/artifacts")
    allowed_peer_uids: frozenset[int] = frozenset({0, 10001})
    socket_group_gids: frozenset[int] = frozenset()
    openresty_container: str = "1Panel-openresty"
    filmframe_host: str = "filmframe.astrocean.space"
    admin_host: str = "filmframe-admin.astrocean.space"
    bootstrap_current_version: str = "1.0.0"

    @classmethod
    def load(cls, path: Path = CONFIG_PATH) -> "Config":
        if not path.exists():
            raise RuntimeError("updater config does not exist")
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("updater config must be a root-owned, non-writable regular file")
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise RuntimeError("updater config must be an object")
        allowed = {"openrestyContainer", "originIp", "allowedPeerUids", "bootstrapCurrentVersion"}
        if not set(raw).issubset(allowed):
            raise RuntimeError("updater config has unsupported fields")
        container = raw.get("openrestyContainer", "1Panel-openresty")
        origin_ip = raw.get("originIp")
        peer_uids = raw.get("allowedPeerUids", [0, 10001])
        bootstrap_version = raw.get("bootstrapCurrentVersion", "1.0.0")
        if not isinstance(container, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", container):
            raise RuntimeError("invalid OpenResty container name")
        try:
            parsed_origin = ipaddress.ip_address(origin_ip) if isinstance(origin_ip, str) else None
        except ValueError as exc:
            raise RuntimeError("invalid origin IP") from exc
        if not isinstance(parsed_origin, ipaddress.IPv4Address):
            raise RuntimeError("invalid origin IP")
        if (
            not isinstance(peer_uids, list)
            or not 1 <= len(peer_uids) <= 8
            or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in peer_uids)
            or 10001 not in peer_uids
        ):
            raise RuntimeError("allowedPeerUids must include the Access runtime UID 10001")
        if not isinstance(bootstrap_version, str):
            raise RuntimeError("invalid bootstrap current version")
        try:
            parse_semver(bootstrap_version)
        except ValueError as exc:
            raise RuntimeError("invalid bootstrap current version") from exc
        return cls(
            allowed_peer_uids=frozenset(peer_uids),
            socket_group_gids=_updater_group(),
            openresty_container=container,
            origin_ip=str(parsed_origin),
            bootstrap_current_version=bootstrap_version,
        )


def _updater_group() -> frozenset[int]:
    try:
        return frozenset({grp.getgrnam("filmframe-updater-client").gr_gid})
    except KeyError:
        return frozenset()
