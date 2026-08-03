import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";

import { z } from "zod";

const REQUEST_LIMIT_BYTES = 16 * 1024;
const RESPONSE_LIMIT_BYTES = 64 * 1024;

const versionSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
const revisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const uuidSchema = z.uuid();
const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)));

export const updaterErrorCodeSchema = z.enum([
  "invalid_request",
  "request_too_large",
  "peer_forbidden",
  "update_busy",
  "idempotency_conflict",
  "job_not_found",
  "release_not_found",
  "release_untrusted",
  "updater_upgrade_required",
  "migration_incompatible",
  "updater_unavailable",
  "internal_error",
]);

export type UpdaterErrorCode = z.infer<typeof updaterErrorCodeSchema>;

export const updateJobErrorCodeSchema = z.enum([
  "release_untrusted",
  "updater_upgrade_required",
  "migration_incompatible",
  "preflight_failed",
  "artifact_pull_failed",
  "staging_failed",
  "migration_rehearsal_failed",
  "backup_failed",
  "switch_failed",
  "health_check_failed",
  "rollback_failed",
  "interrupted",
]);

export const updateJobStateSchema = z.enum([
  "queued",
  "verifying_release",
  "pulling_artifacts",
  "staging_release",
  "rehearsing_migration",
  "backing_up",
  "ready_to_switch",
  "switching",
  "verifying_loopback",
  "verifying_origin",
  "verifying_public",
  "rolling_back",
  "succeeded",
  "failed_pre_switch",
  "rolled_back",
  "recovery_required",
]);

export type UpdateJobState = z.infer<typeof updateJobStateSchema>;

const nullableVersionSchema = versionSchema.nullable();
const nullableRevisionSchema = revisionSchema.nullable();
const nullableTimestampSchema = timestampSchema.nullable();

export const updateJobSchema = z
  .object({
    id: uuidSchema,
    targetVersion: versionSchema,
    targetRevision: revisionSchema,
    state: updateJobStateSchema,
    previousVersion: nullableVersionSchema,
    previousRevision: nullableRevisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    startedAt: nullableTimestampSchema,
    finishedAt: nullableTimestampSchema,
    errorCode: updateJobErrorCodeSchema.nullable(),
    retryOf: uuidSchema.nullable(),
  })
  .strict()
  .superRefine((job, context) => {
    const final = [
      "succeeded",
      "failed_pre_switch",
      "rolled_back",
      "recovery_required",
    ].includes(job.state);
    if (final && job.finishedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "final jobs require a finish time",
      });
    }
    if (job.state === "succeeded" && job.errorCode !== null) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "successful jobs cannot contain an error",
      });
    }
    if (final && job.state !== "succeeded" && job.errorCode === null) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "failed jobs require a safe error code",
      });
    }
  });

export type UpdateJob = z.infer<typeof updateJobSchema>;

const currentReleaseSchema = z
  .object({
    version: versionSchema,
    revision: revisionSchema,
    healthy: z.boolean(),
    schemaVersion: z.number().int().min(1),
  })
  .strict();

const candidateReleaseSchema = z
  .object({
    version: versionSchema,
    revision: revisionSchema,
    publishedAt: timestampSchema,
    summaryZh: z
      .array(
        z
          .object({
            kind: z.enum(["feature", "fix", "security"]),
            text: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    database: z
      .object({
        schemaFrom: z.number().int().min(1),
        schemaTo: z.number().int().min(1),
        rollbackFloor: versionSchema,
        backwardCompatible: z.boolean(),
      })
      .strict(),
    installable: z.boolean(),
    blockedReason: z
      .enum([
        "release_untrusted",
        "updater_upgrade_required",
        "migration_incompatible",
      ])
      .optional(),
    releaseUrl: z
      .string()
      .url()
      .regex(
        /^https:\/\/github\.com\/Zeno-cc\/FilmFrame\/releases\/tag\/[A-Za-z0-9._-]+$/,
      )
      .optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.installable && candidate.blockedReason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["blockedReason"],
        message: "installable releases cannot have a blocked reason",
      });
    }
    if (!candidate.installable && candidate.blockedReason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["blockedReason"],
        message: "blocked releases require a reason",
      });
    }
    if (candidate.installable && !candidate.database.backwardCompatible) {
      context.addIssue({
        code: "custom",
        path: ["database", "backwardCompatible"],
        message: "one-click releases must support application rollback",
      });
    }
    if (candidate.database.schemaTo < candidate.database.schemaFrom) {
      context.addIssue({
        code: "custom",
        path: ["database", "schemaTo"],
        message: "schema versions cannot move backwards",
      });
    }
  });

export const systemUpdateSchema = z
  .object({
    current: currentReleaseSchema,
    candidate: candidateReleaseSchema.nullable(),
    activeJob: updateJobSchema.nullable(),
    checkedAt: timestampSchema,
    updaterVersion: versionSchema,
  })
  .strict();

export type SystemUpdate = z.infer<typeof systemUpdateSchema>;

const historySchema = z.object({ jobs: z.array(updateJobSchema).max(50) }).strict();
export type UpdateHistory = z.infer<typeof historySchema>;

const successEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(1),
    requestId: uuidSchema,
    ok: z.literal(true),
    result: z.unknown(),
  })
  .strict();

const errorEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(1),
    requestId: uuidSchema.nullable(),
    ok: z.literal(false),
    error: z
      .object({
        code: updaterErrorCodeSchema,
        message: z.string().min(1).max(160),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

const responseEnvelopeSchema = z.discriminatedUnion("ok", [
  successEnvelopeSchema,
  errorEnvelopeSchema,
]);

type UpdaterAction = keyof typeof requestParamsSchemas;

const requestParamsSchemas = {
  check: z.object({ force: z.boolean().optional() }).strict(),
  create_job: z
    .object({
      version: versionSchema,
      idempotencyKey: uuidSchema,
      actorHash: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  get_job: z.object({ jobId: uuidSchema }).strict(),
  get_active_job: z.object({}).strict(),
  list_history: z.object({ limit: z.number().int().min(1).max(50).optional() }).strict(),
} as const;

const SAFE_ERROR_MESSAGES: Record<UpdaterErrorCode, string> = {
  invalid_request: "Updater rejected the request",
  request_too_large: "Updater request limit exceeded",
  peer_forbidden: "Updater rejected the caller",
  update_busy: "Another update is active",
  idempotency_conflict: "Idempotency key conflict",
  job_not_found: "Update job not found",
  release_not_found: "Release not found",
  release_untrusted: "Release verification failed",
  updater_upgrade_required: "Updater maintenance is required",
  migration_incompatible: "Release migration is incompatible",
  updater_unavailable: "Updater is unavailable",
  internal_error: "Updater could not complete the request",
};

export class UpdaterClientError extends Error {
  constructor(
    readonly code: UpdaterErrorCode,
    readonly retryable: boolean,
  ) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "UpdaterClientError";
  }
}

export interface UpdaterClient {
  check(force?: boolean): Promise<SystemUpdate>;
  createJob(input: {
    version: string;
    idempotencyKey: string;
    actorHash: string;
  }): Promise<UpdateJob>;
  getJob(jobId: string): Promise<UpdateJob>;
  getActiveJob(): Promise<UpdateJob | null>;
  listHistory(limit?: number): Promise<UpdateHistory>;
}

export interface UnixUpdaterClientOptions {
  socketPath: string;
  timeoutMs: number;
}

export class UnixUpdaterClient implements UpdaterClient {
  constructor(private readonly options: UnixUpdaterClientOptions) {}

  async check(force = false): Promise<SystemUpdate> {
    return parseResult(
      systemUpdateSchema,
      await this.send("check", force ? { force: true } : {}),
    );
  }

  async createJob(input: {
    version: string;
    idempotencyKey: string;
    actorHash: string;
  }): Promise<UpdateJob> {
    return parseResult(updateJobSchema, await this.send("create_job", input));
  }

  async getJob(jobId: string): Promise<UpdateJob> {
    return parseResult(updateJobSchema, await this.send("get_job", { jobId }));
  }

  async getActiveJob(): Promise<UpdateJob | null> {
    return parseResult(
      updateJobSchema.nullable(),
      await this.send("get_active_job", {}),
    );
  }

  async listHistory(limit?: number): Promise<UpdateHistory> {
    return parseResult(
      historySchema,
      await this.send("list_history", limit === undefined ? {} : { limit }),
    );
  }

  private async send(action: UpdaterAction, params: unknown): Promise<unknown> {
    const parsedParams = requestParamsSchemas[action].safeParse(params);
    if (!parsedParams.success) {
      throw new UpdaterClientError("invalid_request", false);
    }
    const requestId = randomUUID();
    const request = JSON.stringify({
      protocolVersion: 1,
      requestId,
      action,
      params: parsedParams.data,
    });
    if (Buffer.byteLength(request, "utf8") + 1 > REQUEST_LIMIT_BYTES) {
      throw new UpdaterClientError("request_too_large", false);
    }

    const raw = await exchangeWithSocket(
      this.options.socketPath,
      `${request}\n`,
      this.options.timeoutMs,
    );
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new UpdaterClientError("updater_unavailable", true);
    }
    const envelope = responseEnvelopeSchema.safeParse(parsedJson);
    if (!envelope.success) {
      throw new UpdaterClientError("updater_unavailable", true);
    }
    if (envelope.data.requestId !== requestId) {
      throw new UpdaterClientError("updater_unavailable", true);
    }
    if (!envelope.data.ok) {
      throw new UpdaterClientError(
        envelope.data.error.code,
        envelope.data.error.retryable,
      );
    }
    return envelope.data.result;
  }
}

function parseResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new UpdaterClientError("updater_unavailable", true);
  }
  return parsed.data;
}

function exchangeWithSocket(
  socketPath: string,
  request: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: Socket | null = null;
    let settled = false;
    let size = 0;
    const chunks: Buffer[] = [];

    const fail = () => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      reject(new UpdaterClientError("updater_unavailable", true));
    };

    try {
      socket = createConnection({ path: socketPath });
    } catch {
      fail();
      return;
    }
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket?.write(request));
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > RESPONSE_LIMIT_BYTES) {
        fail();
        return;
      }
      chunks.push(chunk);
    });
    socket.once("end", () => {
      if (settled) return;
      const data = Buffer.concat(chunks);
      const newline = data.indexOf(0x0a);
      if (
        newline <= 0 ||
        data.subarray(newline + 1).toString("utf8").trim() !== ""
      ) {
        fail();
        return;
      }
      settled = true;
      resolve(data.subarray(0, newline).toString("utf8"));
    });
    socket.once("timeout", fail);
    socket.once("error", fail);
    socket.once("close", () => {
      if (!settled) fail();
    });
  });
}
