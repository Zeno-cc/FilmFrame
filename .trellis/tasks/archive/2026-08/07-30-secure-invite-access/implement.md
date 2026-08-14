# 安全邀请码访问门禁实施计划

## 1. Preflight

- Snapshot every dirty path and preserve unrelated Trellis/configuration/container changes.
- Confirm OpenResty `http_auth_request_module`, current FilmFrame vhost include paths, wildcard certificate coverage and loopback upstream behavior.
- Confirm Cloudflare Zero Trust Free account exposes Google IdP, Independent MFA biometrics/security key and application-level MFA policy.
- Create the Google Web OAuth client interactively; place Client ID/Secret only in Cloudflare Zero Trust and enable PKCE.
- Record no credentials in shell history, task documents, repository files or command output.

## 2. Access Service Package

- Add an independent `server/access` TypeScript package with pinned lockfile and Node LTS runtime.
- Configure Express 5, Helmet, strict body limits, loopback-only proxy trust, host allowlist, production errors and health checks.
- Add typed environment validation for film/admin hosts, database path, Access team domain, audience, administrator identity and secure-Cookie mode.
- Add a multi-stage non-root Docker image; database and runtime secrets stay outside the image.

## 3. Persistence And Domain Logic

- Add versioned SQLite migrations for `invites`, `sessions` and indexes.
- Enable foreign keys, WAL, busy timeout and persistent volume permissions.
- Implement and test Crockford code generation, normalization, versioning and SHA-256 hashing.
- Implement atomic create, redeem, session lookup, rolling refresh, expiry and invite/session revocation transactions.
- Add an SSH-only break-glass CLI for create/list/revoke without exposing a public admin credential.

## 4. Public Invitation Gateway

- Add a server-rendered `/access` page consistent with FilmFrame's darkroom styling and usable at 390px.
- Add short-lived form nonce protection and a POST-only `/auth/redeem` flow with generic errors.
- Set the host-only HttpOnly session Cookie only after transaction commit; redirect with 303.
- Add the loopback-only session-check endpoint used by OpenResty.
- Refresh the device session once when `App.tsx` starts; remove the user-facing logout command from `MoreMenu`/`AppHeader`.

## 5. Public Admin Console

- Add Access JWT middleware using `jose` remote JWKS verification and exact issuer/audience/admin identity checks.
- Add list, create and revoke APIs; never serialize code hashes or old plaintext codes.
- Add exact-Origin, JSON/custom-header CSRF defense, no CORS, rate limits and no-store responses.
- Build a responsive management view with fixed policy summary, status list, one-time copy result and confirmed revoke action.
- Add a Cloudflare logout link only if it does not expose tokens to client code.

## 6. Container And OpenResty Integration

- Update Compose so static and access services bind only to loopback/private networks and the SQLite volume persists.
- Harden the inner Nginx cache headers for protected resources.
- Add version-controlled OpenResty example configs for the FilmFrame gate and admin vhost.
- Back up and update only the two relevant 1Panel site configs; run `openresty -t` before reload.
- Ensure forwarded headers are overwritten, auth subrequests are internal/non-cached and failures remain closed.

## 7. Cloudflare Configuration

- Create the admin DNS record with orange cloud and reuse the existing wildcard certificate at origin.
- Add Google IdP with External audience and PKCE; store the Client Secret only in Cloudflare.
- Create a self-hosted Access application for the admin hostname.
- Add exact-email Include + Google login Require policy; verify no Everyone or broad login-method-only rule exists.
- Enable Independent MFA biometrics/security key, disable IdP AMR substitution, use an 8-hour duration and enroll two credentials.
- Set complete cache bypass for the FilmFrame hostname, disable stale public serving where applicable and purge existing cached assets.

## 8. Automated Verification

Access service checks:

```bash
npm --prefix server/access test
npm --prefix server/access run typecheck
npm --prefix server/access run build
```

Repository checks:

```bash
npm run check
npm run test:e2e
git diff --check
docker compose config
docker compose build
```

Focused automated coverage:

- Code format, normalization, entropy shape and invalid input limits.
- Seven-day redemption boundary and 400-day rolling session boundary with an injected clock.
- Serial and 20-way concurrent single-use redemption.
- Session Cookie flags, tampering, refresh, expiry and invite cascade revocation.
- SQLite restart, migration idempotency, backup and restore.
- Access JWT missing/tampered/expired/wrong issuer/wrong audience/unknown `kid` and JWKS refresh.
- Admin identity allowlist, Origin/custom-header CSRF checks, body limits, CORS denial and redacted errors.
- OpenResty anonymous navigation, direct asset URL, valid session and access-service outage behavior.
- Playwright gate flow proving the Vite bundle is absent before authentication, then upload/render/export after redemption.
- Existing FilmFrame E2E suite under an authenticated fixture or development bypass that cannot be enabled in production.

## 9. Production Validation

- Run `openresty -t` and reload only after success.
- Verify static/access containers are healthy on loopback and public application ports refuse connections.
- Verify anonymous, valid invite, reused invite, revoked invite, expired session and rolling refresh over external HTTPS.
- Verify direct-origin requests with the production Host/SNI cannot bypass either user or admin authentication.
- Verify Google alone fails, Passkey without Google fails, and Google + Independent MFA succeeds on mobile and desktop.
- Verify old hashed asset URLs are not Cloudflare HITs and never return bytes anonymously.
- Verify photos produce no upload request during the full FilmFrame workflow.
- Verify unrelated 1Panel/OpenResty vhosts still return their previous status, certificate and content.
- Inspect database, logs, image layers and built assets for invitation/session/JWT/Google secret leakage.

## 10. Rollback And Handoff

- Keep timestamped backups of Compose and the two relevant OpenResty site configs.
- On failure, restore the previous application image/config while keeping loopback-only binding and cache bypass.
- If Cloudflare admin authentication fails, use the SSH break-glass CLI rather than exposing the admin API.
- Restore the pre-migration SQLite backup if migration or data integrity checks fail.
- Document final domains, upstream ports, config paths, Access application audience, backup location and recovery commands without recording secrets.

## Risky Files And Boundaries

- `compose.yaml`, `Dockerfile`, `nginx.conf`, `.dockerignore`, `package.json`, `package-lock.json` and `tsconfig.json` already have or may overlap unrelated work; merge rather than replace.
- `components/app/MoreMenu.tsx` and `AppHeader.tsx` own menu keyboard/focus behavior; logout must reuse that contract.
- Production files under `/opt/1panel/www/` are external state and require backup plus config validation before reload.
- Cloudflare and Google credentials are external secrets; never write them through `apply_patch` or commit them.

## Start Gate

Do not run `task.py start` until the user approves the final planning summary, both context manifests validate, and the Cloudflare feature preflight confirms the required free-plan capabilities.
