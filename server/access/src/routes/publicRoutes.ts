import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
  urlencoded,
} from "express";
import { z } from "zod";

import type { AccessConfig } from "../config.js";
import { GENERIC_INVITE_ERROR } from "../constants.js";
import type { AccessDatabase } from "../db.js";
import { requireHost, requireWriteCsrf } from "../middleware/requestSecurity.js";
import { NonceStore } from "../nonceStore.js";
import {
  clearRedeemCookie,
  createRedeemBinding,
  readRedeemCookie,
  setRedeemCookie,
} from "../redeemCookie.js";
import { readSessionCookie, setSessionCookie } from "../sessionCookie.js";
import {
  InviteUnavailableError,
  isSessionValid,
  redeemInvite,
  refreshSession,
} from "../store.js";
import { renderAccessPage } from "../views/html.js";
import { readRenderBudgetSetting } from "../runtimeConfig.js";

const redeemSchema = z
  .object({
    code: z.string().min(1).max(128),
    nonce: z.string().min(1).max(128),
  })
  .strict();

export interface PublicRouteOptions {
  config: AccessConfig;
  database: AccessDatabase;
  nonceStore: NonceStore;
  redeemRateLimiter: RequestHandler;
  now?: () => number;
}

export function createPublicRoutes(options: PublicRouteOptions): Router {
  const router = Router();
  const now = options.now ?? Date.now;
  const filmHost = requireHost(options.config.filmframeHost);

  function sendAccessPage(
    request: Request,
    response: Response,
    status = 200,
    error?: string,
  ): void {
    let binding = readRedeemCookie(request, options.config) ?? createRedeemBinding();
    let formNonce: string;
    try {
      formNonce = options.nonceStore.issue(binding);
    } catch {
      binding = createRedeemBinding();
      formNonce = options.nonceStore.issue(binding);
    }
    setRedeemCookie(response, options.config, binding);
    const page = {
      nonce: response.locals.cspNonce as string,
      formNonce,
      ...(error === undefined ? {} : { error }),
    };
    response.status(status).type("html").send(renderAccessPage(page));
  }

  function normalizeOrigin(value: string): string | null {
    try {
      const parsed = new URL(value);
      if (
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      ) {
        return null;
      }
      return parsed.origin;
    } catch {
      return null;
    }
  }

  function hasAllowedRedeemOrigin(request: Parameters<RequestHandler>[0]): boolean {
    const origin = request.header("Origin");
    if (origin === undefined) return true;
    if (origin === "null") {
      // Some supported browsers use an opaque Origin for a same-origin native form.
      return request.header("Sec-Fetch-Site") === "same-origin";
    }

    const expectedOrigin = options.config.secureCookies
      ? normalizeOrigin(options.config.publicOrigin)
      : (() => {
          const host = request.get("host");
          return host ? normalizeOrigin(`${request.protocol}://${host}`) : null;
        })();
    return expectedOrigin !== null && normalizeOrigin(origin) === expectedOrigin;
  }

  router.get("/api/runtime-config", filmHost, (request, response) => {
    const token = readSessionCookie(request, options.config);
    if (!isSessionValid(options.database, token, now())) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    const setting = readRenderBudgetSetting(options.database);
    response.json({
      maxCanvasMiB: setting.maxCanvasMiB,
      maxCanvasBytes: setting.maxCanvasBytes,
      updatedAt: setting.updatedAt,
    });
  });

  router.get("/access", filmHost, (request, response) => {
    const token = readSessionCookie(request, options.config);
    if (isSessionValid(options.database, token, now())) {
      response.redirect(303, "/");
      return;
    }

    sendAccessPage(request, response);
  });

  router.post(
    "/auth/redeem",
    filmHost,
    (request, response, next) => {
      if (!hasAllowedRedeemOrigin(request)) {
        response.status(403).type("text/plain").send("Forbidden");
        return;
      }
      next();
    },
    options.redeemRateLimiter,
    (request, response, next) => {
      if (!request.is("application/x-www-form-urlencoded")) {
        response.status(415).type("text/plain").send("Unsupported Media Type");
        return;
      }
      next();
    },
    urlencoded({ extended: false, limit: "4kb", parameterLimit: 4 }),
    (request, response, next) => {
      const input = redeemSchema.safeParse(request.body);
      const binding = readRedeemCookie(request, options.config);
      const validNonce =
        input.success
        && binding !== null
        && options.nonceStore.consume(input.data.nonce, binding);
      if (!input.success || !validNonce) {
        sendAccessPage(request, response, 400, GENERIC_INVITE_ERROR);
        return;
      }

      try {
        response.locals.operation = "invite_redeem";
        const session = redeemInvite(options.database, input.data.code, now());
        setSessionCookie(response, options.config, session.token);
        clearRedeemCookie(response, options.config);
        response.redirect(303, "/access/passkey/setup");
      } catch (error) {
        if (!(error instanceof InviteUnavailableError)) {
          next(error);
          return;
        }
        sendAccessPage(request, response, 400, GENERIC_INVITE_ERROR);
      }
    },
  );

  router.post(
    "/auth/refresh",
    filmHost,
    requireWriteCsrf(options.config.publicOrigin),
    (request, response) => {
      const token = readSessionCookie(request, options.config);
      response.locals.operation = "session_refresh";
      const session = refreshSession(options.database, token, now());
      if (!token || session === null) {
        response.status(401).type("text/plain").send("Unauthorized");
        return;
      }
      setSessionCookie(response, options.config, session.token);
      response.status(204).end();
    },
  );

  return router;
}
