from __future__ import annotations

import json
import socket
import struct
import uuid
from dataclasses import dataclass
from typing import Any, Mapping

from .errors import UpdaterError
from .models import ACTOR_HASH_PATTERN, PROTOCOL_VERSION, parse_semver, require_exact_keys

MAX_REQUEST_BYTES = 16 * 1024
MAX_RESPONSE_BYTES = 64 * 1024


@dataclass(frozen=True)
class Request:
    request_id: str
    action: str
    params: dict[str, Any]


def _uuid(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 36:
        raise UpdaterError("invalid_request")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise UpdaterError("invalid_request") from exc
    if str(parsed) != value.lower():
        raise UpdaterError("invalid_request")
    return str(parsed)


def _decode_object(data: bytes) -> Mapping[str, Any]:
    try:
        text = data.decode("utf-8")
        def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
            result: dict[str, Any] = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate key")
                result[key] = value
            return result

        raw = json.loads(text, object_pairs_hook=reject_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise UpdaterError("invalid_request") from exc
    if not isinstance(raw, dict):
        raise UpdaterError("invalid_request")
    return raw


def decode_request(data: bytes) -> Request:
    if len(data) > MAX_REQUEST_BYTES:
        raise UpdaterError("request_too_large")
    raw = _decode_object(data)
    try:
        require_exact_keys(raw, {"protocolVersion", "requestId", "action", "params"})
    except ValueError as exc:
        raise UpdaterError("invalid_request") from exc
    if raw["protocolVersion"] != PROTOCOL_VERSION:
        raise UpdaterError("invalid_request")
    request_id = _uuid(raw["requestId"])
    action = raw["action"]
    params = raw["params"]
    if not isinstance(action, str) or not isinstance(params, dict):
        raise UpdaterError("invalid_request")

    try:
        if action == "check":
            require_exact_keys(params, set(), {"force"})
            if "force" in params and not isinstance(params["force"], bool):
                raise ValueError("force must be boolean")
        elif action == "create_job":
            require_exact_keys(params, {"version", "idempotencyKey", "actorHash"})
            if not isinstance(params["version"], str):
                raise ValueError("version must be a string")
            parse_semver(params["version"])
            params["idempotencyKey"] = _uuid(params["idempotencyKey"])
            if not isinstance(params["actorHash"], str) or not ACTOR_HASH_PATTERN.fullmatch(params["actorHash"]):
                raise ValueError("invalid actor hash")
        elif action == "get_job":
            require_exact_keys(params, {"jobId"})
            params["jobId"] = _uuid(params["jobId"])
        elif action == "get_active_job":
            require_exact_keys(params, set())
        elif action == "list_history":
            require_exact_keys(params, set(), {"limit"})
            limit = params.get("limit", 20)
            if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
                raise ValueError("invalid history limit")
        else:
            raise ValueError("unknown action")
    except (ValueError, UpdaterError) as exc:
        if isinstance(exc, UpdaterError):
            raise
        raise UpdaterError("invalid_request") from exc
    return Request(request_id=request_id, action=action, params=dict(params))


def success_response(request_id: str, result: Any) -> bytes:
    return _encode_response(
        {"protocolVersion": PROTOCOL_VERSION, "requestId": request_id, "ok": True, "result": result}
    )


def error_response(request_id: str | None, error: UpdaterError) -> bytes:
    return _encode_response(
        {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "ok": False,
            "error": {"code": error.code, "message": str(error), "retryable": error.retryable},
        }
    )


def _encode_response(value: Any) -> bytes:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    if len(encoded) > MAX_RESPONSE_BYTES:
        raise UpdaterError("internal_error")
    return encoded


def read_message(connection: socket.socket) -> bytes:
    connection.settimeout(5.0)
    chunks = bytearray()
    while len(chunks) <= MAX_REQUEST_BYTES:
        chunk = connection.recv(min(4096, MAX_REQUEST_BYTES + 1 - len(chunks)))
        if not chunk:
            break
        chunks.extend(chunk)
        newline = chunks.find(b"\n")
        if newline >= 0:
            if bytes(chunks[newline + 1 :]).strip():
                raise UpdaterError("invalid_request")
            return bytes(chunks[:newline])
    if len(chunks) > MAX_REQUEST_BYTES:
        raise UpdaterError("request_too_large")
    if not chunks:
        raise UpdaterError("invalid_request")
    return bytes(chunks)


def peer_credentials(connection: socket.socket) -> tuple[int, int, int]:
    if not hasattr(socket, "SO_PEERCRED"):
        raise UpdaterError("peer_forbidden")
    raw = connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
    return struct.unpack("3i", raw)


def authorize_peer(connection: socket.socket, allowed_uids: frozenset[int]) -> None:
    _pid, uid, _gid = peer_credentials(connection)
    if uid not in allowed_uids:
        raise UpdaterError("peer_forbidden")
