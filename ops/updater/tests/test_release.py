from __future__ import annotations

import hashlib
import json
import os
import stat
import tempfile
import unittest
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from filmframe_updater.errors import UpdaterError
from filmframe_updater.release import (
    GITHUB_ATTESTATIONS_URL,
    GITHUB_API_URL,
    GITHUB_RELEASE_BY_TAG_URL,
    MAX_ATTESTATION_BUNDLES,
    MAX_ATTESTATION_RESPONSE_BYTES,
    CachedReleaseService,
    GitHubAttestationVerifier,
    GitHubReleaseSource,
    SafeHttpClient,
    _SafeRedirectHandler,
)
from filmframe_updater.store import StateStore
from filmframe_updater.system import CommandFailed, CommandRunner
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


def sigstore_bundle(marker: str = "a") -> dict:
    return {
        "mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
        "verificationMaterial": {
            "certificate": {"rawBytes": marker},
            "tlogEntries": [],
            "timestampVerificationData": {},
        },
        "dsseEnvelope": {
            "payload": marker,
            "payloadType": "application/vnd.in-toto+json",
            "signatures": [{"sig": marker}],
        },
    }


def attestation_response(*bundles: dict) -> bytes:
    return json.dumps(
        {
            "attestations": [
                {
                    "repository_id": 1118797507,
                    "bundle_url": (
                        "https://tmaproduction.blob.core.windows.net/"
                        f"attestations/{index + 1}.json?sig=test"
                    ),
                    "initiator": "Zeno-cc",
                    "bundle": bundle,
                }
                for index, bundle in enumerate(bundles)
            ]
        }
    ).encode()


class AttestationHttpClient:
    def __init__(self, data: bytes, *, final_url: str | None = None) -> None:
        self.data = data
        self.final_url = final_url
        self.calls: list[tuple[str, int, str]] = []

    def get(self, url: str, *, maximum: int, accept: str) -> tuple[bytes, str]:
        self.calls.append((url, maximum, accept))
        return self.data, self.final_url or url


class AttestationRunner:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.arguments: list[str] = []
        self.options: dict = {}
        self.bundle_mode = 0
        self.bundle_data = b""

    def run(self, arguments, **options):
        self.arguments = list(arguments)
        self.options = options
        bundle_path = Path(self.arguments[self.arguments.index("--bundle") + 1])
        self.bundle_mode = stat.S_IMODE(bundle_path.stat().st_mode)
        self.bundle_data = bundle_path.read_bytes()
        if self.fail:
            raise CommandFailed("verification failed")


class ReleaseServiceTests(unittest.TestCase):
    def test_file_attestation_uses_local_digest_fixed_api_and_bundle(self) -> None:
        release = manifest()
        bundle = sigstore_bundle()
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory) / "artifact.tar.gz"
            subject.write_bytes(b"artifact bytes")
            digest = "sha256:" + hashlib.sha256(subject.read_bytes()).hexdigest()
            url = GITHUB_ATTESTATIONS_URL.format(digest)
            client = AttestationHttpClient(attestation_response(bundle))
            runner = AttestationRunner()

            GitHubAttestationVerifier(runner, client).verify(str(subject), release)  # type: ignore[arg-type]

        self.assertEqual(
            client.calls,
            [(url, MAX_ATTESTATION_RESPONSE_BYTES, "application/vnd.github+json")],
        )
        self.assertEqual(runner.bundle_mode, 0o600)
        self.assertEqual(
            runner.bundle_data,
            json.dumps(bundle, separators=(",", ":"), sort_keys=True).encode() + b"\n",
        )
        self.assertNotIn("--bundle-from-oci", runner.arguments)
        self.assertEqual(runner.options["environment"], {"GH_TOKEN": None, "GITHUB_TOKEN": None})
        for expected in (
            "--repo",
            "--signer-workflow",
            "--source-ref",
            "--source-digest",
            "--cert-oidc-issuer",
            "--deny-self-hosted-runners",
        ):
            self.assertIn(expected, runner.arguments)

    def test_oci_attestation_uses_manifest_digest_and_public_subject(self) -> None:
        release = manifest()
        subject = f"oci://{release.filmframe_image}"
        digest = release.filmframe_image.rsplit("@", 1)[1]
        client = AttestationHttpClient(attestation_response(sigstore_bundle()))
        runner = AttestationRunner()

        GitHubAttestationVerifier(runner, client).verify(  # type: ignore[arg-type]
            subject, release, from_oci=True
        )

        self.assertEqual(client.calls[0][0], GITHUB_ATTESTATIONS_URL.format(digest))
        self.assertEqual(runner.arguments[3], subject)
        self.assertIn("--bundle", runner.arguments)
        self.assertNotIn("--bundle-from-oci", runner.arguments)

    def test_attestation_response_rejects_malformed_empty_and_excess_bundles(self) -> None:
        valid_item = json.loads(attestation_response(sigstore_bundle()))["attestations"][0]
        cases = {
            "malformed": b"not json",
            "unknown response field": json.dumps(
                {"attestations": [valid_item], "extra": True}
            ).encode(),
            "empty": attestation_response(),
            "too many": attestation_response(
                *(sigstore_bundle(str(index)) for index in range(MAX_ATTESTATION_BUNDLES + 1))
            ),
            "missing item field": json.dumps(
                {"attestations": [{key: value for key, value in valid_item.items() if key != "initiator"}]}
            ).encode(),
            "invalid bundle URL": json.dumps(
                {
                    "attestations": [
                        {**valid_item, "bundle_url": "https://example.test:invalid/bundle"}
                    ]
                }
            ).encode(),
            "unknown bundle field": attestation_response(
                {**sigstore_bundle(), "unexpected": True}
            ),
            "wrong media type": attestation_response(
                {**sigstore_bundle(), "mediaType": "application/json"}
            ),
            "duplicate bundle": attestation_response(sigstore_bundle(), sigstore_bundle()),
        }
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory) / "artifact"
            subject.write_bytes(b"artifact")
            for label, response in cases.items():
                with self.subTest(label=label), self.assertRaises(UpdaterError) as raised:
                    GitHubAttestationVerifier(
                        AttestationRunner(), AttestationHttpClient(response)  # type: ignore[arg-type]
                    ).verify(str(subject), manifest())
                self.assertEqual(raised.exception.code, "release_untrusted")

    def test_attestation_response_size_and_final_url_are_bounded(self) -> None:
        release = manifest()
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory) / "artifact"
            subject.write_bytes(b"artifact")
            digest = "sha256:" + hashlib.sha256(subject.read_bytes()).hexdigest()
            url = GITHUB_ATTESTATIONS_URL.format(digest)
            opener = RecordingOpener(
                FakeResponse(url, b"x" * (MAX_ATTESTATION_RESPONSE_BYTES + 1))
            )
            with patch(
                "filmframe_updater.release.urllib.request.build_opener", return_value=opener
            ), self.assertRaises(UpdaterError) as oversized:
                GitHubAttestationVerifier(
                    AttestationRunner(), SafeHttpClient(token="")  # type: ignore[arg-type]
                ).verify(str(subject), release)
            self.assertEqual(oversized.exception.code, "release_untrusted")

            redirected = AttestationHttpClient(
                attestation_response(sigstore_bundle()),
                final_url="https://api.github.com/repos/Zeno-cc/FilmFrame/attestations/other",
            )
            with self.assertRaises(UpdaterError) as mismatched:
                GitHubAttestationVerifier(
                    AttestationRunner(), redirected  # type: ignore[arg-type]
                ).verify(str(subject), release)
            self.assertEqual(mismatched.exception.code, "release_untrusted")

    def test_attestation_command_failure_is_untrusted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory) / "artifact"
            subject.write_bytes(b"artifact")
            with self.assertRaises(UpdaterError) as raised:
                GitHubAttestationVerifier(
                    AttestationRunner(fail=True),  # type: ignore[arg-type]
                    AttestationHttpClient(attestation_response(sigstore_bundle())),  # type: ignore[arg-type]
                ).verify(str(subject), manifest())
        self.assertEqual(raised.exception.code, "release_untrusted")

    def test_subprocesses_never_inherit_github_tokens(self) -> None:
        with patch.dict(
            os.environ,
            {"GH_TOKEN": "secret-gh-token", "GITHUB_TOKEN": "secret-actions-token"},
        ):
            result = CommandRunner().run(
                ["/usr/bin/env"],
                environment={
                    "GH_TOKEN": "attempted-override",
                    "GITHUB_TOKEN": "attempted-override",
                },
            )
        environment = result.text()
        self.assertNotIn("secret-gh-token", environment)
        self.assertNotIn("secret-actions-token", environment)
        self.assertNotIn("GH_TOKEN=", environment)
        self.assertNotIn("GITHUB_TOKEN=", environment)

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
