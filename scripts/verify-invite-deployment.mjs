#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
let failures = 0;
let skipped = 0;
let accessTeamDomain = "";
let configuredFilmframeHost = "";

const PASSKEY_PROXY_ROUTES = [
  "/access/passkey/setup",
  "/auth/passkeys/client.js",
  "/auth/passkeys/registration/options",
  "/auth/passkeys/registration/verify",
  "/auth/passkeys/authentication/options",
  "/auth/passkeys/authentication/verify",
];

await verifyCompose();
await verifyConfigFiles();
verifyInstalledOpenResty();

if (options.live) {
  await verifyLocalServices();
}

if (options.siteUrl) {
  await verifyPublicSite(options.siteUrl);
}

if (options.adminUrl) {
  await verifyPublicAdmin(options.adminUrl);
}

if (options.originUrl) {
  await verifyOrigin(
    options.originUrl,
    options.siteHost,
    "FilmFrame source",
    "filmframe",
  );
}

if (options.adminOriginUrl) {
  await verifyOrigin(
    options.adminOriginUrl,
    options.adminHost,
    "FilmFrame admin source",
    "admin",
  );
}

if (options.production && skipped > 0) {
  fail(`production verification cannot skip checks (${skipped} skipped)`);
}

if (failures > 0) {
  console.error(`\nVerification failed with ${failures} error(s).`);
  process.exitCode = 1;
} else {
  if (skipped === 0) {
    console.log("\nVerification passed.");
  } else {
    console.log(
      `\nConfiguration checks passed; runtime verification is incomplete (${skipped} check(s) skipped).`,
    );
  }
}

async function verifyCompose() {
  const result = spawnSync(
    "docker",
    ["compose", "--profile", "maintenance", "config", "--format", "json"],
    { cwd: root, encoding: "utf8" },
  );

  if (result.error) {
    fail(`docker compose is unavailable: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    fail("docker compose config failed");
    return;
  }

  let config;
  try {
    config = JSON.parse(result.stdout);
  } catch {
    fail("docker compose config did not return valid JSON");
    return;
  }

  verifyLoopbackPort(config, "filmframe", 80);
  verifyLoopbackPort(config, "access", 3000);
  verifyPrivateNetwork(config, "filmframe");
  verifyPrivateNetwork(config, "access");
  verifyContainerLimits(config, "filmframe");
  verifyContainerLimits(config, "access");
  verifyContainerLogging(config, "filmframe");
  verifyContainerLogging(config, "access");
  verifyHealthcheck(config, "filmframe");
  verifyHealthcheck(config, "access");

  const accessMounts = config.services?.access?.volumes ?? [];
  const hasDatabaseVolume = accessMounts.some(
    (mount) => mount.type === "volume" && mount.target === "/data",
  );
  check(hasDatabaseVolume, "access service persists /data in a named volume");
  check(
    !accessMounts.some((mount) => mount.target === "/backups"),
    "long-running access service cannot modify host backups",
  );
  const updaterSocketMount = accessMounts.find(
    (mount) => mount.target === "/run/filmframe-updater",
  );
  const accessBindMounts = accessMounts.filter((mount) => mount.type === "bind");
  check(
    accessBindMounts.length === 1 &&
    updaterSocketMount?.type === "bind" &&
      path.resolve(updaterSocketMount.source) === "/run/filmframe-updater" &&
      updaterSocketMount.read_only === true,
    "access service mounts only the updater socket directory read-only",
  );
  check(
    !accessMounts.some(
      (mount) =>
        mount.target === "/var/run/docker.sock" ||
        mount.source === "/var/run/docker.sock" ||
        mount.target === "/opt/filmframe" ||
        String(mount.target ?? "").startsWith("/opt/filmframe/"),
    ),
    "access service has no Docker socket or host deployment tree mount",
  );
  check(
    config.services?.access?.environment?.FILMFRAME_UPDATER_SOCKET ===
      "/run/filmframe-updater/updater.sock",
    "access service pins the updater Unix socket path",
  );
  check(
    Array.isArray(config.services?.access?.group_add) &&
      config.services.access.group_add.length === 1,
    "access service receives one explicit updater client group",
  );

  const backupService = config.services?.["access-backup"] ?? {};
  const backupMounts = backupService.volumes ?? [];
  const hasBackupDataVolume = backupMounts.some(
    (mount) => mount.type === "volume" && mount.target === "/data",
  );
  check(hasBackupDataVolume, "backup job mounts the access database volume");
  const hasBackupBind = backupMounts.some(
    (mount) =>
      mount.type === "bind" &&
      mount.target === "/backups" &&
      path.resolve(mount.source) === "/opt/filmframe/backups/access",
  );
  check(hasBackupBind, "backup job uses the dedicated host directory");
  check(
    backupService.network_mode === "none",
    "backup job has no network access",
  );
  check(
    (backupService.profiles ?? []).includes("maintenance") &&
      backupService.restart === undefined,
    "backup job is an explicit short-lived maintenance profile",
  );
  check(
    backupService.read_only === true &&
      (backupService.cap_drop ?? []).includes("ALL") &&
      (backupService.cap_add ?? []).includes("DAC_OVERRIDE") &&
      (backupService.security_opt ?? []).includes("no-new-privileges:true"),
    "backup job has only the capability required for SQLite WAL coordination",
  );
  check(
    config.services?.access?.read_only === true,
    "access service uses a read-only root filesystem",
  );
  check(
    (config.services?.access?.cap_drop ?? []).includes("ALL"),
    "access service drops Linux capabilities",
  );
  check(
    (config.services?.access?.security_opt ?? []).includes(
      "no-new-privileges:true",
    ),
    "access service prevents privilege escalation",
  );
  check(
    (config.services?.access?.tmpfs ?? []).some((mount) =>
      String(mount).startsWith("/tmp:"),
    ),
    "access service provides only a bounded writable /tmp",
  );
  accessTeamDomain =
    config.services?.access?.environment?.CF_ACCESS_TEAM_DOMAIN?.trim() ?? "";
  configuredFilmframeHost =
    config.services?.access?.environment?.FILMFRAME_HOST?.trim() ?? "";

  for (const serviceName of ["filmframe", "access"]) {
    const service = config.services?.[serviceName] ?? {};
    const revision = service.labels?.["org.opencontainers.image.revision"] ?? "";
    const image = service.image ?? "";
    if (options.production) {
      const immutableImage = isImmutableImageReference(image);
      check(
        /^[0-9a-f]{7,64}$/i.test(revision) && revision !== "uncommitted",
        `${serviceName} records a committed release revision`,
      );
      check(
        immutableImage,
        `${serviceName} deploys an immutable image digest or local image ID`,
      );
      if (immutableImage && isLocalImageId(image)) {
        verifyLocalImage(image, revision, serviceName);
      }
    } else {
      check(Boolean(image), `${serviceName} has an explicit image name`);
    }
  }

  const buildImages = [
    config.services?.filmframe?.build?.args?.NODE_BUILD_IMAGE,
    config.services?.filmframe?.build?.args?.NGINX_RUNTIME_IMAGE,
    config.services?.access?.build?.args?.ACCESS_NODE_IMAGE,
  ];
  check(
    buildImages.every((image) => isExactPatchImage(image)),
    "Docker build inputs use exact patch versions",
  );
  if (options.production) {
    check(
      buildImages.every((image) => /@sha256:[0-9a-f]{64}$/i.test(image)),
      "production Docker build inputs include verified digests",
    );
    const accessEnvironment = config.services?.access?.environment ?? {};
    check(
      !Object.values(accessEnvironment).some((value) =>
        /replace-with|your-team|example\.com/i.test(String(value)),
      ),
      "production access configuration contains no example placeholders",
    );
  }
}

async function verifyConfigFiles() {
  const [
    innerNginx,
    publicVhost,
    adminVhost,
    accessDockerfile,
    cloudflareRealIp,
    backupScript,
    restoreScript,
    inviteScheduleMigration,
  ] = await Promise.all([
    readFile(path.join(root, "nginx.conf"), "utf8"),
    readFile(
      path.join(root, "ops/openresty/filmframe-auth.conf.example"),
      "utf8",
    ),
    readFile(
      path.join(root, "ops/openresty/filmframe-admin.conf.example"),
      "utf8",
    ),
    readFile(path.join(root, "server/access/Dockerfile"), "utf8"),
    readFile(path.join(root, "ops/openresty/cloudflare-real-ip.conf"), "utf8"),
    readFile(path.join(root, "ops/backup/backup-access.sh"), "utf8"),
    readFile(path.join(root, "ops/backup/restore-access.sh"), "utf8"),
    readFile(
      path.join(root, "server/access/migrations/004_invite_schedule.sql"),
      "utf8",
    ),
  ]);

  check(
    /Cache-Control\s+"private, no-store"/.test(innerNginx),
    "inner Nginx disables protected-resource caching",
  );
  check(
    /Content-Security-Policy\s+"[^"]*script-src 'self'[^"]*worker-src 'self' blob:[^"]*"/.test(
      innerNginx,
    ),
    "inner Nginx applies the static application CSP",
  );
  check(
    /connect-src 'self' blob:/.test(innerNginx),
    "inner Nginx permits browser-only Blob reads for ZIP export",
  );
  check(
    /Permissions-Policy\s+"[^"]*camera=\(\)[^"]*microphone=\(\)[^"]*"/.test(
      innerNginx,
    ),
    "inner Nginx disables unused browser capabilities",
  );
  check(
    /internal;[\s\S]*\/internal\/session-check/.test(publicVhost),
    "public vhost keeps the session subrequest internal",
  );
  check(
    /proxy_pass http:\/\/filmframe_access_backend\/internal\/session-check;[\s\S]*?proxy_set_header Host access;/.test(
      publicVhost,
    ),
    "session subrequest uses the access service internal Host",
  );
  check(
    /location \^~ \/internal\/[\s\S]*return 404;/.test(publicVhost),
    "public vhost blocks public internal endpoints",
  );
  check(
    /location \/ \{\s*auth_request \/_filmframe_session_check;/.test(
      publicVhost,
    ),
    "public application paths require a session subrequest",
  );
  check(
    /location = \/auth\/refresh \{[\s\S]*?auth_request \/_filmframe_session_check;[\s\S]*?proxy_pass http:\/\/filmframe_access_backend\/auth\/refresh;/.test(
      publicVhost,
    ),
    "public device-session refresh requires authentication",
  );
  verifyPasskeyProxyRoutes(publicVhost, "public vhost template");
  check(
    /location = \/auth\/redeem \{[\s\S]*?proxy_pass http:\/\/filmframe_access_backend\/auth\/redeem;[\s\S]*?proxy_set_header X-Forwarded-Proto https;[\s\S]*?proxy_set_header Origin \$http_origin;/.test(
      publicVhost,
    ),
    "public redemption forwards the browser Origin with the HTTPS protocol",
  );
  check(
    /location = \/api\/runtime-config \{[\s\S]*?auth_request \/_filmframe_session_check;[\s\S]*?proxy_pass http:\/\/filmframe_access_backend\/api\/runtime-config;[\s\S]*?proxy_set_header Cookie \$filmframe_session_cookie;/.test(
      publicVhost,
    ),
    "public runtime configuration requires the invited device session",
  );
  check(
    !/location = \/auth\/logout \{/.test(publicVhost),
    "public vhost exposes no device logout route",
  );
  check(
    /error_page 500 502 503 504 = @filmframe_auth_unavailable;/.test(
      publicVhost,
    ),
    "public vhost fails closed when authentication is unavailable",
  );
  check(
    /location \/ \{[\s\S]*?auth_request \/_filmframe_session_check;[\s\S]*?proxy_set_header Cookie "";[\s\S]*?\n    \}/.test(
      publicVhost,
    ),
    "public vhost does not forward the session cookie to the static container",
  );
  check(
    /Cf-Access-Jwt-Assertion \$http_cf_access_jwt_assertion;/.test(
      adminVhost,
    ),
    "admin vhost forwards the Cloudflare Access assertion for verification",
  );
  check(
    /location \^~ \/internal\/[\s\S]*return 404;/.test(adminVhost),
    "admin vhost blocks public internal endpoints",
  );
  check(
    /proxy_intercept_errors on;[\s\S]*error_page 500 502 503 504 = @filmframe_admin_unavailable;/.test(
      adminVhost,
    ),
    "admin vhost fails closed when the access service is unavailable",
  );
  check(
    /include \/usr\/local\/openresty\/nginx\/conf\/conf\.d\/cloudflare-real-ip\.conf;/.test(
      publicVhost,
    ) &&
      /include \/usr\/local\/openresty\/nginx\/conf\/conf\.d\/cloudflare-real-ip\.conf;/.test(
        adminVhost,
      ),
    "both production vhosts load the trusted Cloudflare CIDRs",
  );
  check(
    (cloudflareRealIp.match(/^set_real_ip_from /gm) ?? []).length >= 20 &&
      /real_ip_header CF-Connecting-IP;/.test(cloudflareRealIp) &&
      /real_ip_recursive on;/.test(cloudflareRealIp),
    "Cloudflare real-IP trust is allowlisted and recursive",
  );
  check(
    /DEFAULT_BACKUP_ROOT=\/opt\/filmframe\/backups\/access/.test(backupScript) &&
      /integrity_check/.test(backupScript) &&
      /sha256sum/.test(backupScript) &&
      /RETENTION_DAYS/.test(backupScript) &&
      /--profile maintenance run --rm --no-deps access-backup/.test(backupScript),
    "backup script validates integrity, checksum, and retention",
  );
  check(
    /target volume already exists; refusing overwrite/.test(restoreScript) &&
      /filmframe_access_restore_/.test(restoreScript) &&
      /openDatabase/.test(restoreScript) &&
      /table_info\(invites\)/.test(restoreScript) &&
      /redeem_from AS redeemFrom/.test(restoreScript) &&
      /created_at AS redeemFrom/.test(restoreScript),
    "restore script migrates a new volume and compares legacy invite schedules",
  );
  check(
    /ADD COLUMN redeem_from INTEGER NOT NULL DEFAULT 0/.test(
      inviteScheduleMigration,
    ) &&
      /SET redeem_from = created_at/.test(inviteScheduleMigration) &&
      /CREATE TRIGGER invites_set_legacy_redeem_from/.test(
        inviteScheduleMigration,
      ),
    "invite schedule migration backfills history and supports legacy inserts",
  );
  check(
    /npm_config_build_from_source=true npm ci/.test(accessDockerfile),
    "access image compiles the SQLite native module for its runtime base",
  );
  check(
    /^USER\s+(?!0(?::0)?\s*$)\d+(?::\d+)?\s*$/m.test(accessDockerfile),
    "access image runs as a numeric non-root user",
  );
}

function verifyInstalledOpenResty() {
  if (!options.openrestyBin && !options.openrestyContainer) {
    const productionProbeRequested = Boolean(
      options.siteUrl ||
        options.adminUrl ||
        options.originUrl ||
        options.adminOriginUrl,
    );
    if (productionProbeRequested) {
      fail(
        "production probes require --openresty-bin or --openresty-container so the active config is tested",
      );
    } else {
      skip(
        "active OpenResty config test (pass --openresty-bin or --openresty-container on the server)",
      );
    }
    return;
  }

  const result = runOpenResty(["-t"]);
  if (result.error) {
    fail(`OpenResty config test could not start: ${result.error.message}`);
    return;
  }
  check(result.status === 0, "active OpenResty configuration passes -t");
  if (result.status !== 0) return;

  const dump = runOpenResty(["-T"]);
  if (dump.error) {
    fail(`OpenResty config dump could not start: ${dump.error.message}`);
    return;
  }
  check(dump.status === 0, "active OpenResty configuration can be inspected");
  if (dump.status !== 0) return;

  verifyPasskeyProxyRoutes(
    `${dump.stdout ?? ""}\n${dump.stderr ?? ""}`,
    "active OpenResty configuration",
  );
}

function runOpenResty(arguments_) {
  return options.openrestyContainer
    ? spawnSync(
        "docker",
        ["exec", options.openrestyContainer, "openresty", ...arguments_],
        { encoding: "utf8" },
      )
    : spawnSync(options.openrestyBin, arguments_, { encoding: "utf8" });
}

function verifyPasskeyProxyRoutes(config, label) {
  for (const route of PASSKEY_PROXY_ROUTES) {
    const block = exactLocationBlock(config, route);
    check(
      block !== null &&
        new RegExp(
          `proxy_pass\\s+http:\\/\\/filmframe_access_backend${escapeRegex(route)};`,
        ).test(block),
      `${label} proxies ${route} to the Access service`,
    );
  }
}

function exactLocationBlock(config, route) {
  const start = new RegExp(
    `^\\s*location\\s*=\\s*${escapeRegex(route)}\\s*\\{`,
    "m",
  ).exec(config);
  if (!start) return null;

  const remainder = config.slice(start.index + start[0].length);
  const nextLocation = remainder.search(/^\s*location(?:\s|=|\^~|~)/m);
  return nextLocation === -1 ? remainder : remainder.slice(0, nextLocation);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function verifyLocalServices() {
  await expectStatus(
    new URL("/healthz", options.staticUrl),
    [200],
    "static container loopback health",
  );
  await expectStatus(
    new URL("/healthz", options.accessUrl),
    [200],
    "access service loopback health",
    { Host: "access" },
  );
  await expectStatus(
    new URL("/internal/session-check", options.accessUrl),
    [401],
    "access service internal session check rejects a missing cookie",
    { Host: "access" },
  );
  await expectStatus(
    new URL("/internal/session-check", options.accessUrl),
    [404],
    "access service hides internal routes behind the public Host",
    { Host: configuredFilmframeHost || options.siteHost },
  );
  await expectStatus(
    new URL("/healthz", options.accessUrl),
    [421],
    "access service rejects an unknown Host",
    { Host: "invalid.example" },
  );
}

async function verifyPublicSite(baseUrl) {
  const siteUrl = new URL(baseUrl);
  check(siteUrl.protocol === "https:", "public FilmFrame probe uses HTTPS");

  const rootUrl = new URL("/", siteUrl);
  const rootResponse = await request(rootUrl);
  if (rootResponse) {
    checkAccessRedirect(rootResponse, rootUrl, "anonymous FilmFrame root");
  }

  const accessResponse = await request(new URL("/access", siteUrl));
  if (accessResponse) {
    check(accessResponse.status === 200, "public invitation page is available");
    check(
      hasNoStore(accessResponse),
      "public invitation page is marked private/no-store",
    );
    const body = await accessResponse.text();
    check(
      !/<script[^>]+src=["'][^"']*\/assets\//i.test(body),
      "invitation page does not preload the Vite application bundle",
    );
  }

  const passkeyClientResponse = await request(
    new URL("/auth/passkeys/client.js", siteUrl),
  );
  if (passkeyClientResponse) {
    check(
      passkeyClientResponse.status === 200,
      "public Passkey client bundle is available",
    );
    check(
      (responseHeader(passkeyClientResponse, "content-type") ?? "").includes(
        "application/javascript",
      ),
      "public Passkey client bundle has a JavaScript content type",
    );
    const body = await passkeyClientResponse.text();
    check(
      body.includes("startAuthentication"),
      "public Passkey client bundle exposes the recovery client",
    );
  }

  await expectStatus(
    new URL("/healthz", siteUrl),
    [404],
    "public health endpoint is hidden",
  );
  await expectStatus(
    new URL("/internal/session-check", siteUrl),
    [404],
    "public session-check endpoint is hidden",
  );

  const assetUrl = new URL(options.assetPath, siteUrl);
  const assetResponse = await request(assetUrl);
  if (assetResponse) {
    checkAccessRedirect(assetResponse, assetUrl, "anonymous real asset request");
    checkCloudflareBypass(assetResponse, "anonymous real asset request");
  }
}

async function verifyPublicAdmin(baseUrl) {
  const adminUrl = new URL(baseUrl);
  check(adminUrl.protocol === "https:", "public admin probe uses HTTPS");

  const response = await request(new URL("/", adminUrl));
  if (response) {
    const location = responseHeader(response, "location") ?? "";
    let accessLocation = null;
    try {
      accessLocation = new URL(location, adminUrl);
    } catch {
      accessLocation = null;
    }
    check(Boolean(accessTeamDomain), "Cloudflare Access team domain is configured");
    check(
      [302, 303].includes(response.status) &&
        accessLocation?.protocol === "https:" &&
        accessLocation.hostname === accessTeamDomain &&
        accessLocation.pathname.startsWith("/cdn-cgi/access/"),
      `anonymous admin request enters Cloudflare Access (HTTP ${response.status})`,
    );
  }
}

async function verifyOrigin(baseUrl, host, label, expectedBoundary) {
  const url = new URL("/", baseUrl);
  check(
    url.protocol === "https:",
    `${label} probe uses HTTPS with the production SNI`,
  );
  if (url.protocol !== "https:") return;

  const response = await requestOrigin(url, host);
  if (response) {
    if (expectedBoundary === "filmframe") {
      checkAccessRedirect(response, url, `${label} anonymous request`);
    } else {
      check(
        [401, 403].includes(response.status),
        `${label} rejects a missing Access JWT (HTTP ${response.status})`,
      );
    }
  }
}

function requestOrigin(url, host) {
  return new Promise((resolve) => {
    const request = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: host,
        headers: { Host: host },
        timeout: 5_000,
      },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode ?? 0, headers: response.headers });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", (error) => {
      fail(`request to ${url.origin}${url.pathname} failed: ${error.message}`);
      resolve(null);
    });
    request.end();
  });
}

async function expectStatus(url, expected, label, headers = {}) {
  const response = await request(url, headers);
  if (response) {
    check(
      expected.includes(response.status),
      `${label} (HTTP ${response.status}, expected ${expected.join("/")})`,
    );
  }
}

async function request(url, headers = {}) {
  if (Object.keys(headers).some((name) => name.toLowerCase() === "host")) {
    return requestWithExplicitHeaders(url, headers);
  }
  try {
    return await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    fail(`request to ${url.origin}${url.pathname} failed: ${error.message}`);
    return null;
  }
}

function requestWithExplicitHeaders(url, headers) {
  return new Promise((resolve) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = transport(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
        timeout: 5_000,
      },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode ?? 0, headers: response.headers });
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("request timed out")));
    outgoing.on("error", (error) => {
      fail(`request to ${url.origin}${url.pathname} failed: ${error.message}`);
      resolve(null);
    });
    outgoing.end();
  });
}

function verifyLoopbackPort(config, serviceName, target) {
  const ports = config.services?.[serviceName]?.ports ?? [];
  const bindings = ports.filter((port) => Number(port.target) === target);
  check(bindings.length > 0, `${serviceName} publishes container port ${target}`);
  if (bindings.length === 0) return;

  check(
    ports.every((binding) =>
      ["127.0.0.1", "::1"].includes(binding.host_ip),
    ),
    `${serviceName} publishes no container port outside loopback`,
  );
}

function verifyPrivateNetwork(config, serviceName) {
  const networks = config.services?.[serviceName]?.networks ?? {};
  check(
    Object.hasOwn(networks, "filmframe_private"),
    `${serviceName} is attached to the private application network`,
  );
}

function hasNoStore(response) {
  const value = responseHeader(response, "cache-control") ?? "";
  return value.includes("no-store") &&
    (value.includes("private") || value.includes("no-cache"));
}

function checkAccessRedirect(response, requestUrl, label) {
  const location = responseHeader(response, "location");
  let isAccessLocation = false;
  if (location) {
    try {
      const resolved = new URL(location, requestUrl);
      isAccessLocation =
        resolved.origin === requestUrl.origin &&
        resolved.pathname === "/access" &&
        resolved.search === "" &&
        resolved.hash === "";
    } catch {
      isAccessLocation = false;
    }
  }

  check(
    response.status === 303 && isAccessLocation,
    `${label} redirects to /access (HTTP ${response.status})`,
  );
}

function checkCloudflareBypass(response, label) {
  const cacheStatus = responseHeader(response, "cf-cache-status")?.toUpperCase();
  check(
    cacheStatus === "BYPASS" || cacheStatus === "DYNAMIC",
    `${label} bypasses Cloudflare cache (CF-Cache-Status: ${cacheStatus ?? "missing"})`,
  );
}

function responseHeader(response, name) {
  if (typeof response.headers?.get === "function") {
    return response.headers.get(name);
  }
  const value = response.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : (value ?? null);
}

function parseArguments(args) {
  const parsed = {
    production: false,
    live: false,
    staticUrl: "http://127.0.0.1:18082",
    accessUrl: "http://127.0.0.1:18083",
    siteHost: "filmframe.astrocean.space",
    adminHost: "filmframe-admin.astrocean.space",
    assetPath: "/film-overlays/kodak-portra-160.png",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--live") {
      parsed.live = true;
      continue;
    }
    if (argument === "--production") {
      parsed.production = true;
      continue;
    }

    const key = {
      "--static-url": "staticUrl",
      "--access-url": "accessUrl",
      "--site-url": "siteUrl",
      "--admin-url": "adminUrl",
      "--origin-url": "originUrl",
      "--admin-origin-url": "adminOriginUrl",
      "--site-host": "siteHost",
      "--admin-host": "adminHost",
      "--asset-path": "assetPath",
      "--openresty-bin": "openrestyBin",
      "--openresty-container": "openrestyContainer",
    }[argument];

    if (!key || index + 1 >= args.length) {
      console.error(`Unknown or incomplete argument: ${argument}`);
      printHelp();
      process.exit(2);
    }

    parsed[key] = args[index + 1];
    index += 1;
  }

  if (!parsed.assetPath.startsWith("/") || parsed.assetPath.startsWith("//")) {
    console.error("--asset-path must be an absolute URL path beginning with /");
    process.exit(2);
  }

  if (parsed.openrestyBin && parsed.openrestyContainer) {
    console.error("--openresty-bin and --openresty-container are mutually exclusive");
    process.exit(2);
  }

  if (
    parsed.openrestyContainer &&
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(parsed.openrestyContainer)
  ) {
    console.error("--openresty-container must be a valid Docker container name");
    process.exit(2);
  }

  if (parsed.production) {
    const required = [
      [parsed.live, "--live"],
      [parsed.siteUrl, "--site-url"],
      [parsed.adminUrl, "--admin-url"],
      [parsed.originUrl, "--origin-url"],
      [parsed.adminOriginUrl, "--admin-origin-url"],
    ];
    const missing = required.filter(([value]) => !value).map(([, flag]) => flag);
    if (!parsed.openrestyBin && !parsed.openrestyContainer) {
      missing.push("--openresty-bin or --openresty-container");
    }
    if (missing.length > 0) {
      console.error(`--production requires: ${missing.join(", ")}`);
      process.exit(2);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-invite-deployment.mjs [options]

Runs secret-free configuration checks by default. Network checks never submit
an invitation code, session cookie, Cloudflare JWT, or administrator identity.

Options:
  --production                   Require every production check; no skips allowed
  --live                         Check loopback container health endpoints
  --static-url URL               Static loopback URL (default: http://127.0.0.1:18082)
  --access-url URL               Access loopback URL (default: http://127.0.0.1:18083)
  --site-url URL                 Check the anonymous public FilmFrame boundary
  --admin-url URL                Check the anonymous public admin boundary
  --origin-url HTTPS_URL         Check direct FilmFrame origin with production SNI
  --admin-origin-url HTTPS_URL   Check direct admin origin with production SNI
  --site-host HOST               Production FilmFrame Host header
  --admin-host HOST              Production admin Host header
  --asset-path PATH              Real deployed asset path to test cache/gating
  --openresty-bin PATH           Active OpenResty/Nginx binary used for -t
  --openresty-container NAME     1Panel container where openresty -t runs
  --help                         Show this help
`);
}

function check(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    fail(message);
  }
}

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function skip(message) {
  skipped += 1;
  console.log(`SKIP: ${message}`);
}

function verifyContainerLimits(config, serviceName) {
  const service = config.services?.[serviceName] ?? {};
  check(Number(service.mem_limit) > 0, `${serviceName} has a memory limit`);
  check(Number(service.cpus) > 0, `${serviceName} has a CPU limit`);
  check(Number(service.pids_limit) > 0, `${serviceName} has a PID limit`);
}

function verifyContainerLogging(config, serviceName) {
  const logging = config.services?.[serviceName]?.logging ?? {};
  const maxFiles = Number(logging.options?.["max-file"]);
  check(
    logging.driver === "json-file" &&
      /^\d+[kmg]$/i.test(logging.options?.["max-size"] ?? "") &&
      maxFiles >= 1 &&
      maxFiles <= 10,
    `${serviceName} rotates bounded json-file logs`,
  );
}

function verifyHealthcheck(config, serviceName) {
  const test = config.services?.[serviceName]?.healthcheck?.test ?? [];
  check(test.length >= 2, `${serviceName} declares a Compose healthcheck`);
}

function isExactPatchImage(value) {
  return (
    typeof value === "string" &&
    /:\d+\.\d+\.\d+(?:[-@]|$)/.test(value) &&
    !/:latest(?:@|$)/.test(value)
  );
}

function isImmutableImageReference(value) {
  return (
    typeof value === "string" &&
    (isLocalImageId(value) || /@sha256:[0-9a-f]{64}$/i.test(value))
  );
}

function isLocalImageId(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/i.test(value);
}

function verifyLocalImage(image, revision, serviceName) {
  const result = spawnSync(
    "docker",
    [
      "image",
      "inspect",
      "--format",
      '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}',
      image,
    ],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    fail(`${serviceName} local image ID is not available to Docker`);
    return;
  }

  const [inspectedId, inspectedRevision] = result.stdout.trim().split(/\s+/, 2);
  check(
    inspectedId?.toLowerCase() === image.toLowerCase(),
    `${serviceName} local image ID resolves exactly`,
  );
  check(
    inspectedRevision === revision,
    `${serviceName} local image records the release revision`,
  );
}
