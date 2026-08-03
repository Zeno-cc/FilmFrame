from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from .errors import UpdaterError
from .models import ReleaseManifest, parse_semver, utc_now
from .store import StateStore
from .system import CommandFailed, CommandRunner

GITHUB_API_URL = "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/latest"
GITHUB_RELEASE_BY_TAG_URL = "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/tags/v{}"
MANIFEST_ASSET = "filmframe-release-manifest.json"
ASSET_API_URL = re.compile(
    r"https://api\.github\.com/repos/Zeno-cc/FilmFrame/releases/assets/[1-9][0-9]*"
)
ALLOWED_HTTP_HOSTS = frozenset(
    {
        "api.github.com",
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    }
)
AUTHENTICATED_HTTP_HOSTS = frozenset({"api.github.com"})


class ReleaseSource(Protocol):
    def latest(self) -> ReleaseManifest: ...

    def download_bundle(self, manifest: ReleaseManifest, destination: Path) -> None: ...

    def verify_bundle_and_images(self, manifest: ReleaseManifest, bundle_path: Path) -> None: ...


class SafeHttpClient:
    def __init__(self, token: str | None = None) -> None:
        configured = os.environ.get("GH_TOKEN") if token is None else token
        if configured and any(character in configured for character in "\r\n"):
            raise ValueError("invalid GitHub token")
        self._token = configured or None

    def get(self, url: str, *, maximum: int, accept: str) -> tuple[bytes, str]:
        self._validate_url(url)
        headers = {"Accept": accept, "User-Agent": "filmframe-updater/1"}
        if self._token and self._hostname(url) in AUTHENTICATED_HTTP_HOSTS:
            headers["Authorization"] = f"Bearer {self._token}"
        request = urllib.request.Request(
            url,
            headers=headers,
            method="GET",
        )
        try:
            opener = urllib.request.build_opener(_SafeRedirectHandler())
            with opener.open(request, timeout=30) as response:
                final_url = response.geturl()
                self._validate_url(final_url)
                length = response.headers.get("Content-Length")
                if length and int(length) > maximum:
                    raise UpdaterError("release_untrusted")
                data = response.read(maximum + 1)
        except (OSError, ValueError, urllib.error.URLError) as exc:
            raise UpdaterError("updater_unavailable", retryable=True) from exc
        if len(data) > maximum:
            raise UpdaterError("release_untrusted")
        return data, final_url

    @staticmethod
    def _validate_url(url: str) -> None:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise UpdaterError("release_untrusted")
        if (parsed.hostname or "").lower() not in ALLOWED_HTTP_HOSTS:
            raise UpdaterError("release_untrusted")

    @staticmethod
    def _hostname(url: str) -> str:
        return (urllib.parse.urlsplit(url).hostname or "").lower()


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        count = getattr(request, "_filmframe_redirect_count", 0) + 1
        if count > 5:
            raise urllib.error.HTTPError(new_url, code, "too many redirects", headers, file_pointer)
        SafeHttpClient._validate_url(new_url)
        redirected = super().redirect_request(request, file_pointer, code, message, headers, new_url)
        if redirected is not None:
            if SafeHttpClient._hostname(request.full_url) != SafeHttpClient._hostname(new_url):
                redirected.remove_header("Authorization")
            setattr(redirected, "_filmframe_redirect_count", count)
        return redirected


class GitHubAttestationVerifier:
    def __init__(self, runner: CommandRunner, gh_path: str = "/usr/bin/gh") -> None:
        self.runner = runner
        self.gh_path = gh_path

    def verify(self, subject: str, manifest: ReleaseManifest, *, from_oci: bool = False) -> None:
        arguments = [
            self.gh_path,
            "attestation",
            "verify",
            subject,
            "--repo",
            "Zeno-cc/FilmFrame",
            "--signer-workflow",
            "Zeno-cc/FilmFrame/.github/workflows/release.yml",
            "--source-ref",
            manifest.provenance_ref,
            "--source-digest",
            manifest.commit,
            "--cert-oidc-issuer",
            manifest.provenance_issuer,
            "--deny-self-hosted-runners",
        ]
        if from_oci:
            arguments.append("--bundle-from-oci")
        try:
            self.runner.run(arguments, timeout=120)
        except CommandFailed as exc:
            raise UpdaterError("release_untrusted") from exc


class GitHubReleaseSource:
    def __init__(
        self,
        client: SafeHttpClient,
        verifier: GitHubAttestationVerifier,
    ) -> None:
        self.client = client
        self.verifier = verifier

    def latest(self) -> ReleaseManifest:
        raw, _url = self.client.get(GITHUB_API_URL, maximum=1024 * 1024, accept="application/vnd.github+json")
        release = _json_object(raw)
        if release.get("draft") is not False or release.get("prerelease") is not False:
            raise UpdaterError("release_not_found")
        tag = release.get("tag_name")
        assets = release.get("assets")
        if not isinstance(tag, str) or not tag.startswith("v") or not isinstance(assets, list):
            raise UpdaterError("release_untrusted")
        try:
            parse_semver(tag[1:])
        except ValueError as exc:
            raise UpdaterError("release_untrusted") from exc
        expected_browser_url = (
            f"https://github.com/Zeno-cc/FilmFrame/releases/download/{tag}/{MANIFEST_ASSET}"
        )
        asset_url = _asset_api_url(assets, MANIFEST_ASSET, expected_browser_url)
        if asset_url is None:
            raise UpdaterError("release_not_found")

        manifest_bytes, _final_url = self.client.get(
            asset_url, maximum=256 * 1024, accept="application/octet-stream"
        )
        manifest_raw = _json_object(manifest_bytes)
        try:
            manifest = ReleaseManifest.from_dict(manifest_raw)
        except ValueError as exc:
            raise UpdaterError("release_untrusted") from exc
        if manifest.version != tag[1:] or manifest_bytes != _canonical_json(manifest_raw):
            raise UpdaterError("release_untrusted")
        with tempfile.TemporaryDirectory(prefix="filmframe-manifest-") as directory:
            path = Path(directory) / MANIFEST_ASSET
            path.write_bytes(manifest_bytes)
            path.chmod(0o600)
            self.verifier.verify(str(path), manifest)
        return manifest

    def download_bundle(self, manifest: ReleaseManifest, destination: Path) -> None:
        release_bytes, _url = self.client.get(
            GITHUB_RELEASE_BY_TAG_URL.format(manifest.version),
            maximum=1024 * 1024,
            accept="application/vnd.github+json",
        )
        release = _json_object(release_bytes)
        assets = release.get("assets")
        if (
            release.get("tag_name") != f"v{manifest.version}"
            or release.get("draft") is not False
            or release.get("prerelease") is not False
            or not isinstance(assets, list)
        ):
            raise UpdaterError("release_untrusted")
        asset_name = f"filmframe-deploy-{manifest.version}.tar.gz"
        asset_url = _asset_api_url(assets, asset_name, manifest.bundle_url)
        if asset_url is None:
            raise UpdaterError("release_untrusted")
        data, _url = self.client.get(
            asset_url,
            maximum=64 * 1024 * 1024,
            accept="application/octet-stream",
        )
        if hashlib.sha256(data).hexdigest() != manifest.bundle_sha256:
            raise UpdaterError("release_untrusted")
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())

    def verify_bundle_and_images(self, manifest: ReleaseManifest, bundle_path: Path) -> None:
        if hashlib.sha256(bundle_path.read_bytes()).hexdigest() != manifest.bundle_sha256:
            raise UpdaterError("release_untrusted")
        self.verifier.verify(str(bundle_path), manifest)
        self.verifier.verify(f"oci://{manifest.filmframe_image}", manifest, from_oci=True)
        self.verifier.verify(f"oci://{manifest.access_image}", manifest, from_oci=True)


class CachedReleaseService:
    def __init__(self, store: StateStore, source: ReleaseSource, *, ttl_seconds: int = 6 * 3600) -> None:
        self.store = store
        self.source = source
        self.ttl_seconds = ttl_seconds

    def check(self, *, force: bool = False) -> tuple[ReleaseManifest, str]:
        cached = self.store.get_cached_release()
        if cached and not force and _age_seconds(cached[1]) < self.ttl_seconds:
            return cached
        try:
            manifest = self.source.latest()
        except UpdaterError:
            if cached and not force:
                return cached
            raise
        checked_at = utc_now()
        self.store.cache_release(manifest, checked_at=checked_at)
        return manifest, checked_at

    def resolve(self, version: str) -> ReleaseManifest:
        cached = self.store.get_cached_release(version)
        if not cached:
            latest, _checked_at = self.check(force=True)
            if latest.version != version:
                raise UpdaterError("release_not_found")
            return latest
        return cached[0]


def _json_object(data: bytes) -> dict[str, Any]:
    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON field")
            result[key] = value
        return result

    try:
        result = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise UpdaterError("release_untrusted") from exc
    if not isinstance(result, dict):
        raise UpdaterError("release_untrusted")
    return result


def _asset_api_url(assets: list[Any], name: str, expected_browser_url: str) -> str | None:
    matched: str | None = None
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("name") != name:
            continue
        api_url = asset.get("url")
        if (
            matched is not None
            or not isinstance(api_url, str)
            or not ASSET_API_URL.fullmatch(api_url)
            or asset.get("browser_download_url") != expected_browser_url
        ):
            raise UpdaterError("release_untrusted")
        matched = api_url
    return matched


def _canonical_json(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")


def _age_seconds(timestamp: str) -> float:
    checked = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return max(0.0, (datetime.now(timezone.utc) - checked).total_seconds())
