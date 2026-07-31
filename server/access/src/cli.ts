import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { openDatabase } from "./db.js";
import {
  createInvite,
  listInvites,
  listSessions,
  pruneSessions,
  revokeInvite,
  revokeSession,
} from "./store.js";

function usage(): never {
  console.error(
    "Usage: cli.ts create --label <label> | list | revoke <invite-id> | sessions list | sessions revoke <session-id> | maintenance | backup <output.sqlite>",
  );
  process.exit(2);
}

function readFlag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/access.sqlite");
if (command === "backup") {
  const [outputArgument, ...rest] = args;
  if (!outputArgument || rest.length > 0) usage();
  const outputPath = resolve(outputArgument);
  if (outputPath === databasePath) {
    console.error("Backup destination must differ from the live database");
    process.exitCode = 1;
  } else {
    process.umask(0o077);
    mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
    const source = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      source.pragma("busy_timeout = 5000");
      await source.backup(outputPath);
    } finally {
      source.close();
    }

    // Online backups inherit WAL mode from the source. Normalize the completed
    // snapshot so it remains verifiable and restorable from a read-only mount.
    const snapshot = new Database(outputPath, { fileMustExist: true });
    try {
      const journalMode = snapshot.pragma("journal_mode = DELETE", {
        simple: true,
      });
      const integrity = snapshot.pragma("integrity_check", { simple: true });
      if (journalMode !== "delete" || integrity !== "ok") {
        throw new Error("Backup snapshot normalization failed");
      }
    } finally {
      snapshot.close();
    }
    chmodSync(outputPath, 0o600);
    process.stdout.write(`${outputPath}\n`);
  }
} else {
  const database = openDatabase(databasePath);
  try {
    switch (command) {
    case "create": {
      const label = readFlag(args, "--label");
      if (!label) usage();
      const created = createInvite(database, label);
      process.stdout.write(
        JSON.stringify(
          {
            id: created.invite.id,
            label: created.invite.label,
            code: created.code,
            redeemBy: new Date(created.invite.redeemBy).toISOString(),
          },
          null,
          2,
        ) + "\n",
      );
      break;
    }
    case "list": {
      if (args.length > 0) usage();
      process.stdout.write(
        JSON.stringify(
          listInvites(database).map((invite) => ({
            id: invite.id,
            label: invite.label,
            status: invite.status,
            createdAt: new Date(invite.createdAt).toISOString(),
            redeemBy: new Date(invite.redeemBy).toISOString(),
            redemptionCount: invite.redemptionCount,
          })),
          null,
          2,
        ) + "\n",
      );
      break;
    }
    case "revoke": {
      const [inviteId, ...rest] = args;
      if (!inviteId || rest.length > 0) usage();
      if (!revokeInvite(database, inviteId)) {
        console.error("Invitation not found");
        process.exitCode = 1;
      }
      break;
    }
    case "sessions": {
      const [sessionCommand, sessionId, ...rest] = args;
      if (sessionCommand === "list" && sessionId === undefined && rest.length === 0) {
        process.stdout.write(
          JSON.stringify(
            listSessions(database).map((session) => ({
              id: session.id,
              inviteId: session.inviteId,
              inviteLabel: session.inviteLabel,
              status: session.status,
              createdAt: new Date(session.createdAt).toISOString(),
              lastSeenAt: new Date(session.lastSeenAt).toISOString(),
              expiresAt: new Date(session.expiresAt).toISOString(),
              revokedAt:
                session.revokedAt === null
                  ? null
                  : new Date(session.revokedAt).toISOString(),
            })),
            null,
            2,
          ) + "\n",
        );
        break;
      }
      if (sessionCommand === "revoke" && sessionId && rest.length === 0) {
        if (!revokeSession(database, sessionId)) {
          console.error("Session not found");
          process.exitCode = 1;
        }
        break;
      }
      usage();
    }
    case "maintenance": {
      if (args.length > 0) usage();
      process.stdout.write(
        JSON.stringify({ deletedSessions: pruneSessions(database) }) + "\n",
      );
      break;
    }
    default:
      usage();
    }
  } finally {
    database.close();
  }
}
