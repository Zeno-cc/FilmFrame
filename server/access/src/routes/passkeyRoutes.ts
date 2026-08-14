import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express, { Router, type Request, type RequestHandler } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import type { AccessConfig } from "../config.js";
import type { AccessDatabase } from "../db.js";
import { requireHost, requireWriteCsrf } from "../middleware/requestSecurity.js";
import {
  challengeById,
  getPasskeyByCredentialId,
  recoverSessionWithPasskey,
  registerPasskeyForSession,
  saveChallenge,
  sessionForToken,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "../passkeyStore.js";
import { readSessionCookie, setSessionCookie } from "../sessionCookie.js";
import { isSessionValid } from "../store.js";
import { renderPasskeySetupPage } from "../views/html.js";

const responseSchema = z
  .object({
    id: z.string().min(1).max(512),
    rawId: z.string().min(1).max(512),
    response: z.record(z.string(), z.unknown()),
    type: z.literal("public-key"),
  })
  .passthrough();
const verifyBodySchema = z
  .object({
    challengeId: z.uuid(),
    response: responseSchema,
  })
  .strict();

const RP_NAME = "FilmFrame 暗房";
type Transport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

function authenticatedSession(
  database: AccessDatabase,
  config: AccessConfig,
  request: Request,
  now: number,
) {
  const token = readSessionCookie(request, config);
  if (!token || !isSessionValid(database, token, now)) return null;
  return sessionForToken(database, token, now);
}

function parseTransports(value: unknown): Transport[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<Transport>([
    "ble",
    "cable",
    "hybrid",
    "internal",
    "nfc",
    "smart-card",
    "usb",
  ]);
  return value.filter((entry): entry is Transport => typeof entry === "string" && allowed.has(entry as Transport));
}

export interface PasskeyRouteOptions {
  config: AccessConfig;
  database: AccessDatabase;
  optionsRateLimiter: RequestHandler;
  verifyRateLimiter: RequestHandler;
  now?: () => number;
}

export function createPasskeyRoutes(options: PasskeyRouteOptions): Router {
  const router = Router();
  const now = options.now ?? Date.now;
  const filmHost = requireHost(options.config.filmframeHost);
  const csrf = requireWriteCsrf(options.config.publicOrigin);

  router.get("/auth/passkeys/client.js", filmHost, (_request, response) => {
    try {
      const require = createRequire(import.meta.url);
      const packageEntry = require.resolve("@simplewebauthn/browser");
      const bundlePath = resolve(packageEntry, "../../dist/bundle/index.umd.min.js");
      const bundle = readFileSync(bundlePath, "utf8");
      response
        .type("application/javascript")
        .setHeader("Cache-Control", "public, max-age=31536000, immutable")
        .send(`${bundle}\nexport const { startRegistration, startAuthentication, browserSupportsWebAuthn } = globalThis.SimpleWebAuthnBrowser;`);
    } catch {
      response.status(404).type("text/plain").send("Not Found");
    }
  });

  router.get("/access/passkey/setup", filmHost, (request, response) => {
    const session = authenticatedSession(options.database, options.config, request, now());
    if (!session) {
      response.redirect(303, "/access");
      return;
    }
    response.type("html").send(renderPasskeySetupPage({
      nonce: response.locals.cspNonce as string,
    }));
  });

  router.post(
    "/auth/passkeys/registration/options",
    filmHost,
    csrf,
    options.optionsRateLimiter,
    express.json({ limit: "4kb", strict: true }),
    async (request, response) => {
      const requestNow = now();
      const session = authenticatedSession(options.database, options.config, request, requestNow);
      if (!session) {
        response.status(401).json({ error: "unauthorized" });
        return;
      }
      try {
        const existing = options.database
          .prepare("SELECT credential_id, transports FROM passkey_credentials WHERE invite_id = ? AND revoked_at IS NULL")
          .all(session.inviteId) as Array<{ credential_id: string; transports: string | null }>;
        const excludeCredentials = existing.map((entry) => {
          const transports = entry.transports ? parseTransports(JSON.parse(entry.transports)) : [];
          return transports.length > 0
            ? { id: entry.credential_id, transports }
            : { id: entry.credential_id };
        });
        const challengeOptions = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: options.config.filmframeHost,
          userName: `invite-${session.inviteId}`,
          userDisplayName: "FilmFrame 设备",
          userID: Buffer.from(session.inviteId.replaceAll("-", ""), "hex"),
          attestationType: "none",
          timeout: WEBAUTHN_CHALLENGE_TTL_MS,
          excludeCredentials,
          authenticatorSelection: {
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
        });
        const challenge = saveChallenge(options.database, {
          challenge: challengeOptions.challenge,
          purpose: "registration",
          sessionId: session.id,
          inviteId: session.inviteId,
          createdAt: requestNow,
          expiresAt: requestNow + WEBAUTHN_CHALLENGE_TTL_MS,
        });
        response.json({ challengeId: challenge.id, options: challengeOptions });
      } catch {
        response.status(400).json({ error: "passkey_unavailable" });
      }
    },
  );

  router.post(
    "/auth/passkeys/registration/verify",
    filmHost,
    csrf,
    options.verifyRateLimiter,
    express.json({ limit: "64kb", strict: true }),
    async (request, response) => {
      const input = verifyBodySchema.safeParse(request.body);
      const requestNow = now();
      const session = authenticatedSession(options.database, options.config, request, requestNow);
      if (!session || !input.success) {
        response.status(400).json({ error: "passkey_verification_failed" });
        return;
      }
      try {
        const pending = challengeById(
          options.database,
          input.data.challengeId,
          "registration",
          requestNow,
        );
        if (!pending || pending.sessionId !== session.id) throw new Error("challenge_missing");
        const verification = await verifyRegistrationResponse({
          response: input.data.response as unknown as RegistrationResponseJSON,
          expectedChallenge: pending.challenge,
          expectedOrigin: options.config.publicOrigin,
          expectedRPID: options.config.filmframeHost,
          requireUserVerification: true,
        });
        if (!verification.verified) throw new Error("verification_failed");
        const info = verification.registrationInfo;
        const registered = registerPasskeyForSession(options.database, {
          challengeId: pending.id,
          challenge: pending.challenge,
          sessionId: session.id,
          inviteId: session.inviteId,
          credentialId: info.credential.id,
          publicKey: info.credential.publicKey,
          counter: info.credential.counter,
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          transports: parseTransports(input.data.response.response.transports),
          now: requestNow,
        });
        if (!registered) throw new Error("challenge_invalid");
        response.status(201).json({ ok: true });
      } catch {
        response.status(400).json({ error: "passkey_verification_failed" });
      }
    },
  );

  router.post(
    "/auth/passkeys/authentication/options",
    filmHost,
    csrf,
    options.optionsRateLimiter,
    express.json({ limit: "4kb", strict: true }),
    async (_request, response) => {
      const requestNow = now();
      try {
        const challengeOptions = await generateAuthenticationOptions({
          rpID: options.config.filmframeHost,
          userVerification: "required",
          timeout: WEBAUTHN_CHALLENGE_TTL_MS,
        });
        const challenge = saveChallenge(options.database, {
          challenge: challengeOptions.challenge,
          purpose: "authentication",
          sessionId: null,
          inviteId: null,
          createdAt: requestNow,
          expiresAt: requestNow + WEBAUTHN_CHALLENGE_TTL_MS,
        });
        response.json({ challengeId: challenge.id, options: challengeOptions });
      } catch {
        response.status(400).json({ error: "passkey_unavailable" });
      }
    },
  );

  router.post(
    "/auth/passkeys/authentication/verify",
    filmHost,
    csrf,
    options.verifyRateLimiter,
    express.json({ limit: "64kb", strict: true }),
    async (request, response) => {
      const input = verifyBodySchema.safeParse(request.body);
      const requestNow = now();
      if (!input.success) {
        response.status(400).json({ error: "passkey_verification_failed" });
        return;
      }
      try {
        const credential = getPasskeyByCredentialId(options.database, input.data.response.id);
        if (!credential || credential.revokedAt !== null) throw new Error("credential_missing");
        const invite = options.database
          .prepare("SELECT id FROM invites WHERE id = ? AND revoked_at IS NULL")
          .get(credential.inviteId) as { id: string } | undefined;
        if (!invite) throw new Error("invite_revoked");
        const pending = challengeById(
          options.database,
          input.data.challengeId,
          "authentication",
          requestNow,
        );
        if (!pending) throw new Error("challenge_missing");
        const verification = await verifyAuthenticationResponse({
          response: input.data.response as unknown as AuthenticationResponseJSON,
          expectedChallenge: pending.challenge,
          expectedOrigin: options.config.publicOrigin,
          expectedRPID: options.config.filmframeHost,
          requireUserVerification: true,
          credential: {
            id: credential.credentialId,
            publicKey: new Uint8Array(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports as Transport[],
          },
        });
        if (!verification.verified) throw new Error("verification_failed");
        const recovered = recoverSessionWithPasskey(options.database, {
          challengeId: pending.id,
          challenge: pending.challenge,
          credentialId: credential.credentialId,
          inviteId: credential.inviteId,
          expectedCounter: credential.counter,
          newCounter: verification.authenticationInfo.newCounter,
          now: requestNow,
        });
        if (!recovered) throw new Error("invite_revoked");
        setSessionCookie(response, options.config, recovered.token);
        response.json({ ok: true });
      } catch {
        response.status(400).json({ error: "passkey_verification_failed" });
      }
    },
  );

  return router;
}
