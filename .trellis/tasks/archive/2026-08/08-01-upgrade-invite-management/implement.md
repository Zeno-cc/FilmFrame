# Implementation Plan

1. Add the batch migration and migration/store regression tests.
2. Implement batch types, payload-bound idempotent creation, listing, and transactional revocation in the store.
3. Extend the rate limiter with weighted costs and add focused unit coverage.
4. Add batch HTTP schemas/routes, response serialization, redacted audit events, and API tests for security, validation, concurrency, rollback, replay, and revocation.
5. Upgrade the administrator HTML/CSS/JavaScript for batch creation, one-time copy/CSV/clear, batch management, counters, search, and filters.
6. Update the access-service README/API documentation and any deployment fixtures affected by the additive endpoints.
7. Run focused access-service tests, type check, build, root checks, deployment verification, Compose validation, and `git diff --check`.
8. Run an independent Trellis check against the PRD and resolve findings before handoff.

## Validation Commands

```bash
npm --prefix server/access test
npm --prefix server/access run typecheck
npm --prefix server/access run build
npm run check
npm run verify:deployment
docker compose config --quiet
git diff --check
```

## Risky Files and Rollback Points

- `server/access/migrations/003_invite_batches.sql`: additive only; verify old database migration and fresh database creation.
- `server/access/src/store.ts`: preserve single-code redemption and revocation behavior; keep each new batch write transactional.
- `server/access/src/routes/adminRoutes.ts`: do not weaken authentication, Origin, CSRF, content-type, or idempotency checks.
- `server/access/src/views/html.ts`: keep dynamic values inserted with `textContent`, not `innerHTML`; clear fresh secrets on page exit.
- `server/access/src/middleware/rateLimit.ts`: default unit-cost behavior must remain unchanged for public redemption and ordinary admin requests.

## Review Gates

- Database never stores plaintext codes.
- Replay responses never include plaintext.
- No partial batch can survive a failure.
- Batch revocation immediately invalidates related sessions.
- Existing standalone invite behavior remains compatible.
