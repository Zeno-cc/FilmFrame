import { Router } from "express";
import { z } from "zod";

import type { AccessJwtVerifier } from "../accessJwt.js";
import type { AccessConfig } from "../config.js";
import type { AccessDatabase } from "../db.js";
import { requireAdminAccess } from "../middleware/adminAuth.js";
import type { RequestHandler } from "express";
import {
  requireHost,
  requireJsonContentType,
  requireWriteCsrf,
} from "../middleware/requestSecurity.js";
import {
  createInviteIdempotent,
  listInvites,
  listSessions,
  revokeInvite,
  revokeSession,
  type InviteSummary,
  type SessionSummary,
} from "../store.js";
import { renderAdminPage } from "../views/html.js";

const createInviteSchema = z.object({ label: z.string().trim().min(1).max(80) }).strict();
const inviteIdSchema = z.uuid();
const idempotencyKeySchema = z.uuid();
const sessionIdSchema = z.uuid();

function serializeInvite(invite: InviteSummary): Record<string, unknown> {
  return {
    id: invite.id,
    label: invite.label,
    createdAt: new Date(invite.createdAt).toISOString(),
    redeemBy: new Date(invite.redeemBy).toISOString(),
    maxRedemptions: invite.maxRedemptions,
    redemptionCount: invite.redemptionCount,
    lastRedeemedAt:
      invite.lastRedeemedAt === null
        ? null
        : new Date(invite.lastRedeemedAt).toISOString(),
    revokedAt:
      invite.revokedAt === null ? null : new Date(invite.revokedAt).toISOString(),
    status: invite.status,
  };
}

function serializeSession(session: SessionSummary): Record<string, unknown> {
  return {
    id: session.id,
    inviteId: session.inviteId,
    inviteLabel: session.inviteLabel,
    createdAt: new Date(session.createdAt).toISOString(),
    lastSeenAt: new Date(session.lastSeenAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    revokedAt:
      session.revokedAt === null ? null : new Date(session.revokedAt).toISOString(),
    status: session.status,
  };
}

export interface AdminRouteOptions {
  config: AccessConfig;
  database: AccessDatabase;
  accessJwtVerifier: AccessJwtVerifier;
  rateLimiter: RequestHandler;
  now?: () => number;
}

export function createAdminRoutes(options: AdminRouteOptions): Router {
  const router = Router();
  const now = options.now ?? Date.now;

  router.use(requireHost(options.config.adminHost));
  router.use(options.rateLimiter);
  router.use(requireAdminAccess(options.config, options.accessJwtVerifier));

  router.get("/", (_request, response) => {
    response.type("html").send(
      renderAdminPage({
        nonce: response.locals.cspNonce as string,
        invites: listInvites(options.database, now()),
        sessions: listSessions(options.database, now()),
      }),
    );
  });

  router.get("/api/invites", (_request, response) => {
    response.json({
      invites: listInvites(options.database, now()).map(serializeInvite),
    });
  });

  router.get("/api/sessions", (_request, response) => {
    response.json({
      sessions: listSessions(options.database, now()).map(serializeSession),
    });
  });

  const writeSecurity = [
    requireWriteCsrf(options.config.adminOrigin),
    requireJsonContentType,
  ];

  router.post("/api/invites", ...writeSecurity, (request, response) => {
    const input = createInviteSchema.safeParse(request.body);
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.header("Idempotency-Key"),
    );
    if (!input.success || !idempotencyKey.success) {
      response.status(400).json({ error: "invalid_request" });
      return;
    }

    const created = createInviteIdempotent(
      options.database,
      input.data.label,
      idempotencyKey.data,
      now(),
    );
    if (created.replayed) {
      response.status(200).json({
        invite: serializeInvite(created.invite),
        replayed: true,
      });
      return;
    }
    if (created.code === null) {
      throw new Error("Fresh invitation result did not include plaintext");
    }
    response.status(201).json({
      code: created.code,
      invite: serializeInvite(created.invite),
      replayed: false,
    });
  });

  router.post("/api/invites/:id/revoke", ...writeSecurity, (request, response) => {
    const id = inviteIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(404).json({ error: "not_found" });
      return;
    }

    if (!revokeInvite(options.database, id.data, now())) {
      response.status(404).json({ error: "not_found" });
      return;
    }
    response.status(204).end();
  });

  router.post("/api/sessions/:id/revoke", ...writeSecurity, (request, response) => {
    const id = sessionIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(404).json({ error: "not_found" });
      return;
    }

    if (!revokeSession(options.database, id.data, now())) {
      response.status(404).json({ error: "not_found" });
      return;
    }
    response.status(204).end();
  });

  return router;
}
