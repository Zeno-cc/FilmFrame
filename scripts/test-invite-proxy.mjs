#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const composeFile = path.join(root, "ops/proxy-test/compose.yaml");
const project = `filmframe-proxy-test-${process.pid}`;
const port = 18_000 + (process.pid % 1_000);
const composeArgs = ["compose", "-p", project, "-f", composeFile];
const environment = { ...process.env, FILMFRAME_PROXY_TEST_PORT: String(port) };

function compose(...args) {
  return execFileSync("docker", [...composeArgs, ...args], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function request(pathname, { method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { Host: "filmframe.test", ...headers },
        timeout: 5_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("request timed out")));
    outgoing.on("error", (error) => {
      reject(new Error(`${method} ${pathname}: ${error.message}`, { cause: error }));
    });
    outgoing.end(body);
  });
}

function nonceFrom(html) {
  const match = /name="nonce" value="([^"]+)"/.exec(html);
  assert.ok(match?.[1], "access page must contain a form nonce");
  return match[1];
}

function cookieNamed(response, name) {
  const cookie = response.headers["set-cookie"]?.find((entry) =>
    entry.startsWith(`${name}=`),
  );
  assert.ok(cookie, `response must set ${name}`);
  return cookie.split(";", 1)[0];
}

function assertAccessRedirect(response, label) {
  assert.equal(response.status, 303, label);
  const location = new URL(response.headers.location, "http://filmframe.test");
  assert.equal(location.hostname, "filmframe.test", label);
  assert.equal(location.pathname, "/access", label);
}

async function waitForAccess() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await request("/access");
      if (response.status === 200) return;
    } catch {
      // The container can be between stop/start transitions.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("access service did not recover");
}

async function runBrowserWorkflow(cookie) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const [cookieName, cookieValue] = cookie.split("=", 2);
  assert.ok(cookieName && cookieValue, "browser test requires a valid session cookie");

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies([{ name: cookieName, value: cookieValue, url: baseUrl }]);
    const page = await context.newPage();
    const requests = [];
    let workerStarted = false;
    page.on("worker", () => {
      workerStarted = true;
    });
    page.on("request", (outgoing) => {
      const url = new URL(outgoing.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      requests.push({
        method: outgoing.method(),
        origin: url.origin,
        pathname: url.pathname,
        bodyBytes: outgoing.postDataBuffer()?.byteLength ?? 0,
      });
    });

    await page.goto("/", { waitUntil: "load" });
    await page.getByRole("heading", { name: "让这一卷，慢慢显影" }).waitFor();
    await page
      .getByRole("complementary", { name: "暗房配方" })
      .getByLabel("胶片型号")
      .selectOption("KODAK PORTRA 160");
    await page.locator('input[type="file"]').setInputFiles(
      path.join(root, "public/film-overlays/aperture-mask-derived.png"),
    );
    await page.getByRole("button", { name: /冲洗待更新照片/ }).click();
    await page.getByRole("img", { name: "已出片" }).waitFor({ timeout: 30_000 });
    assert.equal(workerStarted, true, "the protected browser workflow must use the film Worker");

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "打包下载 ZIP (1)" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^filmframe_.*\.zip$/);
    const downloadPath = await download.path();
    assert.ok(downloadPath, "the protected browser workflow must produce a ZIP file");
    assert.ok((await stat(downloadPath)).size > 22, "the exported ZIP must not be empty");

    const external = requests.filter((entry) => entry.origin !== baseUrl);
    assert.deepEqual(external, [], "the browser workflow must not contact third-party origins");
    const writes = requests.filter((entry) => entry.method !== "GET");
    assert.ok(
      writes.some(
        (entry) =>
          entry.method === "POST" &&
          entry.pathname === "/auth/refresh" &&
          entry.bodyBytes === 0,
      ),
      "the only expected access write is the bodyless session refresh",
    );
    assert.deepEqual(
      writes.filter(
        (entry) =>
          entry.pathname !== "/auth/refresh" || entry.bodyBytes !== 0,
      ),
      [],
      "photo bytes must never be sent to the access service",
    );
    await context.close();
  } finally {
    await browser.close();
  }
}

let started = false;
let stage = "startup";
try {
  started = true;
  const up = spawnSync(
    "docker",
    [...composeArgs, "up", "-d", "--build", "--wait"],
    { cwd: root, env: environment, encoding: "utf8", stdio: "inherit" },
  );
  assert.equal(up.status, 0, "proxy test stack must start");
  await waitForAccess();

  stage = "anonymous resource gating";
  for (const pathname of [
    "/",
    "/api/runtime-config",
    "/film-overlays/kodak-portra-160.png",
    "/film-sprocket-masks/kodak-portra-160.png",
  ]) {
    const anonymous = await request(pathname);
    assertAccessRedirect(anonymous, `${pathname} must require access`);
  }

  stage = "built asset gating";
  const builtFiles = compose(
    "exec",
    "-T",
    "filmframe",
    "find",
    "/usr/share/nginx/html/assets",
    "-maxdepth",
    "1",
    "-type",
    "f",
  )
    .trim()
    .split("\n")
    .filter((entry) => /\.(?:js|css)$/.test(entry))
    .slice(0, 4)
    .map((entry) => entry.replace("/usr/share/nginx/html", ""));
  assert.ok(builtFiles.some((entry) => entry.endsWith(".js")));
  for (const pathname of builtFiles) {
    assertAccessRedirect(await request(pathname), `${pathname} must require access`);
  }

  stage = "invite redemption";
  const created = JSON.parse(
    compose(
      "exec",
      "-T",
      "access",
      "node",
      "dist/src/cli.js",
      "create",
      "--label",
      "proxy test",
    ),
  );
  const accessPage = await request("/access");
  const form = new URLSearchParams({ code: created.code, nonce: nonceFrom(accessPage.body) });
  const redeemed = await request("/auth/redeem", {
    method: "POST",
    headers: {
      Cookie: cookieNamed(accessPage, "filmframe_redeem"),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(form.toString())),
    },
    body: form.toString(),
  });
  assert.equal(redeemed.status, 303);
  const cookie = cookieNamed(redeemed, "filmframe_session_dev");

  const authorized = await request("/", { headers: { Cookie: cookie } });
  assert.equal(authorized.status, 200);
  assert.match(authorized.body, /<div id="root"><\/div>/);

  const runtimeConfig = await request("/api/runtime-config", {
    headers: { Cookie: cookie },
  });
  assert.equal(runtimeConfig.status, 200);
  assert.deepEqual(JSON.parse(runtimeConfig.body), {
    maxCanvasMiB: 700,
    maxCanvasBytes: 700 * 1024 * 1024,
    updatedAt: 0,
  });

  const cookieProbe = await request("/__proxy_test/static-cookie", {
    headers: { Cookie: cookie },
  });
  assert.equal(cookieProbe.status, 200);
  assert.equal(cookieProbe.body, "", "static upstream must not receive the session cookie");

  stage = "session refresh";
  const refresh = await request("/auth/refresh", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://filmframe.test",
      "X-FilmFrame-CSRF": "1",
      "Content-Length": "0",
    },
  });
  assert.equal(refresh.status, 204);
  const rotatedSetCookie = refresh.headers["set-cookie"]?.[0];
  assert.ok(rotatedSetCookie?.startsWith("filmframe_session_dev="));
  const rotatedCookie = rotatedSetCookie.split(";", 1)[0];
  assert.notEqual(rotatedCookie, cookie, "refresh must rotate the bearer token");
  assert.equal(
    (await request("/", { headers: { Cookie: cookie } })).status,
    303,
    "the old cookie must be rejected immediately after refresh",
  );
  assert.equal(
    (await request("/", { headers: { Cookie: rotatedCookie } })).status,
    200,
    "the rotated cookie must remain authorized",
  );

  stage = "single-use invite enforcement";
  const secondPage = await request("/access");
  const repeatedForm = new URLSearchParams({
    code: created.code,
    nonce: nonceFrom(secondPage.body),
  });
  assert.equal(
    (
      await request("/auth/redeem", {
        method: "POST",
        headers: {
          Cookie: cookieNamed(secondPage, "filmframe_redeem"),
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": String(Buffer.byteLength(repeatedForm.toString())),
        },
        body: repeatedForm.toString(),
      })
    ).status,
    400,
  );

  stage = "trusted proxy IP handling";
  const directIp = await request("/__proxy_test/ip", {
    headers: { "CF-Connecting-IP": "203.0.113.20" },
  });
  assert.notEqual(directIp.body.trim(), "203.0.113.20", "direct clients cannot spoof IP");
  const trustedIp = compose(
    "exec",
    "-T",
    "proxy-client",
    "node",
    "-e",
    "fetch('http://proxy-trusted/__proxy_test/ip',{headers:{Host:'filmframe.test','CF-Connecting-IP':'203.0.113.20'}}).then(r=>r.text()).then(v=>process.stdout.write(v))",
  );
  assert.equal(trustedIp.trim(), "203.0.113.20");

  stage = "trusted client rate limiting";
  const rateLimitStatuses = JSON.parse(
    compose(
      "exec",
      "-T",
      "proxy-client",
      "node",
      "-e",
      `const send=async(ip,count)=>{const statuses=[];for(let i=0;i<count;i+=1){const response=await fetch('http://proxy-trusted/auth/redeem',{method:'POST',headers:{Host:'filmframe.test','CF-Connecting-IP':ip}});statuses.push(response.status)}return statuses};Promise.all([send('203.0.113.30',11),send('203.0.113.31',1)]).then(([limited,separate])=>process.stdout.write(JSON.stringify({limited,separate})))`,
    ),
  );
  assert.deepEqual(rateLimitStatuses.limited.slice(0, 10), Array(10).fill(415));
  assert.equal(rateLimitStatuses.limited[10], 429);
  assert.deepEqual(
    rateLimitStatuses.separate,
    [415],
    "a different trusted client IP must receive an independent rate-limit window",
  );

  stage = "single-session revocation";
  const sessions = JSON.parse(
    compose("exec", "-T", "access", "node", "dist/src/cli.js", "sessions", "list"),
  );
  const activeSession = sessions.find(
    (session) => session.inviteId === created.id && session.status === "active",
  );
  assert.ok(activeSession?.id, "the rotated session must be listed by public ID");
  compose(
    "exec",
    "-T",
    "access",
    "node",
    "dist/src/cli.js",
    "sessions",
    "revoke",
    activeSession.id,
  );
  assert.equal(
    (await request("/", { headers: { Cookie: rotatedCookie } })).status,
    303,
    "single-session revocation must invalidate that device",
  );

  stage = "invite cascade revocation";
  const cascadeInvite = JSON.parse(
    compose(
      "exec",
      "-T",
      "access",
      "node",
      "dist/src/cli.js",
      "create",
      "--label",
      "proxy cascade test",
    ),
  );
  const cascadePage = await request("/access");
  const cascadeForm = new URLSearchParams({
    code: cascadeInvite.code,
    nonce: nonceFrom(cascadePage.body),
  });
  const cascadeRedeem = await request("/auth/redeem", {
    method: "POST",
    headers: {
      Cookie: cookieNamed(cascadePage, "filmframe_redeem"),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(cascadeForm.toString())),
    },
    body: cascadeForm.toString(),
  });
  assert.equal(cascadeRedeem.status, 303);
  const cascadeCookie = cookieNamed(cascadeRedeem, "filmframe_session_dev");
  assert.equal((await request("/", { headers: { Cookie: cascadeCookie } })).status, 200);
  compose(
    "exec",
    "-T",
    "access",
    "node",
    "dist/src/cli.js",
    "revoke",
    cascadeInvite.id,
  );
  assert.equal(
    (await request("/", { headers: { Cookie: cascadeCookie } })).status,
    303,
    "invite revocation must cascade to its sessions",
  );

  const outageInvite = JSON.parse(
    compose(
      "exec",
      "-T",
      "access",
      "node",
      "dist/src/cli.js",
      "create",
      "--label",
      "proxy outage test",
    ),
  );
  const outagePage = await request("/access");
  const outageForm = new URLSearchParams({
    code: outageInvite.code,
    nonce: nonceFrom(outagePage.body),
  });
  const outageRedeem = await request("/auth/redeem", {
    method: "POST",
    headers: {
      Cookie: cookieNamed(outagePage, "filmframe_redeem"),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(outageForm.toString())),
    },
    body: outageForm.toString(),
  });
  assert.equal(outageRedeem.status, 303);
  const outageCookie = cookieNamed(outageRedeem, "filmframe_session_dev");
  assert.equal((await request("/", { headers: { Cookie: outageCookie } })).status, 200);

  stage = "authentication outage";
  const accessContainerId = compose("ps", "-q", "access").trim();
  assert.ok(accessContainerId, "access container must be discoverable");
  execFileSync("docker", ["pause", accessContainerId], { stdio: "ignore" });
  assert.equal((await request("/", { headers: { Cookie: outageCookie } })).status, 503);
  execFileSync("docker", ["unpause", accessContainerId], { stdio: "ignore" });
  await waitForAccess();
  assert.equal(
    (await request("/", { headers: { Cookie: outageCookie } })).status,
    200,
    "the same valid session must work after the access service recovers",
  );

  stage = "protected browser workflow";
  await runBrowserWorkflow(outageCookie);

  console.log("real auth_request proxy tests passed");
} catch (error) {
  throw new Error(`proxy test failed during ${stage}`, { cause: error });
} finally {
  if (started) {
    spawnSync("docker", [...composeArgs, "down", "--volumes", "--remove-orphans"], {
      cwd: root,
      env: environment,
      stdio: "inherit",
    });
  }
}
