import { createHash } from "node:crypto";
import { Router, type Response } from "express";
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
  InvalidInviteScheduleError,
  listBatches,
  listInvites,
  listSessions,
  revokeInvite,
  revokeBatch,
  revokeSession,
  type InviteScheduleInput,
  type InviteSummary,
  type BatchSummary,
  type SessionSummary,
} from "../store.js";
import { listPasskeys, revokePasskey } from "../passkeyStore.js";
import { renderAdminPage } from "../views/html.js";
import {
  UpdaterClientError,
  type UpdaterClient,
  type UpdaterErrorCode,
} from "../updaterClient.js";
import {
  MAX_MAX_CANVAS_MIB,
  MIN_MAX_CANVAS_MIB,
  readRenderBudgetSetting,
  updateRenderBudgetSetting,
  type RenderBudgetSetting,
} from "../runtimeConfig.js";

const scheduleFields = {
  redeemFrom: z.iso.datetime({ offset: true }).optional(),
  redeemBy: z.iso.datetime({ offset: true }).optional(),
};
const createInviteSchema = z
  .object({ label: z.string().trim().min(1).max(80), ...scheduleFields })
  .strict();
const createBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    count: z.number().int().min(1).max(50),
    ...scheduleFields,
  })
  .strict();

export function batchCreationRequestCount(input: unknown): number | null {
  const parsed = createBatchSchema.safeParse(input);
  return parsed.success ? parsed.data.count : null;
}

const inviteIdSchema = z.uuid();
const idempotencyKeySchema = z.uuid();
const sessionIdSchema = z.uuid();
const batchIdSchema = z.uuid();
const updateVersionSchema = z
  .object({
    version: z
      .string()
      .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
  })
  .strict();
const historyLimitSchema = z
  .string()
  .regex(/^[1-9]\d?$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(50));
const emptyObjectSchema = z.object({}).strict();
const renderBudgetSchema = z
  .object({
    maxCanvasMiB: z.number().int().min(MIN_MAX_CANVAS_MIB).max(MAX_MAX_CANVAS_MIB),
  })
  .strict();

const updaterErrorStatuses: Record<UpdaterErrorCode, number> = {
  invalid_request: 400,
  request_too_large: 502,
  peer_forbidden: 503,
  update_busy: 409,
  idempotency_conflict: 409,
  job_not_found: 404,
  release_not_found: 404,
  release_untrusted: 422,
  updater_upgrade_required: 422,
  migration_incompatible: 422,
  updater_unavailable: 503,
  internal_error: 502,
};

function sendUpdaterError(error: unknown, response: Response): boolean {
  if (!(error instanceof UpdaterClientError)) return false;
  response.status(updaterErrorStatuses[error.code]).json({
    error: error.code,
    retryable: error.retryable,
  });
  return true;
}

function requireUpdater(client: UpdaterClient | null): UpdaterClient {
  if (!client) throw new UpdaterClientError("updater_unavailable", true);
  return client;
}

function administratorHash(response: Response, issuer: string): string {
  const identity = response.locals.adminIdentity as { subject?: unknown } | undefined;
  if (!identity || typeof identity.subject !== "string" || !identity.subject) {
    throw new UpdaterClientError("invalid_request", false);
  }
  return createHash("sha256")
    .update(issuer)
    .update("\0")
    .update(identity.subject)
    .digest("hex");
}

function serializeInvite(invite: InviteSummary): Record<string, unknown> {
  return {
    id: invite.id,
    label: invite.label,
    createdAt: new Date(invite.createdAt).toISOString(),
    redeemFrom: new Date(invite.redeemFrom).toISOString(),
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
    redeemable: invite.redeemable,
    activeSessionCount: invite.activeSessionCount,
    batchId: invite.batchId,
    batchName: invite.batchName,
    batchPosition: invite.batchPosition,
  };
}

function scheduleInput(input: {
  redeemFrom?: string | undefined;
  redeemBy?: string | undefined;
}): InviteScheduleInput {
  const schedule: InviteScheduleInput = {};
  if (input.redeemFrom !== undefined) schedule.redeemFrom = Date.parse(input.redeemFrom);
  if (input.redeemBy !== undefined) schedule.redeemBy = Date.parse(input.redeemBy);
  return schedule;
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

function serializeRenderBudget(setting: RenderBudgetSetting): Record<string, unknown> {
  return {
    maxCanvasMiB: setting.maxCanvasMiB,
    maxCanvasBytes: setting.maxCanvasBytes,
    updatedAt: setting.updatedAt,
  };
}

export interface AdminRouteOptions {
  config: AccessConfig;
  database: AccessDatabase;
  accessJwtVerifier: AccessJwtVerifier;
  rateLimiter: RequestHandler;
  batchRateLimiter: RequestHandler;
  updateRateLimiter: RequestHandler;
  updaterClient: UpdaterClient | null;
  now?: () => number;
}

export function createAdminRoutes(options: AdminRouteOptions): Router {
  const router = Router();
  const now = options.now ?? Date.now;

  router.use(requireHost(options.config.adminHost));
  router.use(options.rateLimiter);
  router.use(requireAdminAccess(options.config, options.accessJwtVerifier));

  router.get("/", (_request, response) => {
    const requestNow = now();
    response.type("html").send(
      renderAdminPage({
        nonce: response.locals.cspNonce as string,
        invites: listInvites(options.database, requestNow),
        batches: listBatches(options.database, requestNow),
        sessions: listSessions(options.database, requestNow),
        passkeys: listPasskeys(options.database),
        renderBudget: readRenderBudgetSetting(options.database),
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

  router.get("/api/passkeys", (_request, response) => {
    response.json({
      passkeys: listPasskeys(options.database).map((passkey) => ({
        id: passkey.id,
        credentialId: passkey.credentialIdShort,
        inviteId: passkey.inviteId,
        inviteLabel: passkey.inviteLabel,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        createdAt: new Date(passkey.createdAt).toISOString(),
        lastUsedAt: passkey.lastUsedAt === null ? null : new Date(passkey.lastUsedAt).toISOString(),
        revokedAt: passkey.revokedAt === null ? null : new Date(passkey.revokedAt).toISOString(),
        status: passkey.status,
      })),
    });
  });

  router.post(
    "/api/passkeys/:id/revoke",
    ...writeSecurity,
    (request, response) => {
      const id = z.uuid().safeParse(request.params.id);
      if (!id.success || !revokePasskey(options.database, id.data, now())) {
        response.status(404).json({ error: "not_found" });
        return;
      }
      response.status(204).end();
      emitAuditEvent(options.config.nodeEnv, {
        requestId: String(response.locals.requestId),
        action: "passkey.revoke",
        targetType: "passkey",
        targetId: id.data,
        affected: { passkeys: 1 },
        timestamp: now(),
      });
    },
  );

  router.get("/api/invite-batches", (_request, response) => {
    response.json({
      batches: listBatches(options.database, now()).map(serializeBatch),
    });
  });

  router.get("/api/runtime-settings/render-budget", (_request, response) => {
    response.json({
      renderBudget: serializeRenderBudget(readRenderBudgetSetting(options.database)),
    });
  });

  router.put(
    "/api/runtime-settings/render-budget",
    ...writeSecurity,
    (request, response) => {
      const input = renderBudgetSchema.safeParse(request.body);
      if (!input.success) {
        response.status(400).json({ error: "invalid_request" });
        return;
      }

      const requestNow = now();
      const result = updateRenderBudgetSetting(
        options.database,
        input.data.maxCanvasMiB,
        requestNow,
      );
      response.json({ renderBudget: serializeRenderBudget(result.current) });
      emitAuditEvent(options.config.nodeEnv, {
        requestId: String(response.locals.requestId),
        action: "runtime_setting.update",
        targetType: "runtime_setting",
        targetId: "render_budget",
        affected: {
          previousMaxCanvasMiB: result.previous.maxCanvasMiB,
          maxCanvasMiB: result.current.maxCanvasMiB,
        },
        timestamp: requestNow,
      });
    },
  );

  router.get("/api/system-update", async (_request, response) => {
    response.locals.operation = "system_update_status";
    try {
      response.json(await requireUpdater(options.updaterClient).check(false));
    } catch (error) {
      if (!sendUpdaterError(error, response)) throw error;
    }
  });

  router.post(
    "/api/system-update/check",
    ...writeSecurity,
    options.updateRateLimiter,
    async (request, response) => {
      response.locals.operation = "system_update_check";
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.header("Idempotency-Key"),
      );
      if (!idempotencyKey.success || !emptyObjectSchema.safeParse(request.body).success) {
        response.status(400).json({ error: "invalid_request" });
        return;
      }
      try {
        const result = await requireUpdater(options.updaterClient).check(true);
        response.json(result);
        emitAuditEvent(options.config.nodeEnv, {
          requestId: String(response.locals.requestId),
          action: "system_update.check",
          targetType: "system_update",
          targetId: result.candidate?.version ?? result.current.version,
          affected: { checks: 1 },
          timestamp: now(),
        });
      } catch (error) {
        if (!sendUpdaterError(error, response)) throw error;
      }
    },
  );

  router.post(
    "/api/system-update/jobs",
    ...writeSecurity,
    options.updateRateLimiter,
    async (request, response) => {
      response.locals.operation = "system_update_create";
      const input = updateVersionSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.header("Idempotency-Key"),
      );
      if (!input.success || !idempotencyKey.success) {
        response.status(400).json({ error: "invalid_request" });
        return;
      }
      try {
        const job = await requireUpdater(options.updaterClient).createJob({
          version: input.data.version,
          idempotencyKey: idempotencyKey.data,
          actorHash: administratorHash(response, options.config.accessIssuer),
        });
        response.status(202).json({ job });
        emitAuditEvent(options.config.nodeEnv, {
          requestId: String(response.locals.requestId),
          action: "system_update.create",
          targetType: "system_update",
          targetId: job.id,
          affected: { requests: 1 },
          timestamp: now(),
        });
      } catch (error) {
        if (!sendUpdaterError(error, response)) throw error;
      }
    },
  );

  router.get("/api/system-update/jobs/:id", async (request, response) => {
    response.locals.operation = "system_update_job";
    const id = z.uuid().safeParse(request.params.id);
    if (!id.success) {
      response.status(404).json({ error: "job_not_found" });
      return;
    }
    try {
      response.json({ job: await requireUpdater(options.updaterClient).getJob(id.data) });
    } catch (error) {
      if (!sendUpdaterError(error, response)) throw error;
    }
  });

  router.get("/api/system-update/history", async (request, response) => {
    response.locals.operation = "system_update_history";
    const rawLimit = request.query.limit;
    const limit = rawLimit === undefined ? 20 : historyLimitSchema.safeParse(rawLimit);
    if (typeof limit !== "number" && !limit.success) {
      response.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      response.json(
        await requireUpdater(options.updaterClient).listHistory(
          typeof limit === "number" ? limit : limit.data,
        ),
      );
    } catch (error) {
      if (!sendUpdaterError(error, response)) throw error;
    }
  });

  router.post("/api/invites", ...writeSecurity, (request, response) => {
    const input = createInviteSchema.safeParse(request.body);
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.header("Idempotency-Key"),
    );
    if (!input.success || !idempotencyKey.success) {
      response.status(400).json({ error: "invalid_request" });
      return;
    }

    const requestNow = now();
    let created;
    try {
      created = createInviteIdempotent(
        options.database,
        input.data.label,
        idempotencyKey.data,
        requestNow,
        scheduleInput(input.data),
      );
    } catch (error) {
      if (error instanceof InvalidInviteScheduleError) {
        response.status(400).json({ error: "invalid_request" });
        return;
      }
      throw error;
    }
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
      timestamp: requestNow,
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

      const requestNow = now();
      try {
        const result = createInviteBatchIdempotent(
          options.database,
          input.data.name,
          input.data.count,
          idempotencyKey.data,
          requestNow,
          scheduleInput(input.data),
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
          timestamp: requestNow,
        });
      } catch (error) {
        if (error instanceof BatchIdempotencyConflictError) {
          response.status(409).json({ error: "idempotency_conflict" });
          return;
        }
        if (error instanceof InvalidInviteScheduleError) {
          response.status(400).json({ error: "invalid_request" });
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
