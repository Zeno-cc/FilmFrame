#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(".");
const composePath = path.resolve("ops/release-candidate/compose.yaml");
const envPath = path.resolve("ops/release-candidate/.env.example");
const vhostPath = path.resolve("ops/release-candidate/filmframe-rc-auth.conf.template");
const expectedRevision = "838e4b0afcf5f35a285553c7e9a0cb8947e6af26";
const [flag] = process.argv.slice(2);
if (flag && flag !== "--docker") {
  console.error("usage: node ops/release-candidate/verify-assets.mjs [--docker]");
  process.exit(2);
}

const [compose, env, vhost] = await Promise.all([
  readFile(composePath, "utf8"),
  readFile(envPath, "utf8"),
  readFile(vhostPath, "utf8"),
]);

assertMatch(env, /^COMPOSE_PROJECT_NAME=filmframe-rc$/m, "fixed Compose project");
assertMatch(env, new RegExp(`^FILMFRAME_REVISION=${expectedRevision}$`, "m"), "fixed candidate revision");
assertMatch(env, /^FILMFRAME_VERSION=1\.3\.0-rc\.1$/m, "RC version");
assertMatch(env, /^FILMFRAME_HOST=filmframe-rc\.astrocean\.space$/m, "RC public host");
assertMatch(env, /^FILMFRAME_PORT=18182$/m, "loopback static port");
assertMatch(env, /^FILMFRAME_ACCESS_PORT=18183$/m, "loopback access port");
assertMatch(env, /^FILMFRAME_ACCESS_VOLUME=filmframe_rc_access_data$/m, "RC database volume");

assertMatch(compose, /name:\s*filmframe-rc\s*$/m, "fixed Compose name");
assertMatch(compose, /127\.0\.0\.1:18182:80/, "static loopback binding");
assertMatch(compose, /127\.0\.0\.1:18183:3000/, "access loopback binding");
assertMatch(compose, /image: filmframe-static:1\.3\.0-rc\.1/, "RC static image");
assertMatch(compose, /image: filmframe-access:1\.3\.0-rc\.1/, "RC access image");
assertMatch(compose, new RegExp(`FILMFRAME_REVISION:\\s*"${expectedRevision}"`), "fixed build revision");
assertMatch(compose, /FILMFRAME_HOST:\s*filmframe-rc\.astrocean\.space/, "fixed RC host");
assertMatch(compose, /name: filmframe_rc_access_data/, "fixed RC volume name");
assertMatch(compose, /filmframe_rc_access_data/, "RC-only volume");
assertMatch(compose, /FILMFRAME_UPDATER_ENABLED:\s*"false"/, "updater disabled");
assertNotContains(compose, [
  "/run/filmframe-updater",
  "/var/run/docker.sock",
  "/opt/filmframe",
  "access-backup:",
  "group_add:",
], "production/updater mounts");

assertMatch(vhost, /server 127\.0\.0\.1:18182;/, "RC static upstream");
assertMatch(vhost, /server 127\.0\.0\.1:18183;/, "RC access upstream");
assertMatch(vhost, /auth_request \/_filmframe_rc_session_check;/g, "protected locations", 3);
assertMatch(vhost, /location = \/api\/runtime-config[\s\S]*?auth_request \/_filmframe_rc_session_check;/, "protected runtime config");
assertMatch(vhost, /location = \/healthz[\s\S]*?return 404;/, "hidden health route");
assertMatch(vhost, /location \^~ \/internal\/[\s\S]*?return 404;/, "hidden internal routes");
assertNotContains(vhost, [
  "filmframe.astrocean.space",
  "filmframe-admin.astrocean.space",
  "127.0.0.1:18082",
  "127.0.0.1:18083",
], "production hosts or ports");
assertMatch(vhost, /__RC_HOST__/g, "rendered host placeholder", 15);
assertMatch(vhost, /__RC_CERTIFICATE__/g, "certificate placeholder", 1);
assertMatch(vhost, /__RC_CERTIFICATE_KEY__/g, "certificate-key placeholder", 1);
assertMatch(vhost, /__RC_REAL_IP_INCLUDE__/g, "Cloudflare real-IP include placeholder", 1);

const secretPattern = /(GOCSPX-|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})/u;
for (const [name, source] of [["compose", compose], ["env", env], ["vhost", vhost]]) {
  if (secretPattern.test(source)) throw new Error(`${name} contains a credential-like value`);
}

if (flag === "--docker") {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", envPath, "-f", composePath, "config", "--quiet"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

console.log("release-candidate assets verified");

function assertMatch(source, pattern, label, expectedCount) {
  const matches = source.match(pattern) ?? [];
  if (matches.length === 0 || (expectedCount !== undefined && matches.length !== expectedCount)) {
    throw new Error(`missing or unexpected ${label}`);
  }
}

function assertNotContains(source, needles, label) {
  const match = needles.find((needle) => source.includes(needle));
  if (match) throw new Error(`${label}: found ${match}`);
}
