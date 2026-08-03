from __future__ import annotations

import socket
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from filmframe_updater.client import call
from filmframe_updater.config import Config
from filmframe_updater.server import UnixServer


class FakeApplication:
    def dispatch(self, action: str, params: dict):
        if action == "get_active_job":
            return None
        if action == "get_job":
            return {
                "id": params["jobId"],
                "targetVersion": "1.1.0",
                "targetRevision": "a" * 40,
                "state": "queued",
                "previousVersion": None,
                "previousRevision": None,
                "createdAt": "2026-08-02T00:00:00Z",
                "updatedAt": "2026-08-02T00:00:00Z",
                "startedAt": None,
                "finishedAt": None,
                "errorCode": None,
                "retryOf": None,
            }
        raise AssertionError("unexpected action")


class ServerClientIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.socket_path = Path(self.temporary.name) / "updater.sock"
        self.server = UnixServer(
            Config(origin_ip="192.0.2.10", socket_path=self.socket_path),
            FakeApplication(),  # type: ignore[arg-type]
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def round_trip(self, action: str, params: dict):
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(str(self.socket_path))
        listener.listen(1)
        self.server._semaphore.acquire()

        def handle_once() -> None:
            connection, _address = listener.accept()
            try:
                self.server._handle(connection)
            finally:
                listener.close()

        thread = threading.Thread(target=handle_once)
        thread.start()
        try:
            with patch("filmframe_updater.server.authorize_peer"):
                return call(self.socket_path, action, params)
        finally:
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
            self.socket_path.unlink(missing_ok=True)

    def test_direct_null_and_job_results_survive_real_socket_round_trip(self) -> None:
        self.assertIsNone(self.round_trip("get_active_job", {}))
        job_id = "c099fb33-ff67-4e38-a984-d19b56f2d28b"
        result = self.round_trip("get_job", {"jobId": job_id})
        self.assertEqual(result["id"], job_id)
        self.assertEqual(result["state"], "queued")


if __name__ == "__main__":
    unittest.main()
