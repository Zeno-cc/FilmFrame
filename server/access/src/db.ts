import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { runMigrations } from "./migrate.js";

export type AccessDatabase = Database.Database;

export interface OpenDatabaseOptions {
  migrationsDirectory?: string;
}

export class DatabaseUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super("Database is unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

export function openDatabase(
  databasePath: string,
  options: OpenDatabaseOptions = {},
): AccessDatabase {
  process.umask(0o077);
  if (databasePath !== ":memory:") {
    const databaseDirectory = dirname(databasePath);
    mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });
    chmodSync(databaseDirectory, 0o700);
  }

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");

  runMigrations(
    database,
    options.migrationsDirectory ?? resolve(process.cwd(), "migrations"),
  );

  if (databasePath !== ":memory:") {
    for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  }

  return database;
}

export function assertDatabaseReady(database: AccessDatabase): void {
  const probeId = randomBytes(16).toString("hex");
  const transaction = database.transaction(() => {
    database
      .prepare("INSERT INTO health_checks (id, checked_at) VALUES (?, ?)")
      .run(probeId, Date.now());
    const result = database
      .prepare("SELECT checked_at FROM health_checks WHERE id = ?")
      .get(probeId) as { checked_at: number } | undefined;
    if (!result) throw new DatabaseUnavailableError();
    database.prepare("DELETE FROM health_checks WHERE id = ?").run(probeId);
  });

  try {
    transaction.immediate();
  } catch {
    throw new DatabaseUnavailableError();
  }
}
