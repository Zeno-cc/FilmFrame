import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import request from "supertest";

import { createApp } from "../src/app.js";
import type { Request } from "express";
import {
  loadConfig,
  publicOriginForRequest,
  type AccessConfig,
} from "../src/config.js";
import { DEVELOPMENT_SESSION_COOKIE, SESSION_TTL_MS } from "../src/constants.js";
import { openDatabase, type AccessDatabase } from "../src/db.js";
import { saveChallenge, savePasskey, WEBAUTHN_CHALLENGE_TTL_MS } from "../src/passkeyStore.js";
import { createInvite, redeemInvite } from "../src/store.js";
import { testConfig } from "./helpers.js";

const databases: AccessDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function fixture(now = () => 10_000, configOverrides: Partial<AccessConfig> = {}) {
  const config = testConfig(configOverrides);
  const database = openDatabase(":memory:");
  databases.push(database);
  const app = createApp({
    config,
    database,
    accessJwtVerifier: async () => { throw new Error("unauthorized"); },
    now,
  });
  const invite = createInvite(database, "Passkey regression", 10_000);
  const session = redeemInvite(database, invite.code, 10_000);
  return { app, config, database, invite, session };
}

function localHttpFixture(now = () => 10_000) {
  return fixture(now, {
    secureCookies: false,
    sessionCookieName: DEVELOPMENT_SESSION_COOKIE,
  });
}

function originRequest(
  protocol: string,
  host: string,
  forwardedHost = "attacker.example.test:5175",
) {
  return {
    protocol,
    get(name: string) {
      if (name === "host") return host;
      if (name === "x-forwarded-host") return forwardedHost;
      return undefined;
    },
  };
}

describe("publicOriginForRequest", () => {
  const local = testConfig({
    nodeEnv: "development",
    secureCookies: false,
    sessionCookieName: DEVELOPMENT_SESSION_COOKIE,
  });

  it("derives the browser origin from the validated request Host behind a TLS proxy", () => {
    assert.equal(
      publicOriginForRequest(
        local,
        originRequest("http", "filmframe.example.test:5175") as Request,
      ),
      "http://filmframe.example.test:5175",
    );
    // A development deployment reached through a TLS-terminating proxy still
    // needs the https origin for its CSRF allow-list and WebAuthn verification.
    assert.equal(
      publicOriginForRequest(local, originRequest("https", "filmframe.example.test:5175")),
      "https://filmframe.example.test:5175",
    );
    assert.equal(publicOriginForRequest(local, originRequest("ftp", "filmframe.example.test:5175")), null);
    assert.equal(publicOriginForRequest(local, originRequest("http", "attacker.example.test:5175")), null);
    assert.equal(publicOriginForRequest(local, originRequest("http", "filmframe.example.test.evil")), null);
    assert.equal(publicOriginForRequest(local, originRequest("http", "user@filmframe.example.test")), null);
  });

  it("keeps the strict configured HTTPS origin in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      SECURE_COOKIES: "true",
      FILMFRAME_HOST: "filmframe.example.test",
      ADMIN_HOST: "filmframe-admin.example.test",
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUDIENCE: "test-access-audience",
      CF_ACCESS_ADMIN_EMAIL: "admin@example.test",
    });
    assert.equal(config.publicOrigin, "https://filmframe.example.test");
    const productionRequests: Array<[string, string]> = [
      ["http", "filmframe.example.test:5175"],
      ["https", "filmframe.example.test:5175"],
      ["http", "attacker.example.test"],
    ];
    for (const [protocol, host] of productionRequests) {
      assert.equal(
        publicOriginForRequest(config, originRequest(protocol, host)),
        "https://filmframe.example.test",
      );
    }
    assert.throws(() => loadConfig({
      NODE_ENV: "production",
      SECURE_COOKIES: "false",
      FILMFRAME_HOST: "filmframe.example.test",
      ADMIN_HOST: "filmframe-admin.example.test",
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUDIENCE: "test-access-audience",
      CF_ACCESS_ADMIN_EMAIL: "admin@example.test",
    }), /SECURE_COOKIES cannot be disabled in production/);
  });
});

describe("local HTTP public origin", () => {
  const host = "filmframe.example.test:5175";
  const origin = `http://${host}`;

  it("refreshes the session for the request Host and rejects HTTPS", async () => {
    const { app, config, database, session } = localHttpFixture(() => 20_000);
    const cookie = `${config.sessionCookieName}=${session.token}`;
    const refresh = (requestOrigin: string) => request(app)
      .post("/auth/refresh")
      .set("Host", host)
      .set("Origin", requestOrigin)
      .set("X-Forwarded-Host", "attacker.example.test")
      .set("X-FilmFrame-CSRF", "1")
      .set("Cookie", cookie);

    const https = await refresh(`https://${host}`);
    assert.equal(https.status, 403);
    assert.equal(https.headers["set-cookie"], undefined);

    const response = await refresh(origin);
    assert.equal(response.status, 204, response.text);
    const renewedCookie = response.headers["set-cookie"]?.[0] as string;
    assert.match(renewedCookie, new RegExp(`^${DEVELOPMENT_SESSION_COOKIE}=${session.token};`));
    assert.doesNotMatch(renewedCookie, /Secure/);
    assert.deepEqual(
      database.prepare("SELECT last_seen_at, expires_at FROM sessions").get(),
      { last_seen_at: 20_000, expires_at: 20_000 + SESSION_TTL_MS },
    );
  });

  it("keeps production refresh bound to the configured HTTPS origin", async () => {
    const { app, config, session } = fixture(() => 20_000, { nodeEnv: "production" });
    const cookie = `${config.sessionCookieName}=${session.token}`;
    const localHttp = await request(app)
      .post("/auth/refresh")
      .set("Host", host)
      .set("Origin", origin)
      .set("X-Forwarded-Host", "attacker.example.test")
      .set("X-FilmFrame-CSRF", "1")
      .set("Cookie", cookie);
    assert.equal(localHttp.status, 403);
    const response = await request(app)
      .post("/auth/refresh")
      .set("Host", config.filmframeHost)
      .set("Origin", config.publicOrigin)
      .set("X-Forwarded-Host", "attacker.example.test")
      .set("X-FilmFrame-CSRF", "1")
      .set("Cookie", cookie);
    assert.equal(response.status, 204);
    assert.match(response.headers["set-cookie"]?.[0] as string, /Secure/);
  });

  it("completes authentication options and signed verification over local HTTP", async () => {
    const { app, config, database, invite } = localHttpFixture();
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    assert.ok(jwk.x && jwk.y);
    const coseKey = Buffer.concat([
      Buffer.from("a5010203262001215820", "hex"), Buffer.from(jwk.x, "base64url"),
      Buffer.from("225820", "hex"), Buffer.from(jwk.y, "base64url"),
    ]);
    const credentialId = Buffer.from("local-http-passkey").toString("base64url");
    savePasskey(database, {
      credentialId, inviteId: invite.invite.id, publicKey: coseKey,
      counter: 0, deviceType: "singleDevice", backedUp: false,
      transports: ["internal"], now: 10_000,
    });
    const ceremony = (path: string, requestOrigin = origin) => request(app)
      .post(`/auth/passkeys/${path}`)
      .set("Host", host)
      .set("Origin", requestOrigin)
      .set("X-Forwarded-Host", "attacker.example.test")
      .set("X-FilmFrame-CSRF", "1");

    const options = await ceremony("authentication/options").send({});
    assert.equal(options.status, 200, JSON.stringify(options.body));
    const clientData = Buffer.from(JSON.stringify({
      type: "webauthn.get",
      challenge: options.body.options.challenge,
      origin,
    }));
    const authenticatorData = Buffer.concat([
      createHash("sha256").update(config.filmframeHost).digest(),
      Buffer.from([0x05, 0, 0, 0, 1]),
    ]);
    const signature = sign("sha256", Buffer.concat([
      authenticatorData, createHash("sha256").update(clientData).digest(),
    ]), privateKey);
    const response = await ceremony("authentication/verify").send({
      challengeId: options.body.challengeId,
      response: {
        id: credentialId, rawId: credentialId, type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: authenticatorData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      },
    });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { ok: true });
    const recoveredCookie = response.headers["set-cookie"]?.[0] as string;
    assert.match(recoveredCookie, new RegExp(`^${DEVELOPMENT_SESSION_COOKIE}=`));
    assert.doesNotMatch(recoveredCookie, /Secure/);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM sessions").get(), { count: 2 });
    assert.deepEqual(database.prepare("SELECT redemption_count FROM invites").get(), { redemption_count: 1 });
    assert.deepEqual(database.prepare("SELECT counter FROM passkey_credentials").get(), { counter: 1 });
  });

  it("rejects HTTPS and forwarded-host origins without creating a challenge", async () => {
    const { app, database } = localHttpFixture();
    for (const requestOrigin of [`https://${host}`, "http://attacker.example.test:5175"]) {
      const response = await request(app)
        .post("/auth/passkeys/authentication/options")
        .set("Host", host)
        .set("Origin", requestOrigin)
        .set("X-Forwarded-Host", "attacker.example.test:5175")
        .set("X-FilmFrame-CSRF", "1")
        .send({});
      assert.equal(response.status, 403, requestOrigin);
    }
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM webauthn_challenges").get(), { count: 0 });
  });
});

describe("Passkey request boundaries", () => {
  it("reports database write failures as server errors instead of invalid ceremonies", async () => {
    const { app, config, database, session } = fixture();
    database.pragma("query_only = ON");
    for (const path of ["registration/options", "authentication/options"]) {
      const response = await request(app)
        .post(`/auth/passkeys/${path}`)
        .set("Host", config.filmframeHost)
        .set("Origin", config.publicOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Cookie", `${config.sessionCookieName}=${session.token}`)
        .send({});
      assert.equal(response.status, 500, path);
      assert.equal(response.text, "Internal Server Error");
    }
  });

  it("requires JSON on every ceremony endpoint without creating challenges", async () => {
    const { app, config, database, session } = fixture();
    for (const path of [
      "registration/options", "registration/verify",
      "authentication/options", "authentication/verify",
    ]) {
      const response = await request(app)
        .post(`/auth/passkeys/${path}`)
        .set("Host", config.filmframeHost)
        .set("Origin", config.publicOrigin)
        .set("X-FilmFrame-CSRF", "1")
        .set("Cookie", `${config.sessionCookieName}=${session.token}`)
        .type("text")
        .send("{}");
      assert.equal(response.status, 415, path);
    }
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM webauthn_challenges").get(), { count: 0 });
  });

  for (const expired of [false, true]) {
    it(expired
      ? "rejects a correctly signed assertion when its challenge expires during verification"
      : "recovers with a correctly signed assertion and records completion time", async () => {
      let clockReads = 0;
      const completedAt = expired ? 10_000 + WEBAUTHN_CHALLENGE_TTL_MS : 20_000;
      const { app, config, database, invite } = fixture(
        () => clockReads++ === 0 ? 10_000 : completedAt,
        { nodeEnv: "production" },
      );
      const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const jwk = publicKey.export({ format: "jwk" });
      assert.ok(jwk.x && jwk.y);
      // ES256 COSE_Key: kty=EC2, alg=ES256, crv=P-256, x/y coordinates.
      const coseKey = Buffer.concat([
        Buffer.from("a5010203262001215820", "hex"), Buffer.from(jwk.x, "base64url"),
        Buffer.from("225820", "hex"), Buffer.from(jwk.y, "base64url"),
      ]);
      const credentialId = Buffer.from("test-passkey").toString("base64url");
      savePasskey(database, {
        credentialId, inviteId: invite.invite.id, publicKey: coseKey,
        counter: 0, deviceType: "singleDevice", backedUp: false,
        transports: ["internal"], now: 10_000,
      });
      const challenge = saveChallenge(database, {
        challenge: Buffer.from("regression-challenge").toString("base64url"),
        purpose: "authentication", sessionId: null, inviteId: null,
        createdAt: 10_000, expiresAt: 10_000 + WEBAUTHN_CHALLENGE_TTL_MS,
      });
      const clientData = Buffer.from(JSON.stringify({
        type: "webauthn.get", challenge: challenge.challenge, origin: config.publicOrigin,
      }));
      const authenticatorData = Buffer.concat([
        createHash("sha256").update(config.filmframeHost).digest(),
        // User presence and verification flags, followed by signature counter 1.
        Buffer.from([0x05, 0, 0, 0, 1]),
      ]);
      const signature = sign("sha256", Buffer.concat([
        authenticatorData, createHash("sha256").update(clientData).digest(),
      ]), privateKey);
      const verify = (origin: string) => request(app)
        .post("/auth/passkeys/authentication/verify")
        .set("Host", config.filmframeHost)
        .set("Origin", origin)
        .set("X-Forwarded-Host", "attacker.example.test")
        .set("X-FilmFrame-CSRF", "1")
        .send({
          challengeId: challenge.id,
          response: {
            id: credentialId, rawId: credentialId, type: "public-key",
            clientExtensionResults: {},
            response: {
              clientDataJSON: clientData.toString("base64url"),
              authenticatorData: authenticatorData.toString("base64url"),
              signature: signature.toString("base64url"),
            },
          },
        });
      const localHttp = await verify("http://filmframe.example.test:5175");
      assert.equal(localHttp.status, 403);
      assert.deepEqual(
        database.prepare("SELECT used_at FROM webauthn_challenges WHERE id = ?").get(challenge.id),
        { used_at: null },
      );
      const response = await verify(config.publicOrigin);
      assert.equal(response.status, expired ? 400 : 200, JSON.stringify(response.body));
      assert.deepEqual(database.prepare("SELECT count(*) AS count FROM sessions").get(), { count: expired ? 1 : 2 });
      assert.deepEqual(database.prepare("SELECT redemption_count FROM invites").get(), { redemption_count: 1 });
      assert.deepEqual(database.prepare("SELECT counter, last_used_at FROM passkey_credentials").get(),
        expired ? { counter: 0, last_used_at: null } : { counter: 1, last_used_at: completedAt });
      if (expired) assert.equal(response.headers["set-cookie"], undefined);
    });
  }
});
