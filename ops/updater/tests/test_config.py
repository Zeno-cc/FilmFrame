from __future__ import annotations

import json
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from filmframe_updater.config import Config


class ConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_config(self, values: dict) -> Path:
        path = self.root / "config.json"
        path.write_text(json.dumps(values), encoding="utf-8")
        return path

    def load_trusted(self, path: Path) -> Config:
        trusted_stat = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0)
        with patch.object(Path, "stat", return_value=trusted_stat), patch(
            "filmframe_updater.config._updater_group", return_value=frozenset({20001})
        ):
            return Config.load(path)

    def test_missing_config_is_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "does not exist"):
            Config.load(self.root / "missing.json")

    def test_loads_explicit_origin_ip(self) -> None:
        path = self.write_config(
            {
                "allowedPeerUids": [0, 10001],
                "bootstrapCurrentVersion": "1.0.0",
                "openrestyContainer": "1Panel-openresty-example",
                "originIp": "192.0.2.25",
            }
        )

        config = self.load_trusted(path)

        self.assertEqual(config.origin_ip, "192.0.2.25")
        self.assertEqual(config.openresty_container, "1Panel-openresty-example")
        self.assertEqual(config.socket_group_gids, frozenset({20001}))

    def test_origin_ip_is_required_and_must_be_ipv4(self) -> None:
        for value in (None, "not-an-ip", "2001:db8::1"):
            raw = {"allowedPeerUids": [0, 10001]}
            if value is not None:
                raw["originIp"] = value
            with self.subTest(value=value):
                path = self.write_config(raw)
                with self.assertRaisesRegex(RuntimeError, "invalid origin IP"):
                    self.load_trusted(path)


if __name__ == "__main__":
    unittest.main()
