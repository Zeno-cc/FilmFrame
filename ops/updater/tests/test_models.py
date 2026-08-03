from __future__ import annotations

import copy
import unittest

from filmframe_updater.models import ReleaseManifest
from tests.helpers import manifest_dict


class ReleaseManifestTests(unittest.TestCase):
    def test_accepts_the_release_contract(self) -> None:
        parsed = ReleaseManifest.from_dict(manifest_dict())
        self.assertEqual(parsed.version, "1.1.0")
        self.assertEqual(parsed.provenance_ref, "refs/tags/v1.1.0")
        self.assertEqual(ReleaseManifest.from_dict(parsed.storage_dict()), parsed)

    def test_rejects_unknown_or_mismatched_trust_fields(self) -> None:
        cases = []
        unknown = manifest_dict()
        unknown["token"] = "secret"
        cases.append(unknown)
        wrong_ref = manifest_dict()
        wrong_ref["provenance"]["ref"] = "refs/heads/main"
        cases.append(wrong_ref)
        wrong_bundle = manifest_dict()
        wrong_bundle["deployBundle"]["url"] = "https://example.com/update.tar.gz"
        cases.append(wrong_bundle)
        floating_image = manifest_dict()
        floating_image["images"]["filmframe"] = "ghcr.io/zeno-cc/filmframe/filmframe:latest"
        cases.append(floating_image)
        for value in cases:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    ReleaseManifest.from_dict(value)

    def test_enforces_schema_and_summary_contract(self) -> None:
        schema_zero = manifest_dict()
        schema_zero["database"]["schemaFrom"] = 0
        short_summary = manifest_dict()
        short_summary["summaryZh"][0]["text"] = "太短"
        maintenance = copy.deepcopy(manifest_dict())
        maintenance["summaryZh"][0]["kind"] = "maintenance"
        for value in (schema_zero, short_summary, maintenance):
            with self.assertRaises(ValueError):
                ReleaseManifest.from_dict(value)


if __name__ == "__main__":
    unittest.main()
