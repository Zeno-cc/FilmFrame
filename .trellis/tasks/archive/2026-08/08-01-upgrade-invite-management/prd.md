# Upgrade Invitation Management

## Goal

Let the single FilmFrame administrator issue and manage groups of invitation codes safely, without weakening the existing one-time plaintext and single-redemption security model.

## Background and Confirmed Facts

- The administrator can currently create one invite at a time with a required label.
- Invite plaintext is returned only by the first successful create response; SQLite stores only a SHA-256 hash.
- A UUID idempotency key currently maps to exactly one invite and cannot represent a batch.
- Invites expire for redemption after 7 days, permit one redemption, and issue a long-lived device session.
- Revoking one invite transactionally revokes all sessions issued by that invite.
- Administrator writes already require a verified Cloudflare Access identity, exact Origin, JSON content type, and a CSRF header.
- The administrator UI is server-rendered and intentionally uses no frontend framework.

## Requirements

### R1. Batch creation

- The administrator can create a named batch containing 1 to 50 invitations.
- Each invite receives a deterministic display label derived from the batch name and a sequence number.
- The service creates the batch and all invitations in one immediate SQLite transaction; partial batches are forbidden.
- A new persisted batch entity groups its invitations. Existing standalone invitations remain valid and have no batch.

### R2. Safe idempotency and rate limiting

- One UUID `Idempotency-Key` identifies the whole batch request.
- Replaying the same key and same payload returns batch metadata without plaintext codes and does not create more rows.
- Reusing the same key with a different batch name or count returns HTTP 409.
- Batch generation is limited by the number of codes generated, not only by request count. The initial limit is 100 codes per IP per minute in addition to the existing administrator request limit.
- Invalid counts, overlong names, non-JSON bodies, unknown fields, and missing security headers create no data.

### R3. One-time delivery

- Plaintext codes are returned only in the first HTTP 201 response and are never stored in SQLite, logs, URLs, browser storage, or the initial HTML.
- The UI shows the newly generated set as a one-time result and supports copying all codes, downloading a CSV, and explicitly clearing the result.
- CSV export contains only the current fresh response and uses spreadsheet-safe escaping.
- Clearing the result or leaving the page removes the plaintext from the DOM and in-memory UI state.
- A replay or uncertain response clearly explains that plaintext cannot be recovered and directs the administrator to revoke the batch and regenerate it.

### R4. Batch management

- Invitation records show their batch and most recent redemption time.
- The UI provides client-side keyword search, batch/status filters, and status counters for the currently loaded records.
- The administrator can revoke an entire batch after a confirmation that states the affected invite and active-session counts.
- Batch revocation is idempotent and transactional, preserves history, and immediately revokes all sessions belonging to the batch invitations.
- Individual invite and individual device-session revocation continue to work.

### R5. Auditability and compatibility

- Successful batch creation, batch revocation, invite revocation, and session revocation emit structured, redacted audit events with request ID, target ID, action, timestamp, and affected counts.
- Audit events never contain invite plaintext, cookies, JWTs, request bodies, or the full administrator email.
- Existing standalone invite creation, redemption, session refresh, backup, migration, and deployment verification behavior remains compatible.
- No new frontend framework, queue, cache service, or large dependency is introduced.

## Acceptance Criteria

- [x] Counts 1 and 50 succeed; 0, negative, fractional, and 51 fail with HTTP 400 and zero writes.
- [x] A 50-code batch contains 50 unique valid `FF1-` codes while SQLite and application logs contain no plaintext code.
- [x] Any injected insert failure rolls back the batch, its invitations, and its idempotency record.
- [x] Twenty concurrent requests with the same key create one batch only; one response contains codes and replays do not.
- [x] Reusing an idempotency key with a different payload returns HTTP 409 without additional writes.
- [x] Two 50-code batches consume the one-minute generation budget; another code in the same window returns HTTP 429 and writes nothing.
- [x] Copy-all, CSV download, clear, and page-exit handling work without browser storage.
- [x] CSV output cannot interpret administrator-supplied batch names as formulas.
- [x] Search, filters, and counters update consistently after creation and revocation.
- [x] Batch revocation handles mixed invite states, revokes all associated live sessions, and is safe to repeat.
- [x] Existing single-invite and session tests remain green.
- [x] Access-service tests, type check, build, deployment verification, Compose validation, and `git diff --check` pass.

## Out of Scope

- Custom redemption lifetime, multiple redemptions per code, and changes to device-session lifetime.
- Email delivery, scheduled generation, paid quotas, multiple administrators, roles, or approval workflows.
- Recovering or redisplaying plaintext invitation codes.
- Deleting invitation history, undoing revocation, or editing an already issued code.
- Server-side search, analytics dashboards, and cursor pagination. The current private single-administrator deployment will keep client-side filtering; pagination becomes a separate task if record volume materially grows.
- A distributed rate limiter. The current deployment is a single access-service process; multi-replica deployment must replace the in-memory weighted limiter.

## Deferred Items and Risks

- Full pagination and a 10k-record performance target are valuable but would expand this task substantially. The new batch and list indexes should keep the current private deployment healthy while a later task adds cursor pagination if needed.
- Daily generation quotas and persistent audit tables are deferred. This task adds a one-minute weighted guard and structured logs; log retention remains an infrastructure responsibility.
- Existing single-invite idempotency does not bind the request payload. Batch idempotency will be payload-bound without changing the established single-invite contract in this task.
