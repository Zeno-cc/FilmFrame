# Design — project-wide quality audit

## Boundaries

The audit is a review-and-repair task, not a redesign. Read the current tree and preserve all unrelated modifications. Research agents produce findings only; the parent verifies them, groups independent fixes and delegates implementation with explicit file ownership. No two agents modify the same file.

## Review partitions

1. Frontend workflow: `App.tsx`, `components/`, browser workflow services, responsive/accessibility and artifact ownership.
2. Imaging: `services/physical135/`, `services/spectral/`, rendering, Worker integration and numerical/resource tests.
3. Backend/operations: `server/access/`, `ops/`, Compose/OpenResty, deployment, backup, updater and release scripts.
4. Dependencies/docs/assets: manifests, imports, public runtime assets, documentation claims and dead/obsolete files.

## Fix policy

Fix confirmed correctness/resource defects with focused regression coverage when the repair is local and preserves behavior. Small measurement-backed inefficiencies may be fixed if they do not introduce a new abstraction. Document broad refactors, unmeasured optimization, unverified native parity, historical assets and license choices as open items.

## Evidence

Record baseline failures before repairs. For each finding retain path, actual trigger, consequence and verification. Distinguish confirmed defects from limitations and review choices. Test changes must assert behavior, not merely mirror an implementation detail.

## Rollback

Each repair is limited to its owned files. If a change breaks an existing contract or cannot be supported by a focused test, revert only that repair using its exact edit and leave the original finding open. Do not use destructive Git cleanup.
