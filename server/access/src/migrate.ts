import type Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;

export function runMigrations(
  database: Database.Database,
  migrationsDirectory = resolve(process.cwd(), "migrations"),
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    database
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const migrations = readdirSync(migrationsDirectory)
    .map((name) => {
      const match = MIGRATION_FILE.exec(name);
      return match ? { name, version: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; version: number } => entry !== null)
    .sort((left, right) => left.version - right.version);

  const versions = new Set<number>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
    if (applied.has(migration.version)) continue;

    const sql = readFileSync(resolve(migrationsDirectory, migration.name), "utf8");
    database.transaction(() => {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(migration.version, Date.now());
    })();
  }
}
