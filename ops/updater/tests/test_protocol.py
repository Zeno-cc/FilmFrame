from __future__ import annotations

import json
import os
import socket
import unittest
import uuid
from unittest.mock import patch

from filmframe_updater.errors import UpdaterError
from filmframe_updater.protocol import MAX_REQUEST_BYTES, authorize_peer, decode_request


def request(action: str, params: dict) -> bytes:
    return json.dumps(
        {
            "protocolVersion": 1,
            "requestId": str(uuid.uuid4()),
            "action": action,
            "params": params,
        }
    ).encode()


class ProtocolTests(unittest.TestCase):
    def test_decodes_each_action(self) -> None:
        cases = [
            ("check", {"force": True}),
            (
                "create_job",
                {
                    "version": "1.2.3",
                    "idempotencyKey": str(uuid.uuid4()),
                    "actorHash": "a" * 64,
                },
            ),
            ("get_job", {"jobId": str(uuid.uuid4())}),
            ("get_active_job", {}),
            ("list_history", {"limit": 50}),
        ]
        for action, params in cases:
            with self.subTest(action=action):
                self.assertEqual(decode_request(request(action, params)).action, action)

    def test_rejects_unknown_duplicate_and_oversized_payloads(self) -> None:
        unknown = json.loads(request("check", {}).decode())
        unknown["extra"] = True
        duplicate = b'{"protocolVersion":1,"protocolVersion":1,"requestId":"x","action":"check","params":{}}'
        for payload, code in (
            (json.dumps(unknown).encode(), "invalid_request"),
            (duplicate, "invalid_request"),
            (b"x" * (MAX_REQUEST_BYTES + 1), "request_too_large"),
        ):
            with self.subTest(code=code):
                with self.assertRaises(UpdaterError) as raised:
                    decode_request(payload)
                self.assertEqual(raised.exception.code, code)

    def test_rejects_retry_field_and_malformed_identity(self) -> None:
        params = {
            "version": "1.2.3",
            "idempotencyKey": str(uuid.uuid4()),
            "actorHash": "a" * 64,
            "retryOf": str(uuid.uuid4()),
        }
        with self.assertRaises(UpdaterError):
            decode_request(request("create_job", params))
        params.pop("retryOf")
        params["actorHash"] = "A" * 64
        with self.assertRaises(UpdaterError):
            decode_request(request("create_job", params))

    @unittest.skipUnless(hasattr(socket, "SO_PEERCRED"), "Linux peer credentials required")
    def test_authorizes_only_allowlisted_local_peers(self) -> None:
        left, right = socket.socketpair()
        try:
            authorize_peer(left, frozenset({os.getuid()}))
            with self.assertRaises(UpdaterError) as raised:
                authorize_peer(left, frozenset({os.getuid() + 1}))
            self.assertEqual(raised.exception.code, "peer_forbidden")
        finally:
            left.close()
            right.close()

    def test_group_membership_never_authorizes_a_peer(self) -> None:
        with patch("filmframe_updater.protocol.peer_credentials", return_value=(10, 10002, 10001)):
            with self.assertRaises(UpdaterError) as raised:
                authorize_peer(object(), frozenset({10001}))  # type: ignore[arg-type]
        self.assertEqual(raised.exception.code, "peer_forbidden")


if __name__ == "__main__":
    unittest.main()
