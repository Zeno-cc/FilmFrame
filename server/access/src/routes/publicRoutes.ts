import { Router, type RequestHandler, urlencoded } from "express";
import { z } from "zod";

import type { AccessConfig } from "../config.js";
import { GENERIC_INVITE_ERROR } from "../constants.js";
import type { AccessDatabase } from "../db.js";
import { requireHost, requireWriteCsrf } from "../middleware/requestSecurity.js";
import { NonceStore } from "../nonceStore.js";
import { readSessionCookie, setSessionCookie } from "../sessionCookie.js";
import {
  InviteUnavailableError,
  isSessionValid,
  redeemInvite,
  refreshSession,
} from "../store.js";
import { renderAccessPage } from "../views/html.js";

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

  router.get("/access", filmHost, (request, response) => {
    const token = readSessionCookie(request, options.config);
    if (isSessionValid(options.database, token, now())) {
      response.redirect(303, "/");
      return;
    }

    response.type("html").send(
      renderAccessPage({
        nonce: response.locals.cspNonce as string,
        formNonce: options.nonceStore.issue(),
      }),
    );
  });

  router.post(
    "/auth/redeem",
    filmHost,
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
      const validNonce = input.success && options.nonceStore.verify(input.data.nonce);
      if (!input.success || !validNonce) {
        response.status(400).type("html").send(
          renderAccessPage({
            nonce: response.locals.cspNonce as string,
            formNonce: options.nonceStore.issue(),
            error: GENERIC_INVITE_ERROR,
          }),
        );
        return;
      }

      try {
        response.locals.operation = "invite_redeem";
        const session = redeemInvite(options.database, input.data.code, now());
        setSessionCookie(response, options.config, session.token);
        response.redirect(303, "/");
      } catch (error) {
        if (!(error instanceof InviteUnavailableError)) {
          next(error);
          return;
        }
        response.status(400).type("html").send(
          renderAccessPage({
            nonce: response.locals.cspNonce as string,
            formNonce: options.nonceStore.issue(),
            error: GENERIC_INVITE_ERROR,
          }),
        );
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
