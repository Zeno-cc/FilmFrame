from __future__ import annotations

import concurrent.futures
import tempfile
import unittest
import uuid
from pathlib import Path

from filmframe_updater.errors import UpdaterError
from filmframe_updater.store import StateStore
from tests.helpers import manifest


class StateStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.store = StateStore(Path(self.temporary.name) / "state.sqlite")
        self.store.initialize()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def create(self, *, version: str = "1.1.0", key: str | None = None):
        return self.store.create_job(
            manifest(version),
            idempotency_key=key or str(uuid.uuid4()),
            actor_hash="e" * 64,
        )

    def test_concurrent_same_target_returns_one_job(self) -> None:
        def create_once(_index: int):
            return self.create()[0].id

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
            ids = list(executor.map(create_once, range(20)))
        self.assertEqual(len(set(ids)), 1)

    def test_different_target_is_busy_and_key_is_payload_bound(self) -> None:
        key = str(uuid.uuid4())
        job, created = self.create(key=key)
        self.assertTrue(created)
        replay, replay_created = self.create(key=key)
        self.assertFalse(replay_created)
        self.assertEqual(replay.id, job.id)
        with self.assertRaises(UpdaterError) as busy:
            self.create(version="1.2.0")
        self.assertEqual(busy.exception.code, "update_busy")
        with self.assertRaises(UpdaterError) as conflict:
            self.create(version="1.2.0", key=key)
        self.assertEqual(conflict.exception.code, "idempotency_conflict")

    def test_state_machine_is_monotonic_and_records_events(self) -> None:
        job, _ = self.create()
        expected = [
            "verifying_release",
            "pulling_artifacts",
            "staging_release",
            "rehearsing_migration",
            "backing_up",
            "ready_to_switch",
            "switching",
            "verifying_loopback",
            "verifying_origin",
            "verifying_public",
            "succeeded",
        ]
        for state in expected:
            self.store.transition(job.id, state)
        self.assertEqual(self.store.get_job(job.id).state, "succeeded")  # type: ignore[union-attr]
        self.assertEqual(self.store.event_states(job.id), ["queued", *expected])
        self.assertIsNone(self.store.get_active_job())
        with self.assertRaises(ValueError):
            self.store.transition(job.id, "rolling_back")

    def test_recovery_required_holds_the_active_constraint(self) -> None:
        job, _ = self.create()
        for state in (
            "verifying_release",
            "pulling_artifacts",
            "staging_release",
            "rehearsing_migration",
            "backing_up",
            "ready_to_switch",
            "switching",
            "rolling_back",
        ):
            self.store.transition(job.id, state)
        self.store.transition(job.id, "recovery_required", error_code="rollback_failed")
        self.assertEqual(self.store.get_active_job().id, job.id)  # type: ignore[union-attr]
        with self.assertRaises(UpdaterError) as raised:
            self.create(version="1.2.0")
        self.assertEqual(raised.exception.code, "update_busy")

    def test_release_cache_round_trips_strict_manifest(self) -> None:
        expected = manifest()
        self.store.cache_release(expected)
        cached = self.store.get_cached_release()
        self.assertIsNotNone(cached)
        self.assertEqual(cached[0], expected)  # type: ignore[index]


if __name__ == "__main__":
    unittest.main()
