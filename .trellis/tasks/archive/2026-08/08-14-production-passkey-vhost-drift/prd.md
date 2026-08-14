# Fix production Passkey vhost drift

## Goal

Restore the deployed FilmFrame Passkey setup and recovery flow after a
successful invitation redemption, without changing the application containers
or any other 1Panel/OpenResty website.

## Background

- The production invitation was successfully redeemed and the resulting
  session can open `/` and `/api/runtime-config`.
- Production `GET /access/passkey/setup` currently returns the static SPA
  instead of the Access sidecar page.
- The active FilmFrame vhost at
  `/opt/1panel/www/conf.d/filmframe.astrocean.space.conf` jumps directly from
  `/auth/refresh` to `/api/runtime-config`.
- The repository template at
  `ops/openresty/filmframe-auth.conf.example` defines the missing setup,
  client-bundle, registration, and authentication locations.
- `ops/proxy-test/nginx.conf` and `scripts/test-invite-proxy.mjs` already cover
  the intended proxy behavior, while
  `scripts/verify-invite-deployment.mjs` does not currently reject a public
  vhost that omits those locations.

## Requirements

1. Add only these exact locations to the production FilmFrame vhost, matching
   the repository template:
   - `/access/passkey/setup`
   - `/auth/passkeys/client.js`
   - `/auth/passkeys/registration/options`
   - `/auth/passkeys/registration/verify`
   - `/auth/passkeys/authentication/options`
   - `/auth/passkeys/authentication/verify`
2. Back up the active FilmFrame vhost before replacement.
3. Run the active OpenResty configuration test before reload and reload only
   after it passes.
4. Add deployment-verifier assertions that fail when any required Passkey
   location or its Access-sidecar target is absent from either the repository
   vhost template or the loaded OpenResty configuration.
5. Keep invitation codes, session Cookies, OAuth credentials, and server
   credentials out of source files, command output, logs, and the final report.
6. Preserve the browser-only photo-processing boundary and all existing access
   checks.

## Acceptance Criteria

- [x] The active FilmFrame vhost contains all six exact Passkey locations and
      no unrelated production vhost changes.
- [x] `docker exec 1Panel-openresty-qMnm openresty -t` succeeds before reload.
- [x] OpenResty reload succeeds and the container remains healthy/running.
- [x] An existing redeemed HTTPS session receives a setup page from
      `/access/passkey/setup` containing `记住此设备` and `稍后设置`.
- [x] The same-origin Passkey client bundle returns `200`.
- [x] Registration options return `200` for the redeemed session, and public
      authentication options return `200`.
- [x] The redeemed session still receives `200` from `/` and
      `/api/runtime-config` after reload.
- [x] The administrator view records the dedicated test invitation as redeemed
      with one active device session.
- [x] The deployment verifier passes with the complete template and has a
      regression assertion for every Passkey proxy location.

## Out of Scope

- Changing the FilmFrame or Access application implementation or images.
- Creating or registering a real platform Passkey during this repair.
- Changing Cloudflare, certificates, DNS, other 1Panel sites, or shared
  OpenResty configuration.
- Reworking the existing Passkey protocol or invitation model.

## Technical Notes

- This is a lightweight production configuration correction plus one local
  regression guard; no `design.md` or `implement.md` is required.
- Rollback is restoration of the timestamped FilmFrame vhost backup followed by
  `openresty -t` and reload.
