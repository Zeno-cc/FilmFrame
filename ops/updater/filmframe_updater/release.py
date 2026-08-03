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
GITHUB_ATTESTATIONS_URL = (
    "https://api.github.com/repos/Zeno-cc/FilmFrame/attestations/{}"
)
MANIFEST_ASSET = "filmframe-release-manifest.json"
MAX_ATTESTATION_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_ATTESTATION_BUNDLES = 8
SIGSTORE_BUNDLE_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle.v0.3+json"
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
    def __init__(
        self,
        runner: CommandRunner,
        client: SafeHttpClient,
        gh_path: str = "/usr/bin/gh",
    ) -> None:
        self.runner = runner
        self.client = client
        self.gh_path = gh_path

    def verify(self, subject: str, manifest: ReleaseManifest, *, from_oci: bool = False) -> None:
        digest = _subject_digest(subject, manifest, from_oci=from_oci)
        url = GITHUB_ATTESTATIONS_URL.format(digest)
        raw, final_url = self.client.get(
            url,
            maximum=MAX_ATTESTATION_RESPONSE_BYTES,
            accept="application/vnd.github+json",
        )
        if final_url != url:
            raise UpdaterError("release_untrusted")
        bundles = _attestation_bundles(raw)
        with tempfile.TemporaryDirectory(prefix="filmframe-attestations-") as directory:
            bundle_path = Path(directory) / "bundles.jsonl"
            _write_bundle_jsonl(bundle_path, bundles)
            self._verify_with_gh(subject, manifest, bundle_path)

    def _verify_with_gh(
        self,
        subject: str,
        manifest: ReleaseManifest,
        bundle_path: Path,
    ) -> None:
        arguments = [
            self.gh_path,
            "attestation",
            "verify",
            subject,
            "--bundle",
            str(bundle_path),
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
        try:
            self.runner.run(
                arguments,
                environment={"GH_TOKEN": None, "GITHUB_TOKEN": None},
                timeout=120,
            )
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


def _subject_digest(subject: str, manifest: ReleaseManifest, *, from_oci: bool) -> str:
    if from_oci:
        if subject not in {
            f"oci://{manifest.filmframe_image}",
            f"oci://{manifest.access_image}",
        }:
            raise UpdaterError("release_untrusted")
        digest = subject.rsplit("@", 1)[-1]
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise UpdaterError("release_untrusted")
        return digest

    try:
        hasher = hashlib.sha256()
        with Path(subject).open("rb") as input_file:
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                hasher.update(chunk)
    except (OSError, ValueError) as exc:
        raise UpdaterError("release_untrusted") from exc
    return f"sha256:{hasher.hexdigest()}"


def _attestation_bundles(data: bytes) -> tuple[dict[str, Any], ...]:
    response = _json_object(data)
    if set(response) != {"attestations"}:
        raise UpdaterError("release_untrusted")
    attestations = response["attestations"]
    if not isinstance(attestations, list) or not 1 <= len(attestations) <= MAX_ATTESTATION_BUNDLES:
        raise UpdaterError("release_untrusted")

    bundles: list[dict[str, Any]] = []
    encoded_bundles: set[bytes] = set()
    for attestation in attestations:
        if not isinstance(attestation, dict) or set(attestation) != {
            "repository_id",
            "bundle_url",
            "initiator",
            "bundle",
        }:
            raise UpdaterError("release_untrusted")
        repository_id = attestation["repository_id"]
        initiator = attestation["initiator"]
        bundle_url = attestation["bundle_url"]
        if (
            isinstance(repository_id, bool)
            or not isinstance(repository_id, int)
            or repository_id <= 0
            or not isinstance(initiator, str)
            or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", initiator)
            or not _is_https_url(bundle_url, maximum=2048)
        ):
            raise UpdaterError("release_untrusted")

        bundle = attestation["bundle"]
        if (
            not isinstance(bundle, dict)
            or set(bundle) != {"mediaType", "verificationMaterial", "dsseEnvelope"}
            or bundle.get("mediaType") != SIGSTORE_BUNDLE_MEDIA_TYPE
            or not isinstance(bundle.get("verificationMaterial"), dict)
            or not isinstance(bundle.get("dsseEnvelope"), dict)
        ):
            raise UpdaterError("release_untrusted")
        encoded = json.dumps(
            bundle,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        if encoded in encoded_bundles:
            raise UpdaterError("release_untrusted")
        encoded_bundles.add(encoded)
        bundles.append(bundle)
    return tuple(bundles)


def _is_https_url(value: Any, *, maximum: int) -> bool:
    if not isinstance(value, str) or not value or len(value) > maximum:
        return False
    try:
        parsed = urllib.parse.urlsplit(value)
        return (
            parsed.scheme == "https"
            and bool(parsed.hostname)
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and not parsed.fragment
        )
    except ValueError:
        return False


def _write_bundle_jsonl(path: Path, bundles: tuple[dict[str, Any], ...]) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
        0o600,
    )
    with os.fdopen(descriptor, "wb") as output:
        for bundle in bundles:
            output.write(
                json.dumps(
                    bundle,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                ).encode("utf-8")
                + b"\n"
            )
        output.flush()
        os.fsync(output.fileno())


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
