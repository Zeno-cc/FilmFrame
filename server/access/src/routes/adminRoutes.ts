import { Router } from "express";
import { z } from "zod";

import type { AccessJwtVerifier } from "../accessJwt.js";
import { emitAuditEvent } from "../audit.js";
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
  createInviteBatchIdempotent,
  BatchIdempotencyConflictError,
  listBatches,
  listInvites,
  listSessions,
  revokeInvite,
  revokeBatch,
  revokeSession,
  type InviteSummary,
  type BatchSummary,
  type SessionSummary,
} from "../store.js";
import { renderAdminPage } from "../views/html.js";

const createInviteSchema = z.object({ label: z.string().trim().min(1).max(80) }).strict();
const createBatchSchema = z
  .object({ name: z.string().trim().min(1).max(64), count: z.number().int().min(1).max(50) })
  .strict();
const inviteIdSchema = z.uuid();
const idempotencyKeySchema = z.uuid();
const sessionIdSchema = z.uuid();
const batchIdSchema = z.uuid();

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
    batchId: invite.batchId,
    batchName: invite.batchName,
    batchPosition: invite.batchPosition,
  };
}

function serializeBatch(batch: BatchSummary): Record<string, unknown> {
  return {
    id: batch.id,
    name: batch.name,
    inviteCount: batch.inviteCount,
    createdAt: new Date(batch.createdAt).toISOString(),
    revokedAt:
      batch.revokedAt === null ? null : new Date(batch.revokedAt).toISOString(),
    activeSessionCount: batch.activeSessionCount,
    status: batch.revokedAt === null ? "active" : "revoked",
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
  batchRateLimiter: RequestHandler;
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
        batches: listBatches(options.database, now()),
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

  router.get("/api/invite-batches", (_request, response) => {
    response.json({
      batches: listBatches(options.database, now()).map(serializeBatch),
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
    emitAuditEvent(options.config.nodeEnv, {
      requestId: String(response.locals.requestId),
      action: "invite.create",
      targetType: "invite",
      targetId: created.invite.id,
      affected: { invites: 1 },
      timestamp: now(),
    });
  });

  router.post(
    "/api/invite-batches",
    ...writeSecurity,
    options.batchRateLimiter,
    (request, response) => {
      const input = createBatchSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.header("Idempotency-Key"),
      );
      if (!input.success || !idempotencyKey.success) {
        response.status(400).json({ error: "invalid_request" });
        return;
      }

      try {
        const result = createInviteBatchIdempotent(
          options.database,
          input.data.name,
          input.data.count,
          idempotencyKey.data,
          now(),
        );
        if (result.replayed) {
          response.status(200).json({
            batch: serializeBatch(result.batch),
            invites: result.invites.map(serializeInvite),
            replayed: true,
          });
          return;
        }
        response.status(201).json({
          batch: serializeBatch(result.batch),
          codes: result.created.map(({ code, invite }) => ({
            code,
            invite: serializeInvite(invite),
          })),
          replayed: false,
        });
        emitAuditEvent(options.config.nodeEnv, {
          requestId: String(response.locals.requestId),
          action: "invite_batch.create",
          targetType: "invite_batch",
          targetId: result.batch.id,
          affected: { invites: result.batch.inviteCount },
          timestamp: now(),
        });
      } catch (error) {
        if (error instanceof BatchIdempotencyConflictError) {
          response.status(409).json({ error: "idempotency_conflict" });
          return;
        }
        throw error;
      }
    },
  );

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
    emitAuditEvent(options.config.nodeEnv, {
      requestId: String(response.locals.requestId),
      action: "invite.revoke",
      targetType: "invite",
      targetId: id.data,
      affected: { invites: 1 },
      timestamp: now(),
    });
  });

  router.post(
    "/api/invite-batches/:id/revoke",
    ...writeSecurity,
    (request, response) => {
      const id = batchIdSchema.safeParse(request.params.id);
      if (!id.success) {
        response.status(404).json({ error: "not_found" });
        return;
      }
      const result = revokeBatch(options.database, id.data, now());
      if (!result) {
        response.status(404).json({ error: "not_found" });
        return;
      }
      response.json(result);
      emitAuditEvent(options.config.nodeEnv, {
        requestId: String(response.locals.requestId),
        action: "invite_batch.revoke",
        targetType: "invite_batch",
        targetId: id.data,
        affected: {
          invites: result.revokedInviteCount,
          sessions: result.revokedSessionCount,
        },
        timestamp: now(),
      });
    },
  );

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
    emitAuditEvent(options.config.nodeEnv, {
      requestId: String(response.locals.requestId),
      action: "session.revoke",
      targetType: "session",
      targetId: id.data,
      affected: { sessions: 1 },
      timestamp: now(),
    });
  });

  return router;
}
