from __future__ import annotations

import json
import socket
import uuid
from pathlib import Path
from typing import Any

from .errors import UpdaterError
from .models import PROTOCOL_VERSION
from .protocol import MAX_RESPONSE_BYTES


def call(socket_path: Path, action: str, params: dict) -> Any:
    request_id = str(uuid.uuid4())
    request = json.dumps(
        {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "action": action,
            "params": params,
        },
        separators=(",", ":"),
    ).encode("utf-8") + b"\n"
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(40)
        connection.connect(str(socket_path))
        connection.sendall(request)
        response = bytearray()
        while len(response) <= MAX_RESPONSE_BYTES:
            chunk = connection.recv(min(4096, MAX_RESPONSE_BYTES + 1 - len(response)))
            if not chunk:
                break
            response.extend(chunk)
            if b"\n" in chunk:
                break
    if len(response) > MAX_RESPONSE_BYTES:
        raise UpdaterError("updater_unavailable", retryable=True)
    try:
        decoded = json.loads(bytes(response).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise UpdaterError("updater_unavailable", retryable=True) from exc
    if not isinstance(decoded, dict) or decoded.get("requestId") != request_id:
        raise UpdaterError("updater_unavailable", retryable=True)
    if decoded.get("ok") is not True:
        error = decoded.get("error")
        code = error.get("code") if isinstance(error, dict) else "updater_unavailable"
        retryable = error.get("retryable") is True if isinstance(error, dict) else True
        raise UpdaterError(code, retryable=retryable)
    result = decoded.get("result")
    return result
