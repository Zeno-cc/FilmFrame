# Product and Security Review

## Recommended MVP

- Generate 1-50 invites in one transaction and group them with a persisted batch ID/name.
- Return plaintext only once, with copy-all, CSV download, explicit clear, and page-exit cleanup.
- Add batch/status/keyword filters and status counters without adding a frontend framework or server query layer.
- Revoke a batch transactionally and cascade to active device sessions.
- Charge creation limits by generated code count and emit redacted structured audit events.

## Security Invariants

- Keep the existing 128-bit invite generator and SHA-256-only persistence.
- Batch idempotency must be bound to both batch name and count.
- A replay never restores plaintext.
- Invalid requests and insertion failures leave no batch, invite, or idempotency residue.
- CSV cells derived from administrator input must be spreadsheet-safe.
- Audit output must not contain invite codes, cookies, JWTs, request bodies, or full administrator email.

## Deferred

- Pagination and 10k-row performance work, daily persistent quotas, editable authorization duration, multi-redemption codes, automatic delivery, multi-admin roles, and a dedicated audit database.
- These items add substantial state or authorization complexity and are not required for the current private, single-process, single-administrator deployment.
