# Backend Development Guidelines

> Server-side contracts for FilmFrame deployment services.

## Guidelines Index

| Guide | Description | Status |
| --- | --- | --- |
| [Access Control](./access-control.md) | Invitation, session, admin JWT, SQLite, reverse-proxy, and trusted host-update boundaries | Current |
| [Release and Push Process](./release-process.md) | Versioned product pushes, stable tags, GitHub Releases, and updater discovery | Current |

## Pre-Development Checklist

Before changing `server/access`, Compose, or the FilmFrame OpenResty vhosts:

1. Read [Access Control](./access-control.md) completely.
2. Preserve the browser-only photo-processing boundary.
3. Confirm public resources remain behind the OpenResty session subrequest.
4. Keep runtime secrets outside the repository, image layers, logs, and backups.

## Quality Check

- Run the access-service tests under Node 22, then its type check and build.
- Run `npm run verify:deployment`, `docker compose config --quiet`, and `git diff --check`.
- Before production cutover, test the active OpenResty configuration, Cloudflare policy/cache behavior, direct-origin requests, and fail-closed behavior.

**Language**: All documentation should be written in **English**.
