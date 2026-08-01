-- Project state storage schema (SQLite)
-- Managed by .opencode/storage-mcp.mjs (Node built-in node:sqlite, no deps).
-- DB file: .opencode/project.db
--
-- Tables:
--   missions       — одна строка на миссию/задачу оркестратора (инструкции, статус, итерация)
--   tasks          — подзадачи с ролями и доказательствами выполнения
--   progress_log   — что выполнено (хронология)
--   problems       — где проблемы (severity, статус, решение)
--   documents      — ссылки или сам текст документов
--   review_rounds  — результаты независимого ревью и дальнейшие шаги
--
-- MCP tools (local server): storage_init, storage_query, storage_execute,
--   storage_state, storage_mission, storage_task, storage_problem,
--   storage_document, storage_review.

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  objective TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',      -- active | done | cancelled
  iteration INTEGER NOT NULL DEFAULT 0,
  session_hint TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',        -- todo | in_progress | done | blocked
  assigned_role TEXT DEFAULT 'worker',        -- worker | planner | reviewer
  evidence TEXT DEFAULT '',                   -- файлы/тесты как доказательство
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS progress_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                       -- started | done | problem | note
  detail TEXT DEFAULT '',
  file_refs TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'warning',   -- info | warning | blocker
  description TEXT NOT NULL,
  resolution TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',        -- open | resolved
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT REFERENCES missions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',          -- file | link | text
  path TEXT DEFAULT '',                       -- для kind=file
  url TEXT DEFAULT '',                        -- для kind=link
  content TEXT DEFAULT '',                    -- для kind=text (документ прямо в базе)
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  model TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | passed | failed
  summary TEXT DEFAULT '',
  next_steps TEXT DEFAULT '',                 -- дальнейшие шаги по улучшению
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_mission ON tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_progress_mission ON progress_log(mission_id);
