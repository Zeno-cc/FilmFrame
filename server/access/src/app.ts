import { randomBytes, randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";

import type { AccessJwtVerifier } from "./accessJwt.js";
import type { AccessConfig } from "./config.js";
import {
  assertDatabaseReady,
  DatabaseUnavailableError,
  type AccessDatabase,
} from "./db.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import {
  requireInternalRequest,
  requireKnownHost,
} from "./middleware/requestSecurity.js";
import { isTrustedProxyAddress } from "./network.js";
import { NonceStore } from "./nonceStore.js";
import { createAdminRoutes } from "./routes/adminRoutes.js";
import { createPublicRoutes } from "./routes/publicRoutes.js";
import { readSessionCookie } from "./sessionCookie.js";
import { hasInviteBatchCreationRequest, isSessionValid } from "./store.js";

export interface CreateAppOptions {
  config: AccessConfig;
  database: AccessDatabase;
  accessJwtVerifier: AccessJwtVerifier;
  now?: () => number;
}

function errorCategory(error: unknown): "database" | "request" | "internal" {
  if (error instanceof DatabaseUnavailableError) return "database";
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.startsWith("SQLITE_")) return "database";
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) return "request";
  return "internal";
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const now = options.now ?? Date.now;
  const nonceStore = new NonceStore(now);

  app.disable("x-powered-by");
  app.set("trust proxy", (address: string) => isTrustedProxyAddress(address));
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.locals.cspNonce = randomBytes(18).toString("base64url");
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Pragma", "no-cache");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            (_request, response) =>
              `'nonce-${String((response as typeof response & { locals: Record<string, unknown> }).locals.cspNonce)}'`,
          ],
          styleSrc: [
            "'self'",
            (_request, response) =>
              `'nonce-${String((response as typeof response & { locals: Record<string, unknown> }).locals.cspNonce)}'`,
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(requireKnownHost(options.config));

  const internalOnly = requireInternalRequest(options.config);
  app.get("/healthz", internalOnly, (_request, response, next) => {
    response.locals.operation = "database_health";
    try {
      assertDatabaseReady(options.database);
      response.status(200).type("text/plain").send("ok");
    } catch (error) {
      next(error);
    }
  });
  app.get("/internal/session-check", internalOnly, (request, response) => {
    const token = readSessionCookie(request, options.config);
    response.status(isSessionValid(options.database, token, now()) ? 204 : 401).end();
  });

  app.use(
    createPublicRoutes({
      config: options.config,
      database: options.database,
      nonceStore,
      redeemRateLimiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
      now,
    }),
  );

  app.use(express.json({ limit: "4kb", strict: true }));
  app.use(
    createAdminRoutes({
      config: options.config,
      database: options.database,
      accessJwtVerifier: options.accessJwtVerifier,
      rateLimiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
      batchRateLimiter: createRateLimiter({
        limit: 100,
        windowMs: 60_000,
        cost: (request) => {
          const body = request.body as unknown;
          if (!body || typeof body !== "object" || Array.isArray(body)) return 1;
          const values = body as Record<string, unknown>;
          if (
            Object.keys(values).length !== 2 ||
            typeof values.name !== "string" ||
            values.name.trim().length < 1 ||
            values.name.trim().length > 64 ||
            !Number.isSafeInteger(values.count) ||
            (values.count as number) < 1 ||
            (values.count as number) > 50
          ) {
            return 1;
          }
          const idempotencyKey = request.header("Idempotency-Key");
          if (
            idempotencyKey &&
            hasInviteBatchCreationRequest(options.database, idempotencyKey)
          ) {
            return 0;
          }
          return values.count as number;
        },
      }),
      now,
    }),
  );

  app.use((_request, response) => {
    response.status(404).type("text/plain").send("Not Found");
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (options.config.nodeEnv === "production") {
      console.error(
        JSON.stringify({
          event: "request_error",
          requestId: String(response.locals.requestId),
          operation:
            typeof response.locals.operation === "string"
              ? response.locals.operation
              : "request",
          category: errorCategory(error),
        }),
      );
    }
    if (response.headersSent) {
      next(error);
      return;
    }
    const candidateStatus = (error as { status?: unknown }).status;
    const status =
      typeof candidateStatus === "number" &&
      candidateStatus >= 400 &&
      candidateStatus < 600
        ? candidateStatus
        : 500;
    const message =
      status === 503
        ? "Service Unavailable"
        : status >= 500
          ? "Internal Server Error"
          : "Invalid Request";
    response
      .status(status)
      .type("text/plain")
      .send(message);
  };
  app.use(errorHandler);

  return app;
}
