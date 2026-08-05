import type { AccessDatabase } from "./db.js";

export const DEFAULT_MAX_CANVAS_MIB = 700;
export const MIN_MAX_CANVAS_MIB = 128;
export const MAX_MAX_CANVAS_MIB = 2_048;
export const MEBIBYTE = 1024 * 1024;

export interface RenderBudgetSetting {
  maxCanvasMiB: number;
  maxCanvasBytes: number;
  updatedAt: number;
}

interface RenderBudgetRow {
  max_canvas_mib: number;
  updated_at: number;
}

function validateMaxCanvasMiB(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < MIN_MAX_CANVAS_MIB
    || value > MAX_MAX_CANVAS_MIB
  ) {
    throw new RangeError(
      `Canvas budget must be an integer from ${MIN_MAX_CANVAS_MIB} to ${MAX_MAX_CANVAS_MIB} MiB`,
    );
  }
  return value;
}

function toSetting(row: RenderBudgetRow): RenderBudgetSetting {
  const maxCanvasMiB = validateMaxCanvasMiB(row.max_canvas_mib);
  if (!Number.isSafeInteger(row.updated_at) || row.updated_at < 0) {
    throw new Error("Stored render-budget timestamp is invalid");
  }
  return {
    maxCanvasMiB,
    maxCanvasBytes: maxCanvasMiB * MEBIBYTE,
    updatedAt: row.updated_at,
  };
}

export function readRenderBudgetSetting(database: AccessDatabase): RenderBudgetSetting {
  const row = database
    .prepare(
      `SELECT max_canvas_mib, updated_at
       FROM render_budget_settings
       WHERE singleton = 1`,
    )
    .get() as RenderBudgetRow | undefined;
  if (!row) throw new Error("Render-budget setting is missing");
  return toSetting(row);
}

export function updateRenderBudgetSetting(
  database: AccessDatabase,
  maxCanvasMiB: number,
  now = Date.now(),
): { previous: RenderBudgetSetting; current: RenderBudgetSetting } {
  const normalized = validateMaxCanvasMiB(maxCanvasMiB);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError("Render-budget update time must be a non-negative integer");
  }

  const transaction = database.transaction(() => {
    const previous = readRenderBudgetSetting(database);
    database
      .prepare(
        `UPDATE render_budget_settings
         SET max_canvas_mib = ?, updated_at = ?
         WHERE singleton = 1`,
      )
      .run(normalized, now);
    return {
      previous,
      current: readRenderBudgetSetting(database),
    };
  });
  return transaction.immediate();
}
