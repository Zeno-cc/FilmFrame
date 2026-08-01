# Current Implementation Audit

- `server/access/src/store.ts:122-214` provides unique code insertion plus single-invite idempotency. The existing request table maps one key to one invite and cannot represent a batch.
- `server/access/src/routes/adminRoutes.ts:100-164` preserves administrator authentication, Origin/CSRF, JSON, and per-item revocation boundaries.
- `server/access/src/views/html.ts:121-261` implements a server-rendered administrator page, one-time plaintext display, clipboard copy, and `pagehide` cleanup without a frontend framework.
- `server/access/src/app.ts:110-117` caps JSON at 4 KB and administrator traffic at 60 requests per minute. Client-side loops would risk partial success and uncertain plaintext loss.
- `server/access/migrations/002_harden_sessions.sql:38-42` makes idempotency key-to-invite one-to-one.
- `server/access/tests/app.test.ts:429-533` already covers write security, one-time plaintext, and concurrent single-invite idempotency.

Recommended extension: a real batch entity, atomic 1-50 generation, payload-bound batch idempotency, one-time copy/CSV, batch revocation, and low-cost client-side filtering/statistics.
