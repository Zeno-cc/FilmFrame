# FilmFrame v1.3 release candidate

This directory contains the local, auditable assets for the temporary
`filmframe-rc.astrocean.space` environment. The release candidate is for
physical iPhone Safari and Android Chrome validation only. It is not a stable
release and must never be supplied to the host updater.

## Boundary

- Candidate source is pinned to commit
  `838e4b0afcf5f35a285553c7e9a0cb8947e6af26`.
- Compose project: `filmframe-rc`.
- Static and Access containers publish only `127.0.0.1:18182` and
  `127.0.0.1:18183`.
- The Access database uses the independent named volume
  `filmframe_rc_access_data`.
- The candidate has no backup profile, updater socket, Docker socket, release
  tree, production volume, production backup mount, or admin vhost.
- The OpenResty template accepts only the candidate host and candidate
  upstreams. It reuses the already-installed wildcard certificate and tracked
  Cloudflare real-IP include after rendering.

The files do not contain Cloudflare credentials, Google secrets, JWTs, Cookies,
invitation codes, or production database content. A server-only `.env` must be
created with mode `0600` from `.env.example`; it must never be copied back into
the repository.

## Local checks

Run these commands from the repository root with Node 22:

```bash
node ops/release-candidate/verify-assets.mjs
node ops/release-candidate/verify-assets.mjs --docker
git diff --check
```

The second command requires Docker and checks that Compose renders without
warnings or unresolved variables. It does not start containers.

Render a vhost only after confirming the real 1Panel certificate and
Cloudflare include paths on the target host:

```bash
node ops/release-candidate/render-vhost.mjs \
  --output /tmp/filmframe-rc.astrocean.space.conf \
  --certificate /absolute/path/to/astrocean.space/fullchain.pem \
  --certificate-key /absolute/path/to/astrocean.space/privkey.pem \
  --real-ip-include /usr/local/openresty/nginx/conf/conf.d/cloudflare-real-ip.conf
```

The renderer refuses relative certificate/include paths, unresolved
placeholders, newlines in values, and accidental in-place template writes.

## Host-side candidate procedure

The following procedure is intentionally manual and scoped to the RC. It does
not edit the production `compose.yaml`, `/opt/filmframe/current`, production
volume, updater, or other 1Panel sites.

1. Export the fixed commit into a new candidate release directory. Do not use
   a mutable server checkout:

   ```bash
   git archive --format=tar --prefix=filmframe-1.3.0-rc.1/ \
     838e4b0afcf5f35a285553c7e9a0cb8947e6af26 | tar -x -C /opt/filmframe/candidates
   ```

2. In that directory, create a server-only `.env` with mode `0600` and fill
   only the candidate Cloudflare Access settings:

   ```bash
   install -m 600 ops/release-candidate/.env.example ops/release-candidate/.env
   ```

   Keep `FILMFRAME_HOST`, ports, volume, version, revision, and updater-disabled
   values unchanged.

3. Validate and build the isolated project:

   ```bash
   docker compose --project-name filmframe-rc \
     --env-file ops/release-candidate/.env \
     -f ops/release-candidate/compose.yaml config --quiet
   docker compose --project-name filmframe-rc \
     --env-file ops/release-candidate/.env \
     -f ops/release-candidate/compose.yaml build
   docker compose --project-name filmframe-rc \
     --env-file ops/release-candidate/.env \
     -f ops/release-candidate/compose.yaml up -d
   ```

   Confirm with `docker compose ... ps` and `docker inspect` that both
   containers are healthy, only the two loopback ports are published, and the
   Access container has only `/data` mounted. The image labels must show the
   fixed revision and `1.3.0-rc.1`/`release-candidate` channel.

4. Before DNS or reload, render the candidate vhost to a temporary file. Copy
   it into the FilmFrame-only 1Panel `conf.d` location only after reviewing the
   diff. Run the active OpenResty syntax test; if it fails, do not reload.

5. In Cloudflare, preflight the zone and existing record. Create only the A
   record `filmframe-rc.astrocean.space -> 23.95.164.148` with proxy enabled
   when no same-name record exists. If a same-name record exists with another
   type/value/proxy state, stop for manual review; never overwrite it. Do not
   modify the production FilmFrame, admin, cache, SSL, or Access policies.

6. After successful reload, run the secret-free deployment probes: local
   loopback health, anonymous `/access` redirect, public HTTPS, source-origin
   rejection, `no-store`/cache behavior, and the protected
   `/api/runtime-config` route. Generate two temporary codes through the RC
   Access CLI only after the edge checks pass:

   ```bash
   docker compose --project-name filmframe-rc \
     --env-file ops/release-candidate/.env \
     -f ops/release-candidate/compose.yaml exec access \
     node dist/src/cli.js create --label "RC iPhone Safari"
   docker compose --project-name filmframe-rc \
     --env-file ops/release-candidate/.env \
     -f ops/release-candidate/compose.yaml exec access \
     node dist/src/cli.js create --label "RC Android Chrome"
   ```

   The CLI prints each plaintext code once. Do not redirect stdout, paste a
   code into GitHub, write it into a log/evidence file, or send it through a
   ticket. Deliver it directly to the corresponding tester, then clear it.

7. Record only the redacted fields in
   `docs/project/mobile-smoke-evidence-template.md`. The candidate cannot be
   called release-ready until both physical-device records are PASS.

## Rollback

Stop only the RC project, remove/disable only the RC vhost after a successful
OpenResty `-t`, and delete only the DNS record created for the RC. Keep the RC
volume until the physical tests and evidence review are complete. Cleaning the
RC volume is a separate explicitly approved action. Never touch production
`current`, production volumes/backups, the updater, or unrelated 1Panel vhosts.
