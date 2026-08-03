import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import request from "supertest";

import type { AccessJwtVerifier } from "../src/accessJwt.js";
import { createApp } from "../src/app.js";
import { loadConfig, type AccessConfig } from "../src/config.js";
import { GENERIC_INVITE_ERROR, SESSION_TTL_MS } from "../src/constants.js";
import { openDatabase, type AccessDatabase } from "../src/db.js";
import {
  createInvite,
  isSessionValid,
  listSessions,
  redeemInvite,
  revokeInvite,
} from "../src/store.js";
import { testConfig } from "./helpers.js";
import {
  UpdaterClientError,
  type SystemUpdate,
  type UpdateHistory,
  type UpdateJob,
  type UpdaterClient,
} from "../src/updaterClient.js";

const databases: AccessDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function fixture(
  now = 1_000_000,
  configOverrides: Partial<AccessConfig> = {},
  updaterClient: UpdaterClient | null = null,
) {
  const config = testConfig(configOverrides);
  const database = openDatabase(":memory:");
  databases.push(database);
  const verifier: AccessJwtVerifier = async (token) => {
    if (token !== "valid-access-token") throw new Error("unauthorized");
    return { subject: "admin", email: config.adminEmail };
  };
  const app = createApp({
    config,
    database,
    accessJwtVerifier: verifier,
    updaterClient,
    now: () => now,
  });
  return { app, config, database, now };
}

const updateNow = "2026-08-02T04:03:06Z";
const updateRevision = "a".repeat(40);

function updateJob(overrides: Partial<UpdateJob> = {}): UpdateJob {
  return {
    id: "fa3b6d3e-fcec-4935-bfc3-1ba973267c08",
    targetVersion: "1.1.0",
    targetRevision: updateRevision,
    state: "queued",
    previousVersion: "1.0.0",
    previousRevision: "b".repeat(40),
    createdAt: updateNow,
    updatedAt: updateNow,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    retryOf: null,
    ...overrides,
  };
}

function systemUpdate(activeJob: UpdateJob | null = null): SystemUpdate {
  return {
    current: {
      version: "1.0.0",
      revision: "b".repeat(40),
      healthy: true,
      schemaVersion: 3,
    },
    candidate: {
      version: "1.1.0",
      revision: updateRevision,
      publishedAt: updateNow,
      summaryZh: [{ kind: "feature", text: "新增安全可靠的一键版本更新功能" }],
      database: {
        schemaFrom: 3,
        schemaTo: 4,
        rollbackFloor: "1.0.0",
        backwardCompatible: true,
      },
      installable: true,
      releaseUrl: "https://github.com/Zeno-cc/FilmFrame/releases/tag/v1.1.0",
    },
    activeJob,
    checkedAt: updateNow,
    updaterVersion: "1.0.0",
  };
}

class FakeUpdaterClient implements UpdaterClient {
  readonly calls: Array<{ action: string; input?: unknown }> = [];
  status = systemUpdate();
  activeJob: UpdateJob | null = null;
  history: UpdateHistory = { jobs: [] };
  error: UpdaterClientError | null = null;

  private maybeFail(): void {
    if (this.error) throw this.error;
  }

  async check(force = false): Promise<SystemUpdate> {
    this.calls.push({ action: "check", input: { force } });
    this.maybeFail();
    return { ...this.status, activeJob: this.activeJob };
  }

  async createJob(input: {
    version: string;
    idempotencyKey: string;
    actorHash: string;
  }): Promise<UpdateJob> {
    this.calls.push({ action: "create_job", input });
    this.maybeFail();
    this.activeJob ??= updateJob();
    return this.activeJob;
  }

  async getJob(jobId: string): Promise<UpdateJob> {
    this.calls.push({ action: "get_job", input: { jobId } });
    this.maybeFail();
    return updateJob({ id: jobId });
  }

  async getActiveJob(): Promise<UpdateJob | null> {
    this.calls.push({ action: "get_active_job" });
    this.maybeFail();
    return this.activeJob;
  }

  async listHistory(limit?: number): Promise<UpdateHistory> {
    this.calls.push({ action: "list_history", input: { limit } });
    this.maybeFail();
    return this.history;
  }
}

function formNonce(html: string): string {
  const match = /name="nonce" value="([^"]+)"/.exec(html);
  assert.ok(match?.[1]);
  return match[1];
}

function firstSetCookie(headers: Record<string, unknown>): string {
  const value = headers["set-cookie"];
  assert.ok(Array.isArray(value));
  assert.equal(typeof value[0], "string");
  return value[0] as string;
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0] as string;
}

function cookieToken(setCookie: string): string {
  const pair = cookiePair(setCookie);
  return pair.slice(pair.indexOf("=") + 1);
}

describe("public invitation gateway", () => {
  it("serves only the server-rendered gate before authentication", async () => {
    const { app, config } = fixture();
    const response = await request(app).get("/access").set("Host", config.filmframeHost);

    assert.equal(response.status, 200);
    assert.match(response.text, /进入暗房/);
    assert.match(response.text, /width:min\(calc\(100% - 32px\),960px\)/);
    assert.doesNotMatch(response.text, /<script[^>]+src=/);
    assert.match(response.headers["cache-control"], /private, no-store/);
    assert.match(response.headers["content-security-policy"], /default-src 'none'/);
    assert.doesNotMatch(response.text, /版本与更新|system-update/);
  });

  it("sets the hardened host-only session cookie only after successful redemption", async () => {
    const { app, config, database, now } = fixture();
    const created = createInvite(database, "HTTP 兑换", now);
    const access = await request(app).get("/access").set("Host", config.filmframeHost);
    const response = await request(app)
      .post("/auth/redeem")
      .set("Host", config.filmframeHost)
      .type("form")
      .send({ code: created.code, nonce: formNonce(access.text) });

    assert.equal(response.status, 303);
    assert.equal(response.headers.location, "/");
    const cookie = firstSetCookie(response.headers);
    assert.match(cookie, /^__Host-filmframe_session=/);
    assert.match(cookie, /Max-Age=34560000/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);

    const check = await request(app)
      .get("/internal/session-check")
      .set("Host", "access")
      .set("Cookie", cookiePair(cookie));
    assert.equal(check.status, 204);
  });

  it("uses one generic failure and never sets a cookie for invalid codes", async () => {
    const { app, config } = fixture();
    const access = await request(app).get("/access").set("Host", config.filmframeHost);
    const response = await request(app)
      .post("/auth/redeem")
      .set("Host", config.filmframeHost)
      .type("form")
      .send({ code: "not-an-invite", nonce: formNonce(access.text) });

    assert.equal(response.status, 400);
    assert.match(response.text, new RegExp(GENERIC_INVITE_ERROR));
    assert.equal(response.headers["set-cookie"], undefined);
  });

  it("rejects oversized redemption bodies without setting a cookie", async () => {
    const { app, config } = fixture();
    const access = await request(app).get("/access").set("Host", config.filmframeHost);
    const response = await request(app)
      .post("/auth/redeem")
      .set("Host", config.filmframeHost)
      .type("form")
      .send({ code: "A".repeat(5_000), nonce: formNonce(access.text) });

    assert.equal(response.status, 413);
    assert.equal(response.headers["set-cookie"], undefined);
  });

  it("allows exactly one of 20 concurrent requests to redeem a code", async () => {
    const { app, config, database, now } = fixture();
    const created = createInvite(database, "并发兑换", now);
    const pages = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).get("/access").set("Host", config.filmframeHost),
      ),
    );
    const responses = await Promise.all(
      pages.map((page) =>
        request(app)
          .post("/auth/redeem")
          .set("Host", config.filmframeHost)
          .type("form")
          .send({ code: created.code, nonce: formNonce(page.text) }),
      ),
    );

    assert.equal(responses.filter((response) => response.status === 303).length, 1);
    assert.deepEqual(
      database.prepare("SELECT redemption_count FROM invites").get(),
      { redemption_count: 1 },
    );
    assert.deepEqual(
      database.prepare("SELECT count(*) AS count FROM sessions").get(),
      { count: 1 },
    );
  });

  it("requires exact Origin and CSRF header to refresh a session", async () => {
    const { app, config, database, now } = fixture();
    const created = createInvite(database, "续期", now);
    const session = redeemInvite(database, created.code, now);
    const cookie = `${config.sessionCookieName}=${session.token}`;

    const missing = await request(app)
      .post("/auth/refresh")
      .set("Host", config.filmframeHost)
      .set("Cookie", cookie);
    const wrongOrigin = await request(app)
      .post("/auth/refresh")
      .set("Host", config.filmframeHost)
      .set("Origin", "https://attacker.example.test")
      .set("X-FilmFrame-CSRF", "1")
      .set("Cookie", cookie);
    const wrongCsrf = await request(app)
      .post("/auth/refresh")
      .set("Host", config.filmframeHost)
      .set("Origin", config.publicOrigin)
      .set("X-FilmFrame-CSRF", "wrong")
      .set("Cookie", cookie);
    assert.equal(missing.status, 403);
    assert.equal(wrongOrigin.status, 403);
    assert.equal(wrongCsrf.status, 403);

    const response = await request(app)
      .post("/auth/refresh")
      .set("Host", config.filmframeHost)
      .set("Origin", config.publicOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .set("Cookie", cookie);
    assert.equal(response.status, 204);
    const renewedCookie = firstSetCookie(response.headers);
    const renewedToken = cookieToken(renewedCookie);
    assert.notEqual(renewedToken, session.token);
    assert.match(renewedCookie, /Max-Age=34560000/);

    const oldCheck = await request(app)
      .get("/internal/session-check")
      .set("Host", "access")
      .set("Cookie", cookie);
    const renewedCheck = await request(app)
      .get("/internal/session-check")
      .set("Host", "access")
      .set("Cookie", `${config.sessionCookieName}=${renewedToken}`);
    assert.equal(oldCheck.status, 401);
    assert.equal(renewedCheck.status, 204);
  });

  it("lets one concurrent refresh rotate the cookie without clearing the winner", async () => {
    const { app, config, database, now } = fixture();
    const created = createInvite(database, "多标签页", now);
    const session = redeemInvite(database, created.code, now);
    const cookie = `${config.sessionCookieName}=${session.token}`;
    const refresh = () =>
      request(app)
        .post("/auth/refresh")
        .set("Host", config.filmframeHost)
        .set("Origin", config.publicOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Cookie", cookie);

    const responses = await Promise.all([refresh(), refresh()]);
    const winner = responses.find((response) => response.status === 204);
    const loser = responses.find((response) => response.status === 401);
    assert.ok(winner);
    assert.ok(loser);
    assert.equal(loser.headers["set-cookie"], undefined);

    const rotatedToken = cookieToken(firstSetCookie(winner.headers));
    const check = await request(app)
      .get("/internal/session-check")
      .set("Host", "access")
      .set("Cookie", `${config.sessionCookieName}=${rotatedToken}`);
    assert.equal(check.status, 204);
  });

  it("rejects expired, revoked, and tampered sessions during refresh", async () => {
    const { app, config, database, now } = fixture();
    const refresh = (cookie: string) =>
      request(app)
        .post("/auth/refresh")
        .set("Host", config.filmframeHost)
        .set("Origin", config.publicOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Cookie", cookie);

    const expiredInvite = createInvite(database, "过期会话", now - SESSION_TTL_MS - 1);
    const expired = redeemInvite(
      database,
      expiredInvite.code,
      now - SESSION_TTL_MS,
    );
    const revokedInvite = createInvite(database, "撤销会话", now);
    const revoked = redeemInvite(database, revokedInvite.code, now);
    revokeInvite(database, revokedInvite.invite.id, now);
    const tampered = `${revoked.token.slice(0, -1)}${revoked.token.endsWith("A") ? "B" : "A"}`;

    for (const token of [expired.token, revoked.token, tampered]) {
      const response = await refresh(`${config.sessionCookieName}=${token}`);
      assert.equal(response.status, 401);
      assert.equal(response.headers["set-cookie"], undefined);
    }
  });

  it("does not expose a public logout route", async () => {
    const { app, config } = fixture();
    const response = await request(app)
      .post("/auth/logout")
      .set("Host", config.filmframeHost)
      .set("Origin", config.publicOrigin)
      .set("X-FilmFrame-CSRF", "1");
    assert.equal(response.status, 404);
  });

  it("rejects unknown hosts and public access to internal endpoints", async () => {
    const { app, config } = fixture();
    assert.equal((await request(app).get("/access").set("Host", "attacker.test")).status, 421);
    assert.equal(
      (await request(app).get("/healthz").set("Host", config.filmframeHost)).status,
      404,
    );
  });

  it("proves database writes in health checks without leaving probe rows", async () => {
    const { app, database } = fixture(1_000_000, { nodeEnv: "production" });
    const healthy = await request(app).get("/healthz").set("Host", "access");
    assert.equal(healthy.status, 200);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM health_checks").get(), {
      count: 0,
    });

    database.exec(`
      CREATE TRIGGER block_health_writes
      BEFORE INSERT ON health_checks
      BEGIN
        SELECT RAISE(FAIL, 'blocked');
      END
    `);
    const messages: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => messages.push(String(message));
    let unhealthy;
    try {
      unhealthy = await request(app).get("/healthz").set("Host", "access");
    } finally {
      console.error = originalError;
    }
    assert.equal(unhealthy.status, 503);
    assert.equal(unhealthy.text, "Service Unavailable");
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM health_checks").get(), {
      count: 0,
    });
    assert.equal(messages.length, 1);
    const log = JSON.parse(messages[0] as string) as Record<string, unknown>;
    assert.equal(log.operation, "database_health");
    assert.equal(log.category, "database");
    assert.equal("message" in log, false);
    assert.equal(unhealthy.headers["x-request-id"], log.requestId);
  });

  it("returns a redacted 500 and request category for unexpected redemption errors", async () => {
    const config = testConfig({ nodeEnv: "production" });
    const database = openDatabase(":memory:");
    const created = createInvite(database, "数据库异常", 1_000_000);
    const app = createApp({
      config,
      database,
      accessJwtVerifier: async () => ({ subject: "admin", email: config.adminEmail }),
      now: () => 1_000_000,
    });
    const access = await request(app).get("/access").set("Host", config.filmframeHost);
    database.close();

    const messages: string[] = [];
    let responseRequestId: string | undefined;
    const originalError = console.error;
    console.error = (message?: unknown) => messages.push(String(message));
    try {
      const response = await request(app)
        .post("/auth/redeem")
        .set("Host", config.filmframeHost)
        .type("form")
        .send({ code: created.code, nonce: formNonce(access.text) });
      assert.equal(response.status, 500);
      assert.equal(response.text, "Internal Server Error");
      assert.equal(response.headers["set-cookie"], undefined);
      responseRequestId = response.headers["x-request-id"];
    } finally {
      console.error = originalError;
    }

    assert.equal(messages.length, 1);
    const log = JSON.parse(messages[0] as string) as Record<string, unknown>;
    assert.equal(log.event, "request_error");
    assert.equal(log.operation, "invite_redeem");
    assert.equal(log.category, "internal");
    assert.equal(typeof log.requestId, "string");
    assert.equal(responseRequestId, log.requestId);
    assert.equal(JSON.stringify(log).includes(created.code), false);
  });
});

describe("administrator routes", () => {
  function batchRequest(
    app: ReturnType<typeof createApp>,
    config: AccessConfig,
    body: unknown,
    key = randomUUID(),
  ) {
    return request(app)
      .post("/api/invite-batches")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token")
      .set("Origin", config.adminOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .set("Idempotency-Key", key)
      .send(body);
  }

  it("requires a verified Access assertion for the page and APIs", async () => {
    const { app, config } = fixture();
    const missing = await request(app).get("/").set("Host", config.adminHost);
    const invalid = await request(app)
      .get("/")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "invalid");
    const valid = await request(app)
      .get("/")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");

    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(valid.status, 200);
    assert.match(valid.text, /暗房邀请管理/);
  });

  it("allows the local admin token only in development", async () => {
    const token = "local-admin-token-with-at-least-32-bytes";
    const config = testConfig();
    const database = openDatabase(":memory:");
    databases.push(database);
    const developmentApp = createApp({
      config: {
        ...config,
        nodeEnv: "development",
        devAdminToken: token,
      },
      database,
      accessJwtVerifier: async () => {
        throw new Error("Access JWT should not be used");
      },
    });

    const missing = await request(developmentApp)
      .get("/")
      .set("Host", config.adminHost);
    const invalid = await request(developmentApp)
      .get("/")
      .set("Host", config.adminHost)
      .set("X-FilmFrame-Dev-Admin", `${token}-wrong`);
    const valid = await request(developmentApp)
      .get("/")
      .set("Host", config.adminHost)
      .set("X-FilmFrame-Dev-Admin", token);

    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(valid.status, 200);
    assert.match(valid.text, /暗房邀请管理/);
  });

  it("rejects development admin tokens in production configuration", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          FILMFRAME_HOST: "filmframe.example.test",
          ADMIN_HOST: "filmframe-admin.example.test",
          CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
          CF_ACCESS_AUDIENCE: "production-access-audience",
          CF_ACCESS_ADMIN_EMAIL: "admin@example.test",
          DEV_ADMIN_TOKEN: "local-admin-token-with-at-least-32-bytes",
        }),
      /DEV_ADMIN_TOKEN cannot be enabled in production/,
    );
  });

  it("pins the enabled production updater to the fixed Unix socket", () => {
    const environment = {
      NODE_ENV: "production",
      FILMFRAME_HOST: "filmframe.example.test",
      ADMIN_HOST: "filmframe-admin.example.test",
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUDIENCE: "production-access-audience",
      CF_ACCESS_ADMIN_EMAIL: "admin@example.test",
      FILMFRAME_UPDATER_ENABLED: "true",
    };
    const config = loadConfig(environment);
    assert.equal(config.updaterEnabled, true);
    assert.equal(config.updaterSocketPath, "/run/filmframe-updater/updater.sock");
    assert.throws(
      () =>
        loadConfig({
          ...environment,
          FILMFRAME_UPDATER_SOCKET: "/tmp/untrusted.sock",
        }),
      /must use the production socket path/,
    );
  });

  it("enforces JSON, exact Origin, and custom CSRF header on writes", async () => {
    const { app, config } = fixture();
    const base = () =>
      request(app)
        .post("/api/invites")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token");

    assert.equal((await base().send({ label: "访客" })).status, 403);
    assert.equal(
      (
        await base()
          .set("Origin", config.adminOrigin)
          .set("X-FilmFrame-CSRF", "1")
          .type("form")
          .send({ label: "访客" })
      ).status,
      415,
    );
  });

  it("returns plaintext once and never serializes stored hashes", async () => {
    const { app, config } = fixture();
    const idempotencyKey = randomUUID();
    const response = await request(app)
      .post("/api/invites")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token")
      .set("Origin", config.adminOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .set("Idempotency-Key", idempotencyKey)
      .send({ label: "移动端访客" });

    assert.equal(response.status, 201);
    assert.match(response.body.code, /^FF1-/);
    assert.equal(response.body.replayed, false);
    assert.equal("codeHash" in response.body.invite, false);

    const replay = await request(app)
      .post("/api/invites")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token")
      .set("Origin", config.adminOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .set("Idempotency-Key", idempotencyKey)
      .send({ label: "移动端访客" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.invite.id, response.body.invite.id);
    assert.equal("code" in replay.body, false);

    const list = await request(app)
      .get("/api/invites")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    assert.equal(list.status, 200);
    assert.equal(list.body.invites.length, 1);
    assert.equal(JSON.stringify(list.body).includes(response.body.code), false);
    assert.equal(JSON.stringify(list.body).includes("codeHash"), false);
  });

  it("requires a UUID idempotency key before creating an invite", async () => {
    const { app, config, database } = fixture();
    const create = (key?: string) => {
      const pending = request(app)
        .post("/api/invites")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token")
        .set("Origin", config.adminOrigin)
        .set("X-FilmFrame-CSRF", "1");
      if (key) pending.set("Idempotency-Key", key);
      return pending.send({ label: "幂等校验" });
    };

    assert.equal((await create()).status, 400);
    assert.equal((await create("not-a-uuid")).status, 400);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 0,
    });
  });

  it("creates one invite for concurrent requests sharing an idempotency key", async () => {
    const { app, config, database } = fixture();
    const idempotencyKey = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post("/api/invites")
          .set("Host", config.adminHost)
          .set("Cf-Access-Jwt-Assertion", "valid-access-token")
          .set("Origin", config.adminOrigin)
          .set("X-FilmFrame-CSRF", "1")
          .set("Idempotency-Key", idempotencyKey)
          .send({ label: "并发创建" }),
      ),
    );

    assert.equal(responses.filter((response) => response.status === 201).length, 1);
    assert.equal(responses.filter((response) => response.status === 200).length, 19);
    assert.equal(responses.filter((response) => typeof response.body.code === "string").length, 1);
    assert.equal(new Set(responses.map((response) => response.body.invite.id)).size, 1);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 1,
    });
  });

  it("creates batches at both boundaries and never exposes plaintext on replay or lists", async () => {
    const { app, config, database } = fixture();
    const one = await batchRequest(app, config, { name: "单个批次", count: 1 });
    assert.equal(one.status, 201);
    assert.equal(one.body.codes.length, 1);
    const key = randomUUID();
    const fifty = await batchRequest(app, config, { name: "大型批次", count: 50 }, key);
    assert.equal(fifty.status, 201);
    assert.equal(fifty.body.codes.length, 50);
    assert.equal(
      new Set(fifty.body.codes.map((entry: { code: string }) => entry.code)).size,
      50,
    );
    const plaintext = fifty.body.codes[0].code as string;
    const replay = await batchRequest(app, config, { name: "大型批次", count: 50 }, key);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal("codes" in replay.body, false);
    assert.equal(JSON.stringify(replay.body).includes(plaintext), false);

    const batches = await request(app)
      .get("/api/invite-batches")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    const invites = await request(app)
      .get("/api/invites")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    assert.equal(batches.body.batches.length, 2);
    assert.equal(invites.body.invites.length, 51);
    assert.equal(JSON.stringify({ batches: batches.body, invites: invites.body }).includes(plaintext), false);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invite_batches").get(), {
      count: 2,
    });
  });

  it("rejects invalid batch payloads with zero writes", async () => {
    for (const body of [
      { name: "非法", count: 0 },
      { name: "非法", count: -1 },
      { name: "非法", count: 1.5 },
      { name: "非法", count: 51 },
      { name: "非法", count: 1, unknown: true },
      { name: "x".repeat(65), count: 1 },
    ]) {
      const { app, config, database } = fixture();
      const response = await batchRequest(app, config, body);
      assert.equal(response.status, 400);
      assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
        count: 0,
      });
      assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invite_batches").get(), {
        count: 0,
      });
    }
  });

  it("rolls back every batch table when an API insert fails", async () => {
    const { app, config, database } = fixture();
    database.exec(`
      CREATE TRIGGER fail_api_batch_insert
      BEFORE INSERT ON invites
      WHEN NEW.batch_position = 2
      BEGIN
        SELECT RAISE(FAIL, 'injected');
      END
    `);
    const response = await batchRequest(app, config, {
      name: "接口回滚",
      count: 3,
    });
    assert.equal(response.status, 500);
    for (const table of [
      "invite_batches",
      "invites",
      "invite_batch_creation_requests",
    ]) {
      assert.deepEqual(database.prepare(`SELECT count(*) AS count FROM ${table}`).get(), {
        count: 0,
      });
    }
  });

  it("creates one batch for concurrent retries and rejects key payload conflicts", async () => {
    const { app, config, database } = fixture();
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        batchRequest(app, config, { name: "并发批次", count: 3 }, key),
      ),
    );
    assert.equal(responses.filter(({ status }) => status === 201).length, 1);
    assert.equal(responses.filter(({ status }) => status === 200).length, 19);
    assert.equal(responses.filter(({ body }) => Array.isArray(body.codes)).length, 1);
    assert.equal(new Set(responses.map(({ body }) => body.batch.id)).size, 1);
    const conflict = await batchRequest(
      app,
      config,
      { name: "不同批次", count: 3 },
      key,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "idempotency_conflict");
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 3,
    });
  });

  it("limits batch creation by generated code count", async () => {
    const { app, config, database } = fixture();
    assert.equal(
      (await batchRequest(app, config, { name: "额度一", count: 50 })).status,
      201,
    );
    assert.equal(
      (await batchRequest(app, config, { name: "额度二", count: 50 })).status,
      201,
    );
    const limited = await batchRequest(app, config, { name: "超出额度", count: 1 });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "60");
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 100,
    });
  });

  it("charges invalid retries while always allowing an existing batch replay", async () => {
    const { app, config, database } = fixture();
    const key = randomUUID();
    assert.equal(
      (await batchRequest(app, config, { name: "原始批次", count: 50 }, key)).status,
      201,
    );
    assert.equal(
      (await batchRequest(app, config, { name: "无效重试", count: 0 }, key)).status,
      400,
    );
    assert.equal(
      (await batchRequest(app, config, { name: "触及额度", count: 50 })).status,
      429,
    );
    const replay = await batchRequest(
      app,
      config,
      { name: "原始批次", count: 50 },
      key,
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal("codes" in replay.body, false);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 50,
    });
  });

  it("revokes a whole batch with sessions and emits redacted production audit events", async () => {
    const { app, config, database, now } = fixture(1_000_000, {
      nodeEnv: "production",
    });
    const messages: string[] = [];
    const originalInfo = console.info;
    console.info = (message?: unknown) => messages.push(String(message));
    try {
      const created = await batchRequest(app, config, { name: "审计批次", count: 2 });
      assert.equal(created.status, 201);
      const code = created.body.codes[0].code as string;
      const session = redeemInvite(database, code, now);
      const revoked = await request(app)
        .post(`/api/invite-batches/${created.body.batch.id}/revoke`)
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token")
        .set("Origin", config.adminOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .send({});
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.revokedInviteCount, 2);
      assert.equal(revoked.body.revokedSessionCount, 1);
      assert.equal(isSessionValid(database, session.token, now + 1), false);
      const replay = await request(app)
        .post(`/api/invite-batches/${created.body.batch.id}/revoke`)
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token")
        .set("Origin", config.adminOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .send({});
      assert.equal(replay.status, 200);
      assert.equal(replay.body.revokedInviteCount, 0);
      assert.equal(replay.body.revokedSessionCount, 0);
      assert.equal(messages.length, 3);
      assert.equal(messages.some((message) => message.includes(code)), false);
      assert.equal(messages.some((message) => message.includes(config.adminEmail)), false);
      for (const message of messages) {
        const event = JSON.parse(message) as Record<string, unknown>;
        assert.equal(event.event, "admin_audit");
        assert.equal(typeof event.requestId, "string");
        assert.equal("requestBody" in event, false);
      }
    } finally {
      console.info = originalInfo;
    }
  });

  it("lists session metadata and revokes only the selected session", async () => {
    const { app, config, database, now } = fixture();
    const firstInvite = createInvite(database, "第一台设备", now);
    const secondInvite = createInvite(database, "第二台设备", now);
    const firstSession = redeemInvite(database, firstInvite.code, now);
    const secondSession = redeemInvite(database, secondInvite.code, now);
    const [firstSummary] = listSessions(database, now).filter(
      (session) => session.inviteId === firstInvite.invite.id,
    );
    assert.ok(firstSummary);

    const list = await request(app)
      .get("/api/sessions")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    assert.equal(list.status, 200);
    assert.equal(list.body.sessions.length, 2);
    assert.equal(JSON.stringify(list.body).includes(firstSession.token), false);
    assert.equal(JSON.stringify(list.body).includes("tokenHash"), false);
    assert.equal(list.body.sessions.some(
      (session: { inviteLabel?: unknown }) => session.inviteLabel === "第一台设备",
    ), true);

    const revoked = await request(app)
      .post(`/api/sessions/${firstSummary.id}/revoke`)
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token")
      .set("Origin", config.adminOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .send({});
    assert.equal(revoked.status, 204);
    assert.equal(isSessionValid(database, firstSession.token, now), false);
    assert.equal(isSessionValid(database, secondSession.token, now), true);
  });

  it("keeps every update endpoint behind administrator authentication", async () => {
    const updater = new FakeUpdaterClient();
    const { app, config } = fixture(1_000_000, {}, updater);
    const missing = await request(app)
      .get("/api/system-update")
      .set("Host", config.adminHost);
    const publicHost = await request(app)
      .get("/api/system-update")
      .set("Host", config.filmframeHost);
    const valid = await request(app)
      .get("/api/system-update")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");

    assert.equal(missing.status, 401);
    assert.equal(publicHost.status, 404);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.current.version, "1.0.0");
    assert.match(valid.headers["cache-control"], /private, no-store/);
    assert.equal(updater.calls.length, 1);
  });

  it("reports a disabled or unreachable updater through a fixed no-store error", async () => {
    const disabled = fixture();
    const disabledResponse = await request(disabled.app)
      .get("/api/system-update")
      .set("Host", disabled.config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    assert.equal(disabledResponse.status, 503);
    assert.deepEqual(disabledResponse.body, {
      error: "updater_unavailable",
      retryable: true,
    });
    assert.match(disabledResponse.headers["cache-control"], /private, no-store/);

    const updater = new FakeUpdaterClient();
    updater.error = new UpdaterClientError("updater_unavailable", true);
    const unreachable = fixture(1_000_000, {}, updater);
    const unreachableResponse = await request(unreachable.app)
      .get("/api/system-update")
      .set("Host", unreachable.config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    assert.equal(unreachableResponse.status, 503);
    assert.deepEqual(unreachableResponse.body, disabledResponse.body);
  });

  it("retains JSON, Origin, CSRF, and UUID gates for update writes", async () => {
    const updater = new FakeUpdaterClient();
    const { app, config } = fixture(1_000_000, {}, updater);
    const base = () =>
      request(app)
        .post("/api/system-update/jobs")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token");

    assert.equal((await base().send({ version: "1.1.0" })).status, 403);
    assert.equal(
      (
        await base()
          .set("Origin", config.adminOrigin)
          .set("X-FilmFrame-CSRF", "1")
          .type("form")
          .send({ version: "1.1.0" })
      ).status,
      415,
    );
    assert.equal(
      (
        await base()
          .set("Origin", config.adminOrigin)
          .set("X-FilmFrame-CSRF", "1")
          .send({ version: "1.1.0" })
      ).status,
      400,
    );
    assert.equal(
      (
        await base()
          .set("Origin", config.adminOrigin)
          .set("X-FilmFrame-CSRF", "1")
          .set("Idempotency-Key", randomUUID())
          .send({ version: "latest" })
      ).status,
      400,
    );
    assert.equal(updater.calls.length, 0);
  });

  it("creates one global updater job for repeated same-target requests", async () => {
    const updater = new FakeUpdaterClient();
    const { app, config } = fixture(1_000_000, {}, updater);
    const keys = [randomUUID(), randomUUID()];
    const create = (key: string) =>
      request(app)
        .post("/api/system-update/jobs")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token")
        .set("Origin", config.adminOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Idempotency-Key", key)
        .send({ version: "1.1.0" });

    const [first, replay] = await Promise.all([create(keys[0] as string), create(keys[1] as string)]);
    assert.equal(first.status, 202);
    assert.equal(replay.status, 202);
    assert.equal(first.body.job.id, replay.body.job.id);
    const calls = updater.calls.filter(({ action }) => action === "create_job");
    assert.equal(calls.length, 2);
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      assert.equal(input.version, "1.1.0");
      assert.match(String(input.actorHash), /^[0-9a-f]{64}$/);
      assert.equal(JSON.stringify(input).includes(config.adminEmail), false);
    }
    assert.deepEqual(
      new Set(calls.map(({ input }) => (input as { idempotencyKey: string }).idempotencyKey)),
      new Set(keys),
    );
  });

  it("checks releases and reads safe task history with bounded inputs", async () => {
    const updater = new FakeUpdaterClient();
    updater.history = {
      jobs: [updateJob({ state: "succeeded", startedAt: updateNow, finishedAt: updateNow })],
    };
    const { app, config } = fixture(1_000_000, {}, updater);
    const auth = (pending: request.Test) =>
      pending
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token");
    const checked = await auth(request(app).post("/api/system-update/check"))
      .set("Origin", config.adminOrigin)
      .set("X-FilmFrame-CSRF", "1")
      .set("Idempotency-Key", randomUUID())
      .send({});
    const found = await auth(
      request(app).get(`/api/system-update/jobs/${updateJob().id}`),
    );
    const history = await auth(request(app).get("/api/system-update/history?limit=20"));
    const invalidHistory = await auth(
      request(app).get("/api/system-update/history?limit=500"),
    );

    assert.equal(checked.status, 200);
    assert.equal(checked.body.candidate.version, "1.1.0");
    assert.equal(found.status, 200);
    assert.equal(found.body.job.id, updateJob().id);
    assert.equal(history.status, 200);
    assert.equal(history.body.jobs.length, 1);
    assert.equal(invalidHistory.status, 400);
    assert.equal(
      updater.calls.some(
        ({ action, input }) =>
          action === "check" && (input as { force?: boolean }).force === true,
      ),
      true,
    );
  });

  it("maps updater conflicts and trust failures to fixed API errors", async () => {
    for (const [code, expectedStatus] of [
      ["update_busy", 409],
      ["release_untrusted", 422],
      ["internal_error", 502],
    ] as const) {
      const updater = new FakeUpdaterClient();
      updater.error = new UpdaterClientError(code, false);
      const { app, config } = fixture(1_000_000, {}, updater);
      const response = await request(app)
        .get("/api/system-update")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token");
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(response.body, { error: code, retryable: false });
      assert.equal("message" in response.body, false);
    }
  });

  it("emits a redacted production audit event for an update request", async () => {
    const updater = new FakeUpdaterClient();
    const { app, config } = fixture(
      1_000_000,
      { nodeEnv: "production" },
      updater,
    );
    const messages: string[] = [];
    const originalInfo = console.info;
    console.info = (message?: unknown) => messages.push(String(message));
    try {
      const response = await request(app)
        .post("/api/system-update/jobs")
        .set("Host", config.adminHost)
        .set("Cf-Access-Jwt-Assertion", "valid-access-token")
        .set("Origin", config.adminOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Idempotency-Key", randomUUID())
        .send({ version: "1.1.0" });
      assert.equal(response.status, 202);
    } finally {
      console.info = originalInfo;
    }
    assert.equal(messages.length, 1);
    const event = JSON.parse(messages[0] as string) as Record<string, unknown>;
    assert.equal(event.event, "admin_audit");
    assert.equal(event.action, "system_update.create");
    assert.equal(event.targetType, "system_update");
    assert.equal(event.targetId, updateJob().id);
    assert.equal(JSON.stringify(event).includes(config.adminEmail), false);
    assert.equal(JSON.stringify(event).includes("valid-access-token"), false);
    assert.equal("requestBody" in event, false);
  });

  it("renders idempotent create and session controls without exposing secrets", async () => {
    const { app, config, database, now } = fixture();
    const invite = createInvite(database, "页面设备", now);
    const session = redeemInvite(database, invite.code, now);
    const response = await request(app)
      .get("/")
      .set("Host", config.adminHost)
      .set("Cf-Access-Jwt-Assertion", "valid-access-token");

    assert.equal(response.status, 200);
    assert.match(response.text, /Idempotency-Key/);
    assert.match(response.text, /createButton\.disabled=true/);
    assert.match(response.text, /设备会话/);
    assert.match(response.text, /撤销会话/);
    assert.match(response.text, /批量/);
    assert.match(response.text, /复制全部/);
    assert.match(response.text, /下载 CSV/);
    assert.match(response.text, /clearCreatedCodes/);
    assert.match(response.text, /pagehide/);
    assert.match(response.text, /invite-search/);
    assert.match(response.text, /revoke-batch/);
    assert.match(response.text, /\^\[=\+\\-@\]/);
    assert.doesNotMatch(response.text, /localStorage|sessionStorage/);
    assert.match(response.text, /data-label="会话 ID"/);
    assert.match(response.text, /content:attr\(data-label\)/);
    assert.match(response.text, /\[hidden\]\{display:none!important\}/);
    assert.match(response.text, /版本与更新/);
    assert.match(response.text, /id="admin-view-updates"/);
    assert.match(response.text, /id="update-timeline"/);
    assert.match(response.text, /data-update-stage="switching"/);
    assert.match(response.text, /id="update-confirm"/);
    assert.match(response.text, /Idempotency-Key/);
    assert.match(response.text, /visibilitychange/);
    assert.match(response.text, /window\.addEventListener\("online"/);
    assert.match(response.text, /updateFinalStates/);
    assert.match(response.text, /recovery_required/);
    assert.match(response.text, /updateDuration/);
    assert.match(response.text, /总耗时/);
    assert.match(response.text, /completedBoundary/);
    assert.match(response.text, /updateFinalStates\.has\(job\.state\)\?30000/);
    assert.doesNotMatch(response.text, /console\.(?:log|error|warn)/);
    assert.doesNotMatch(response.text, /docker\.sock|\/opt\/filmframe|stdout|stderr/);
    assert.doesNotMatch(response.text, new RegExp(session.token));
  });
});
