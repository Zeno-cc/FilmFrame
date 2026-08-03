from __future__ import annotations

from filmframe_updater.models import ReleaseManifest


def manifest_dict(version: str = "1.1.0", commit: str = "a" * 40) -> dict:
    return {
        "manifestVersion": 1,
        "version": version,
        "commit": commit,
        "publishedAt": "2026-08-01T08:00:00Z",
        "minUpdaterVersion": "1.0.0",
        "images": {
            "filmframe": "ghcr.io/zeno-cc/filmframe/filmframe@sha256:" + "b" * 64,
            "access": "ghcr.io/zeno-cc/filmframe/access@sha256:" + "c" * 64,
        },
        "deployBundle": {
            "url": (
                f"https://github.com/Zeno-cc/FilmFrame/releases/download/v{version}/"
                f"filmframe-deploy-{version}.tar.gz"
            ),
            "sha256": "d" * 64,
        },
        "database": {
            "schemaFrom": 3,
            "schemaTo": 4,
            "rollbackFloor": "1.0.0",
            "backwardCompatible": True,
        },
        "summaryZh": [{"kind": "feature", "text": "新增安全可靠的一键版本更新功能"}],
        "provenance": {
            "issuer": "https://token.actions.githubusercontent.com",
            "repository": "Zeno-cc/FilmFrame",
            "workflow": ".github/workflows/release.yml",
            "ref": f"refs/tags/v{version}",
        },
    }


def manifest(version: str = "1.1.0", commit: str = "a" * 40) -> ReleaseManifest:
    return ReleaseManifest.from_dict(manifest_dict(version, commit))
