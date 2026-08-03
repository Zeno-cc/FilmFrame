from __future__ import annotations

import fcntl
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional, Sequence


class CommandFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class CommandResult:
    stdout: bytes

    def text(self) -> str:
        return self.stdout.decode("utf-8", errors="strict")


class CommandRunner:
    def __init__(self, *, output_limit: int = 1024 * 1024) -> None:
        self.output_limit = output_limit

    def run(
        self,
        arguments: Sequence[str],
        *,
        cwd: Optional[Path] = None,
        environment: Optional[Mapping[str, str]] = None,
        timeout: int = 300,
    ) -> CommandResult:
        if not arguments or not all(isinstance(value, str) and value for value in arguments):
            raise ValueError("command arguments must be non-empty strings")
        env = None
        if environment is not None:
            env = dict(os.environ)
            env.update(environment)
        try:
            process = subprocess.run(
                list(arguments),
                cwd=cwd,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
                shell=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise CommandFailed("command did not complete") from exc
        if (
            process.returncode != 0
            or len(process.stdout) > self.output_limit
            or len(process.stderr) > self.output_limit
        ):
            raise CommandFailed("command failed")
        return CommandResult(process.stdout)


class DeploymentLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._descriptor: Optional[int] = None

    def __enter__(self) -> "DeploymentLock":
        self.path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        descriptor = os.open(
            self.path,
            os.O_CREAT | os.O_RDWR | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(descriptor)
            raise CommandFailed("deployment lock is busy")
        self._descriptor = descriptor
        return self

    def __exit__(self, _kind, _value, _traceback) -> None:
        if self._descriptor is not None:
            fcntl.flock(self._descriptor, fcntl.LOCK_UN)
            os.close(self._descriptor)
            self._descriptor = None
