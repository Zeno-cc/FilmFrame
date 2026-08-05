CREATE TABLE render_budget_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  max_canvas_mib INTEGER NOT NULL CHECK (
    max_canvas_mib >= 128 AND max_canvas_mib <= 2048
  ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

INSERT INTO render_budget_settings (singleton, max_canvas_mib, updated_at)
VALUES (1, 700, 0);
