import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  UnixUpdaterClient,
  UpdaterClientError,
  type UpdateJob,
} from "../src/updaterClient.js";

const now = "2026-08-02T04:03:06Z";
const revision = "a".repeat(40);
const idempotencyKey = "b5e10f11-2a05-430c-9c5e-2d19b3a5e6d0"; // gitleaks:allow

function job(overrides: Partial<UpdateJob> = {}): UpdateJob {
  return {
    id: "fa3b6d3e-fcec-4935-bfc3-1ba973267c08",
    targetVersion: "1.1.0",
    targetRevision: revision,
    state: "queued",
    previousVersion: "1.0.0",
    previousRevision: "b".repeat(40),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    retryOf: null,
    ...overrides,
  };
}

function systemUpdate(activeJob: UpdateJob | null = null) {
  return {
    current: {
      version: "1.0.0",
      revision: "b".repeat(40),
      healthy: true,
      schemaVersion: 3,
    },
    candidate: {
      version: "1.1.0",
      revision,
      publishedAt: now,
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
    checkedAt: now,
    updaterVersion: "1.0.0",
  };
}

interface RequestEnvelope {
  protocolVersion: number;
  requestId: string;
  action: string;
  params: Record<string, unknown>;
}

async function withSocketServer(
  respond: (request: RequestEnvelope, socket: Socket) => void,
  run: (client: UnixUpdaterClient) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "filmframe-updater-test-"));
  const socketPath = join(directory, "updater.sock");
  const server = createServer((socket) => {
    let request = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      request += chunk;
      const newline = request.indexOf("\n");
      if (newline === -1) return;
      respond(JSON.parse(request.slice(0, newline)) as RequestEnvelope, socket);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  try {
    await run(new UnixUpdaterClient({ socketPath, timeoutMs: 250 }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
}

function success(request: RequestEnvelope, result: unknown): string {
  return `${JSON.stringify({
    protocolVersion: 1,
    requestId: request.requestId,
    ok: true,
    result,
  })}\n`;
}

describe("Unix updater client", () => {
  it("uses the fixed protocol envelope and validates every successful result", async () => {
    const actions: string[] = [];
    await withSocketServer(
      (request, socket) => {
        assert.equal(request.protocolVersion, 1);
        assert.equal(typeof request.requestId, "string");
        assert.deepEqual(Object.keys(request).sort(), [
          "action",
          "params",
          "protocolVersion",
          "requestId",
        ]);
        actions.push(request.action);
        const results: Record<string, unknown> = {
          check: systemUpdate(job()),
          create_job: job(),
          get_job: job(),
          get_active_job: job(),
          list_history: { jobs: [job({ state: "succeeded", finishedAt: now })] },
        };
        socket.end(success(request, results[request.action]));
      },
      async (client) => {
        const checked = await client.check(true);
        assert.equal(checked.candidate?.version, "1.1.0");
        const created = await client.createJob({
          version: "1.1.0",
          idempotencyKey,
          actorHash: "c".repeat(64),
        });
        assert.equal(created.id, job().id);
        assert.equal((await client.getJob(job().id)).targetVersion, "1.1.0");
        assert.equal((await client.getActiveJob())?.state, "queued");
        assert.equal((await client.listHistory(20)).jobs.length, 1);
      },
    );
    assert.deepEqual(actions, [
      "check",
      "create_job",
      "get_job",
      "get_active_job",
      "list_history",
    ]);
  });

  it("passes only the allowlisted create-job identity projection", async () => {
    await withSocketServer(
      (request, socket) => {
        assert.equal(request.action, "create_job");
        assert.deepEqual(request.params, {
          version: "1.1.0",
          idempotencyKey,
          actorHash: "c".repeat(64),
        });
        assert.equal(JSON.stringify(request).includes("email"), false);
        assert.equal(JSON.stringify(request).includes("token"), false);
        socket.end(success(request, job()));
      },
      async (client) => {
        await client.createJob({
          version: "1.1.0",
          idempotencyKey,
          actorHash: "c".repeat(64),
        });
      },
    );
  });

  it("maps fixed updater errors without exposing the remote message", async () => {
    await withSocketServer(
      (request, socket) => {
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: request.requestId,
            ok: false,
            error: {
              code: "update_busy",
              message: "Another update is already active.",
              retryable: false,
            },
          })}\n`,
        );
      },
      async (client) => {
        await assert.rejects(client.check(), (error: unknown) => {
          assert.ok(error instanceof UpdaterClientError);
          assert.equal(error.code, "update_busy");
          assert.equal(error.retryable, false);
          assert.equal(error.message.includes("active"), true);
          return true;
        });
      },
    );
  });

  it("fails closed on unknown response fields, mismatched IDs, and oversized data", async () => {
    for (const variant of ["unknown", "mismatch", "oversized"] as const) {
      await withSocketServer(
        (request, socket) => {
          if (variant === "unknown") {
            socket.end(
              `${JSON.stringify({
                protocolVersion: 1,
                requestId: request.requestId,
                ok: true,
                result: { ...systemUpdate(), secretPath: "/opt/private" },
              })}\n`,
            );
            return;
          }
          if (variant === "mismatch") {
            socket.end(
              `${JSON.stringify({
                protocolVersion: 1,
                requestId: "a0a783c6-ce29-4690-9380-1d48faf56a97",
                ok: true,
                result: systemUpdate(),
              })}\n`,
            );
            return;
          }
          socket.end(`${"x".repeat(65 * 1024)}\n`);
        },
        async (client) => {
          await assert.rejects(
            client.check(),
            (error: unknown) =>
              error instanceof UpdaterClientError && error.code === "updater_unavailable",
          );
        },
      );
    }
  });

  it("bounds timeouts and unavailable socket failures", async () => {
    await withSocketServer(
      () => {
        // Intentionally leave the connection open until the client timeout.
      },
      async (client) => {
        await assert.rejects(
          client.check(),
          (error: unknown) =>
            error instanceof UpdaterClientError && error.code === "updater_unavailable",
        );
      },
    );

    const missing = new UnixUpdaterClient({
      socketPath: join(tmpdir(), `missing-${process.pid}.sock`),
      timeoutMs: 100,
    });
    await assert.rejects(
      missing.check(),
      (error: unknown) =>
        error instanceof UpdaterClientError && error.code === "updater_unavailable",
    );
  });
});
