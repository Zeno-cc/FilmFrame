from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from filmframe_updater.errors import UpdaterError
from filmframe_updater.release import (
    GITHUB_API_URL,
    GITHUB_RELEASE_BY_TAG_URL,
    CachedReleaseService,
    GitHubReleaseSource,
    SafeHttpClient,
    _SafeRedirectHandler,
)
from filmframe_updater.store import StateStore
from tests.helpers import manifest


class FailingSource:
    def latest(self):
        raise UpdaterError("updater_unavailable", retryable=True)

    def download_bundle(self, release, destination):
        raise AssertionError("not called")

    def verify_bundle_and_images(self, release, bundle_path):
        raise AssertionError("not called")


class FakeResponse:
    def __init__(self, url: str, data: bytes = b"ok") -> None:
        self.url = url
        self.data = data
        self.headers: dict[str, str] = {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self) -> str:
        return self.url

    def read(self, maximum: int) -> bytes:
        return self.data[:maximum]


class RecordingOpener:
    def __init__(self, response: FakeResponse | Exception) -> None:
        self.response = response
        self.request: urllib.request.Request | None = None

    def open(self, request: urllib.request.Request, *, timeout: int):
        self.request = request
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeHttpNotFound(urllib.error.URLError):
    code = 404


class MappingHttpClient:
    def __init__(self, responses: dict[str, bytes]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    def get(self, url: str, *, maximum: int, accept: str) -> tuple[bytes, str]:
        self.calls.append((url, accept))
        data = self.responses[url]
        if len(data) > maximum:
            raise AssertionError("test response exceeds maximum")
        return data, url


class RecordingVerifier:
    def __init__(self) -> None:
        self.subjects: list[str] = []

    def verify(self, subject: str, release, *, from_oci: bool = False) -> None:
        self.subjects.append(subject)


class ReleaseServiceTests(unittest.TestCase):
    def test_http_client_loads_token_and_authenticates_fixed_github_hosts(self) -> None:
        opener = RecordingOpener(FakeResponse("https://api.github.com/repos/Zeno-cc/FilmFrame"))
        with patch.dict(os.environ, {"GH_TOKEN": "github-secret-token"}), patch(
            "filmframe_updater.release.urllib.request.build_opener", return_value=opener
        ):
            data, _url = SafeHttpClient().get(
                "https://api.github.com/repos/Zeno-cc/FilmFrame",
                maximum=1024,
                accept="application/json",
            )

        self.assertEqual(data, b"ok")
        self.assertIsNotNone(opener.request)
        self.assertEqual(opener.request.get_header("Authorization"), "Bearer github-secret-token")

    def test_http_404_is_a_safe_retryable_error_without_token_disclosure(self) -> None:
        url = "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/latest"
        opener = RecordingOpener(FakeHttpNotFound("Not Found"))
        with patch(
            "filmframe_updater.release.urllib.request.build_opener", return_value=opener
        ), self.assertRaises(UpdaterError) as raised:
            SafeHttpClient(token="private-token").get(
                url,
                maximum=1024,
                accept="application/json",
            )

        self.assertEqual(raised.exception.code, "updater_unavailable")
        self.assertTrue(raised.exception.retryable)
        self.assertNotIn("private-token", str(raised.exception))

    def test_http_client_never_authenticates_asset_cdn_hosts(self) -> None:
        url = "https://release-assets.githubusercontent.com/signed-bundle"
        opener = RecordingOpener(FakeResponse(url))
        with patch(
            "filmframe_updater.release.urllib.request.build_opener", return_value=opener
        ):
            SafeHttpClient(token="private-token").get(
                url,
                maximum=1024,
                accept="application/octet-stream",
            )

        self.assertIsNotNone(opener.request)
        self.assertIsNone(opener.request.get_header("Authorization"))

    def test_redirect_strips_authorization_when_host_changes(self) -> None:
        handler = _SafeRedirectHandler()
        request = urllib.request.Request(
            "https://github.com/Zeno-cc/FilmFrame/releases/download/v1.1.0/bundle.tar.gz",
            headers={"Authorization": "Bearer private-token"},
        )

        redirected = handler.redirect_request(
            request,
            None,
            302,
            "redirect",
            {},
            "https://release-assets.githubusercontent.com/signed-bundle",
        )

        self.assertIsNotNone(redirected)
        self.assertIsNone(redirected.get_header("Authorization"))

    def test_redirect_preserves_authorization_only_on_the_same_host(self) -> None:
        handler = _SafeRedirectHandler()
        request = urllib.request.Request(
            "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/latest",
            headers={"Authorization": "Bearer private-token"},
        )

        redirected = handler.redirect_request(
            request,
            None,
            302,
            "redirect",
            {},
            "https://api.github.com/repositories/1/releases/latest",
        )

        self.assertIsNotNone(redirected)
        self.assertEqual(redirected.get_header("Authorization"), "Bearer private-token")

    def test_private_release_manifest_uses_authenticated_asset_api(self) -> None:
        release = manifest()
        manifest_bytes = (
            json.dumps(
                release.storage_dict(),
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        ).encode()
        manifest_api_url = (
            "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/assets/101"
        )
        metadata = json.dumps(
            {
                "draft": False,
                "prerelease": False,
                "tag_name": "v1.1.0",
                "assets": [
                    {
                        "name": "filmframe-release-manifest.json",
                        "url": manifest_api_url,
                        "browser_download_url": (
                            "https://github.com/Zeno-cc/FilmFrame/releases/download/"
                            "v1.1.0/filmframe-release-manifest.json"
                        ),
                    }
                ],
            }
        ).encode()
        client = MappingHttpClient({GITHUB_API_URL: metadata, manifest_api_url: manifest_bytes})
        verifier = RecordingVerifier()

        result = GitHubReleaseSource(client, verifier).latest()  # type: ignore[arg-type]

        self.assertEqual(result.version, "1.1.0")
        self.assertEqual(client.calls[1], (manifest_api_url, "application/octet-stream"))
        self.assertEqual(len(verifier.subjects), 1)

    def test_private_release_bundle_uses_authenticated_asset_api(self) -> None:
        release = manifest()
        bundle = b"trusted deploy bundle"
        release = replace(release, bundle_sha256=hashlib.sha256(bundle).hexdigest())
        bundle_api_url = "https://api.github.com/repos/Zeno-cc/FilmFrame/releases/assets/202"
        by_tag_url = GITHUB_RELEASE_BY_TAG_URL.format(release.version)
        metadata = json.dumps(
            {
                "draft": False,
                "prerelease": False,
                "tag_name": "v1.1.0",
                "assets": [
                    {
                        "name": "filmframe-deploy-1.1.0.tar.gz",
                        "url": bundle_api_url,
                        "browser_download_url": release.bundle_url,
                    }
                ],
            }
        ).encode()
        client = MappingHttpClient({by_tag_url: metadata, bundle_api_url: bundle})
        source = GitHubReleaseSource(client, RecordingVerifier())  # type: ignore[arg-type]
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "bundle.tar.gz"
            source.download_bundle(release, destination)
            self.assertEqual(destination.read_bytes(), bundle)

        self.assertEqual(client.calls[1], (bundle_api_url, "application/octet-stream"))

    def test_uses_stale_verified_cache_for_non_forced_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite")
            store.initialize()
            store.cache_release(manifest(), checked_at="2020-01-01T00:00:00Z")
            service = CachedReleaseService(store, FailingSource(), ttl_seconds=1)
            cached, checked_at = service.check(force=False)
            self.assertEqual(cached.version, "1.1.0")
            self.assertEqual(checked_at, "2020-01-01T00:00:00Z")
            with self.assertRaises(UpdaterError):
                service.check(force=True)
            self.assertEqual(store.get_cached_release()[0].version, "1.1.0")  # type: ignore[index]

    def test_redirect_handler_rejects_non_allowlisted_target_before_request(self) -> None:
        handler = _SafeRedirectHandler()
        with self.assertRaises(UpdaterError) as raised:
            handler.redirect_request(
                type("Request", (), {"_filmframe_redirect_count": 0})(),
                None,
                302,
                "redirect",
                {},
                "http://127.0.0.1/latest",
            )
        self.assertEqual(raised.exception.code, "release_untrusted")


if __name__ == "__main__":
    unittest.main()
