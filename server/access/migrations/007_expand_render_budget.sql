CREATE TABLE render_budget_settings_v2 (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  max_canvas_mib INTEGER NOT NULL CHECK (
    max_canvas_mib >= 128 AND max_canvas_mib <= 4096
  ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

INSERT INTO render_budget_settings_v2 (singleton, max_canvas_mib, updated_at)
SELECT singleton, max_canvas_mib, updated_at
FROM render_budget_settings;

DROP TABLE render_budget_settings;
ALTER TABLE render_budget_settings_v2 RENAME TO render_budget_settings;
