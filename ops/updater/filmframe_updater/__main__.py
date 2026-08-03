from __future__ import annotations

import json
import logging
import sys

from .application import DeploymentCoordinator, UpdaterApplication
from .client import call
from .config import Config
from .deploy import ProductionDeployer
from .errors import UpdaterError
from .release import CachedReleaseService, GitHubAttestationVerifier, GitHubReleaseSource, SafeHttpClient
from .server import UnixServer
from .store import StateStore
from .system import CommandRunner


def build(config: Config) -> tuple[UpdaterApplication, DeploymentCoordinator]:
    store = StateStore(config.state_path)
    store.initialize()
    runner = CommandRunner()
    client = SafeHttpClient()
    source = GitHubReleaseSource(client, GitHubAttestationVerifier(runner, client))
    releases = CachedReleaseService(store, source)
    deployer = ProductionDeployer(config, runner, source)
    coordinator = DeploymentCoordinator(store, releases, deployer, config.lock_path)
    return UpdaterApplication(store, releases, deployer, coordinator), coordinator


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    if len(sys.argv) != 2 or sys.argv[1] not in {"serve", "check", "status", "reconcile"}:
        print("usage: python3 -m filmframe_updater {serve|check|status|reconcile}", file=sys.stderr)
        return 2
    config = Config.load()
    command = sys.argv[1]
    if command == "serve":
        application, coordinator = build(config)
        coordinator.reconcile()
        UnixServer(config, application).serve_forever()
        return 0
    if command in {"check", "status"}:
        result = call(config.socket_path, "check", {"force": command == "check"})
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    _application, coordinator = build(config)
    job = coordinator.reconcile()
    print(json.dumps({"job": job.public_dict() if job else None}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except UpdaterError as error:
        print(f"updater error: {error.code}", file=sys.stderr)
        raise SystemExit(1) from None
