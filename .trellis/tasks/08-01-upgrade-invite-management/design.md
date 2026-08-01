# Technical Design

## Boundaries

- Keep `server/access` as the only service involved.
- Keep the administrator page server-rendered in `src/views/html.ts` with small inline JavaScript.
- Preserve Cloudflare Access authentication and the existing request-security middleware.
- Reuse the existing invite generator, code hashing, redemption transaction, and session revocation behavior.

## Data Model

Add migration `003_invite_batches.sql`:

- `invite_batches`: `id`, `name`, `invite_count`, `created_at`, `revoked_at`.
- `invite_batch_creation_requests`: hashed idempotency key, hashed normalized payload, batch ID, and creation time.
- Nullable `invites.batch_id` and `invites.batch_position` columns for backward compatibility.
- Indexes for batch membership and batch list ordering.

No plaintext invitation code is persisted. Existing rows remain standalone invites with null batch fields.

## Store Contracts

- Add `BatchSummary`, `BatchInviteResult`, and `IdempotentBatchResult` types.
- Add a payload-bound `createInviteBatchIdempotent` operation that runs an immediate transaction around batch insertion, all invite insertions, and the idempotency record.
- Generalize the internal invite insertion helper only enough to accept batch metadata; keep single-invite creation behavior unchanged.
- Add `listBatches` and enrich `InviteSummary` with nullable batch metadata.
- Add `revokeBatch`, which atomically marks the batch and its invites revoked and cascades revocation to their sessions. Return affected counts for UI confirmation/audit output.

## HTTP Contracts

- `POST /api/invite-batches`
  - Body: `{ "name": string, "count": integer }`.
  - Headers: existing admin write security plus UUID `Idempotency-Key`.
  - `201`: batch metadata and an ordered array of `{ code, invite }`.
  - `200`: replayed batch metadata with invites and no plaintext.
  - `409`: the idempotency key was already used with another payload.
  - `429`: weighted creation budget exceeded.
- `GET /api/invite-batches`: batch metadata for management/filtering.
- `POST /api/invite-batches/:id/revoke`: transactional batch revocation and affected counts.
- Existing endpoints remain compatible.

## Rate Limiting

Extend the small in-memory rate limiter with an optional request-cost function. The existing limit keeps unit cost. A second limiter on the batch-create route charges the validated requested count and permits 100 generated codes per IP per minute. Invalid input still costs one unit before schema rejection.

## Administrator UI

- Add a mode selector for single invite versus batch generation without introducing a framework.
- Batch inputs are batch name and count (default 10, maximum 50).
- The one-time result becomes a small scrollable table and action bar: copy all, download CSV, clear.
- Store fresh plaintext only in a module-local array; clear the array and DOM on explicit clear and `pagehide`.
- Add summary counters and client-side filters based on row data attributes.
- Add batch metadata to invite rows and a compact batch management table with revoke actions.
- Derive the revoke impact count from current server data and use the server response as the authoritative final result.

## Audit Events

Add one small helper that emits production JSON events through `console.info`. Events include request ID, operation, target type/ID, affected counts, and timestamp. They exclude request bodies and all secret-bearing fields. Tests capture output and scan for the `FF1-` prefix.

## Compatibility and Rollback

- Migration is additive; old invites continue to work.
- Rolling the application image back after migration is safe because older code ignores new tables/columns.
- The UI retains single-invite creation and all current revocation controls.
- If the batch feature must be disabled, remove its UI entry and route wiring; no migration rollback is required.

## Trade-offs

- Client-side filtering is retained because the service is private and single-admin. Cursor pagination is deferred until real volume requires it.
- The generation quota is process-local because production currently runs one access-service process. A distributed counter would be unnecessary infrastructure today.
- Structured logs are used instead of a new audit database table to keep schema and retention responsibilities small.
