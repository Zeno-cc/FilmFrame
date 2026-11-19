CREATE TABLE render_budget_settings_v3 (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  max_canvas_mib INTEGER NOT NULL CHECK (
    max_canvas_mib >= 128 AND max_canvas_mib <= 6144
  ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

INSERT INTO render_budget_settings_v3 (singleton, max_canvas_mib, updated_at)
SELECT singleton, max_canvas_mib, updated_at
FROM render_budget_settings;

DROP TABLE render_budget_settings;
ALTER TABLE render_budget_settings_v3 RENAME TO render_budget_settings;

-- Raise only the untouched historical seed to the new default. An administrator
-- choice (updated_at > 0) is preserved exactly as stored.
UPDATE render_budget_settings
SET max_canvas_mib = 6144
WHERE singleton = 1 AND max_canvas_mib = 700 AND updated_at = 0;
