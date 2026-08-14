import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openDatabase } from "../src/db.js";
import {
  DEFAULT_MAX_CANVAS_MIB,
  MAX_MAX_CANVAS_MIB,
  MEBIBYTE,
  MIN_MAX_CANVAS_MIB,
  readRenderBudgetSetting,
  updateRenderBudgetSetting,
} from "../src/runtimeConfig.js";

describe("runtime render budget", () => {
  it("seeds the existing 700 MiB behavior through migration 006", () => {
    const database = openDatabase(":memory:");
    assert.deepEqual(readRenderBudgetSetting(database), {
      maxCanvasMiB: DEFAULT_MAX_CANVAS_MIB,
      maxCanvasBytes: DEFAULT_MAX_CANVAS_MIB * MEBIBYTE,
      updatedAt: 0,
    });
    assert.deepEqual(
      database.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
      [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }],
    );
    database.close();
  });

  it("persists the inclusive minimum and maximum with exact byte values", () => {
    const database = openDatabase(":memory:");
    const minimum = updateRenderBudgetSetting(database, MIN_MAX_CANVAS_MIB, 1_000);
    assert.equal(minimum.previous.maxCanvasMiB, DEFAULT_MAX_CANVAS_MIB);
    assert.deepEqual(minimum.current, {
      maxCanvasMiB: MIN_MAX_CANVAS_MIB,
      maxCanvasBytes: MIN_MAX_CANVAS_MIB * MEBIBYTE,
      updatedAt: 1_000,
    });

    const maximum = updateRenderBudgetSetting(database, MAX_MAX_CANVAS_MIB, 2_000);
    assert.equal(maximum.previous.maxCanvasMiB, MIN_MAX_CANVAS_MIB);
    assert.deepEqual(readRenderBudgetSetting(database), maximum.current);
    assert.equal(maximum.current.maxCanvasBytes, MAX_MAX_CANVAS_MIB * MEBIBYTE);
    database.close();
  });

  it("rejects invalid values and timestamps without changing the stored row", () => {
    const database = openDatabase(":memory:");
    for (const value of [127, 2_049, 700.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => updateRenderBudgetSetting(database, value, 1_000), RangeError);
    }
    assert.throws(
      () => updateRenderBudgetSetting(database, 900, -1),
      /non-negative integer/,
    );
    assert.equal(readRenderBudgetSetting(database).maxCanvasMiB, DEFAULT_MAX_CANVAS_MIB);
    database.close();
  });

  it("keeps invalid timestamps out at the SQLite boundary", () => {
    const database = openDatabase(":memory:");
    assert.throws(
      () => database
        .prepare("UPDATE render_budget_settings SET updated_at = -1 WHERE singleton = 1")
        .run(),
      /CHECK constraint failed/,
    );
    assert.equal(readRenderBudgetSetting(database).updatedAt, 0);
    database.close();
  });
});
