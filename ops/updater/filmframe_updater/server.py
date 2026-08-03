from __future__ import annotations

import logging
import os
import socket
import stat
import threading
from typing import Optional

from .application import UpdaterApplication
from .config import Config
from .errors import UpdaterError
from .protocol import authorize_peer, decode_request, error_response, read_message, success_response

LOGGER = logging.getLogger("filmframe-updater")


class UnixServer:
    def __init__(self, config: Config, application: UpdaterApplication) -> None:
        self.config = config
        self.application = application
        self._semaphore = threading.BoundedSemaphore(8)

    def serve_forever(self) -> None:
        listener, owns_path = self._listener()
        try:
            listener.listen(16)
            while True:
                connection, _address = listener.accept()
                if not self._semaphore.acquire(blocking=False):
                    connection.sendall(error_response(None, UpdaterError("updater_unavailable", retryable=True)))
                    connection.close()
                    continue
                thread = threading.Thread(target=self._handle, args=(connection,), daemon=True)
                thread.start()
        finally:
            listener.close()
            if owns_path:
                try:
                    self.config.socket_path.unlink()
                except FileNotFoundError:
                    pass

    def _handle(self, connection: socket.socket) -> None:
        request_id: Optional[str] = None
        try:
            authorize_peer(connection, self.config.allowed_peer_uids)
            request = decode_request(read_message(connection))
            request_id = request.request_id
            result = self.application.dispatch(request.action, request.params)
            connection.sendall(success_response(request.request_id, result))
        except UpdaterError as error:
            connection.sendall(error_response(request_id, error))
        except Exception:
            LOGGER.exception("updater request failed without exposing request data")
            connection.sendall(error_response(request_id, UpdaterError("internal_error")))
        finally:
            connection.close()
            self._semaphore.release()

    def _listener(self) -> tuple[socket.socket, bool]:
        if int(os.environ.get("LISTEN_PID", "0")) == os.getpid() and int(
            os.environ.get("LISTEN_FDS", "0")
        ) >= 1:
            listener = socket.socket(fileno=3)
            if listener.family != socket.AF_UNIX or listener.type & socket.SOCK_STREAM == 0:
                raise RuntimeError("invalid systemd activation socket")
            return listener, False

        self.config.socket_path.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        if self.config.socket_path.exists() or self.config.socket_path.is_symlink():
            info = self.config.socket_path.lstat()
            if not stat.S_ISSOCK(info.st_mode):
                raise RuntimeError("refusing to replace a non-socket path")
            self.config.socket_path.unlink()
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(str(self.config.socket_path))
        self.config.socket_path.chmod(0o660)
        return listener, True
