#!/usr/bin/env node
// Local SQLite storage MCP server for project state.
// Stores missions, tasks, progress, problems, documents and review rounds
// in a single SQLite database (default: .opencode/project.db).
//
// Stdio transport, newline-delimited JSON-RPC 2.0 (MCP spec).
// Uses Node's built-in node:sqlite — no external dependencies.
//
// Env:
//   STORAGE_DB  absolute path to the SQLite file (default: .opencode/project.db under cwd)

import { DatabaseSync } from "node:sqlite";
import { readFileSync, appendFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DB_PATH = process.env.STORAGE_DB || join(PROJECT_ROOT, ".opencode", "project.db");
const LOG_PATH = join(PROJECT_ROOT, ".opencode", "storage-mcp.log");

function log(msg) {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  objective TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
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
  status TEXT NOT NULL DEFAULT 'todo',
  assigned_role TEXT DEFAULT 'worker',
  evidence TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS progress_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  file_refs TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  description TEXT NOT NULL,
  resolution TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT REFERENCES missions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  path TEXT DEFAULT '',
  url TEXT DEFAULT '',
  content TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  model TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT DEFAULT '',
  next_steps TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function initSchema() {
  db.exec(SCHEMA);
}

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function openDb() {
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  initSchema();
  log(`db opened: ${DB_PATH}`);
}

const BLOCKED_KEYWORDS = ["ATTACH", "DETACH", "VACUUM", "PRAGMA", "LOAD_EXTENSION"];

function guardSql(sql, readOnly) {
  const single = sql.split(";").filter((s) => s.trim() !== "");
  if (single.length !== 1) {
    throw new Error("Разрешён только один оператор SQL за вызов");
  }
  const stmt = single[0].trim();
  const head = stmt.split(/\s+/)[0].toUpperCase();
  if (readOnly && head !== "SELECT") {
    throw new Error("storage_query принимает только SELECT");
  }
  if (!readOnly && BLOCKED_KEYWORDS.includes(head)) {
    throw new Error(`Оператор ${head} запрещён в storage_execute`);
  }
  return stmt;
}

function bindParams(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

function runStatement(sql, params) {
  const stmt = guardSql(sql, false);
  const args = bindParams(params);
  const r = db.prepare(stmt).run(...args);
  return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
}

function queryStatement(sql, params) {
  const stmt = guardSql(sql, true);
  const args = bindParams(params);
  return db.prepare(stmt).all(...args);
}

function stateSnapshot() {
  const missions = db.prepare("SELECT id,title,status,iteration,updated_at FROM missions ORDER BY updated_at DESC").all();
  const tasksByStatus = db.prepare("SELECT status,COUNT(*) AS n FROM tasks GROUP BY status").all();
  const openProblems = db.prepare("SELECT id,mission_id,severity,description FROM problems WHERE status='open' ORDER BY created_at DESC LIMIT 20").all();
  const pendingReviews = db.prepare("SELECT id,mission_id,reviewer,status FROM review_rounds WHERE status='pending' ORDER BY created_at DESC").all();
  const docs = db.prepare("SELECT id,title,kind,path,url FROM documents ORDER BY created_at DESC LIMIT 20").all();
  return { dbPath: DB_PATH, missions, tasksByStatus, openProblems, pendingReviews, documents: docs };
}

const TOOLS = [
  {
    name: "storage_init",
    description: "Создать таблицы хранилища проекта, если их ещё нет. Идемпотентно. Вызывается автоматически при старте.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "storage_query",
    description: "Только чтение (SELECT). Вернуть строки как JSON. Используй для проверки состояния проекта.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SELECT-запрос" },
        params: { type: "array", items: {}, description: "Позиционные параметры (опционально)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "storage_execute",
    description: "Запись/DDL: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP. Один оператор за вызов. ATTACH/DETACH/VACUUM/PRAGMA запрещены.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL-оператор записи" },
        params: { type: "array", items: {}, description: "Позиционные параметры (опционально)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "storage_state",
    description: "Полный снимок состояния проекта: активные миссии, статусы задач, открытые проблемы, ожидающие ревью, документы. Используй при старте сессии для восстановления контекста.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "storage_mission",
    description: "Управление миссией. action=begin создаёт миссию; action=update меняет status/iteration/description; action=complete закрывает миссию.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["begin", "update", "complete"] },
        id: { type: "string", description: "ID миссии, например M-1" },
        title: { type: "string" },
        description: { type: "string", description: "Инструкции/задание" },
        objective: { type: "string" },
        status: { type: "string", enum: ["active", "done", "cancelled"] },
        iteration: { type: "integer" },
      },
      required: ["action"],
    },
  },
  {
    name: "storage_task",
    description: "Добавить или обновить подзадачу. action=add создаёт; action=update меняет status/evidence/assigned_role.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "update"] },
        id: { type: "string" },
        mission_id: { type: "string", description: "ID родительской миссии" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done", "blocked"] },
        assigned_role: { type: "string", enum: ["worker", "planner", "reviewer"] },
        evidence: { type: "string", description: "Файлы/тесты как доказательство выполнения" },
      },
      required: ["action"],
    },
  },
  {
    name: "storage_problem",
    description: "Записать проблему. action=open создаёт; action=resolve закрывает с указанием решения.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["open", "resolve"] },
        id: { type: "integer" },
        mission_id: { type: "string" },
        task_id: { type: "string" },
        severity: { type: "string", enum: ["info", "warning", "blocker"] },
        description: { type: "string" },
        resolution: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "storage_document",
    description: "Сохранить документ. kind=file (path), kind=link (url), kind=text (content). Хранит ссылку или сам текст прямо в базе.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: { type: "string" },
        title: { type: "string" },
        kind: { type: "string", enum: ["file", "link", "text"] },
        path: { type: "string" },
        url: { type: "string" },
        content: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "kind"],
    },
  },
  {
    name: "storage_review",
    description: "Записать раунд независимого ревью после завершения работы агента.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: { type: "string" },
        reviewer: { type: "string", description: "Имя агента-ревьюера" },
        model: { type: "string" },
        status: { type: "string", enum: ["passed", "failed", "pending"] },
        summary: { type: "string" },
        next_steps: { type: "string", description: "Дальнейшие шаги по улучшению" },
      },
      required: ["mission_id", "reviewer", "status"],
    },
  },
];

function handleTool(name, args) {
  args = args || {};
  switch (name) {
    case "storage_init":
      initSchema();
      return { ok: true, dbPath: DB_PATH };
    case "storage_query":
      return { ok: true, rows: queryStatement(args.sql, args.params) };
    case "storage_execute":
      return { ok: true, ...runStatement(args.sql, args.params) };
    case "storage_state":
      return { ok: true, ...stateSnapshot() };
    case "storage_mission": {
      const a = args.action;
      if (a === "begin") {
        runStatement(
          "INSERT INTO missions (id,title,description,objective,status,iteration) VALUES (?,?,?,?,?,?)",
          [args.id, args.title || "Untitled", args.description || "", args.objective || "", "active", args.iteration || 0]
        );
        return { ok: true, missionId: args.id };
      }
      if (a === "complete") {
        runStatement("UPDATE missions SET status='done', completed_at=?, updated_at=? WHERE id=?", [now(), now(), args.id]);
        return { ok: true, missionId: args.id };
      }
      const sets = [];
      const vals = [];
      for (const [k, v] of [["status", args.status], ["iteration", args.iteration], ["description", args.description]]) {
        if (v !== undefined) { sets.push(`${k}=?`); vals.push(v); }
      }
      if (args.status === "done") { sets.push("completed_at=?"); vals.push(now()); }
      sets.push("updated_at=?"); vals.push(now()); vals.push(args.id);
      runStatement(`UPDATE missions SET ${sets.join(", ")} WHERE id=?`, vals);
      return { ok: true, missionId: args.id };
    }
    case "storage_task": {
      const a = args.action;
      if (a === "add") {
        runStatement(
          "INSERT INTO tasks (id,mission_id,title,description,status,assigned_role) VALUES (?,?,?,?,?,?)",
          [args.id, args.mission_id, args.title || "Untitled", args.description || "", args.status || "todo", args.assigned_role || "worker"]
        );
        return { ok: true, taskId: args.id };
      }
      const sets = [];
      const vals = [];
      for (const [k, v] of [["status", args.status], ["evidence", args.evidence], ["assigned_role", args.assigned_role], ["description", args.description]]) {
        if (v !== undefined) { sets.push(`${k}=?`); vals.push(v); }
      }
      if (args.status === "done") { sets.push("completed_at=?"); vals.push(now()); }
      sets.push("updated_at=?"); vals.push(now()); vals.push(args.id);
      runStatement(`UPDATE tasks SET ${sets.join(", ")} WHERE id=?`, vals);
      return { ok: true, taskId: args.id };
    }
    case "storage_problem": {
      if (args.action === "open") {
        const r = runStatement(
          "INSERT INTO problems (mission_id,task_id,severity,description) VALUES (?,?,?,?)",
          [args.mission_id || "", args.task_id || null, args.severity || "warning", args.description || ""]
        );
        return { ok: true, problemId: Number(r.lastInsertRowid) };
      }
      runStatement("UPDATE problems SET status='resolved', resolution=?, resolved_at=? WHERE id=?", [args.resolution || "", now(), args.id]);
      return { ok: true, problemId: args.id };
    }
    case "storage_document": {
      const r = runStatement(
        "INSERT INTO documents (mission_id,title,kind,path,url,content,description) VALUES (?,?,?,?,?,?,?)",
        [args.mission_id || null, args.title, args.kind, args.path || "", args.url || "", args.content || "", args.description || ""]
      );
      return { ok: true, documentId: Number(r.lastInsertRowid) };
    }
    case "storage_review": {
      const r = runStatement(
        "INSERT INTO review_rounds (mission_id,reviewer,model,status,summary,next_steps) VALUES (?,?,?,?,?,?)",
        [args.mission_id, args.reviewer, args.model || "", args.status, args.summary || "", args.next_steps || ""]
      );
      return { ok: true, reviewId: Number(r.lastInsertRowid) };
    }
    default:
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

try {
  openDb();
} catch (e) {
  log(`failed to open db: ${e.message}`);
  process.stderr.write(`storage-mcp: cannot open database ${DB_PATH}: ${e.message}\n`);
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    respond(msg.id, {
      protocolVersion: msg.params?.protocolVersion || "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "project-storage-sqlite", version: "1.0.0" },
    });
    return;
  }
  if (msg.method === "notifications/initialized" || msg.method === "notifications/roots/list_changed" || msg.method === "ping") {
    if (msg.method === "ping" && msg.id !== undefined) respond(msg.id, {});
    return;
  }
  if (msg.method === "tools/list") {
    respond(msg.id, { tools: TOOLS });
    return;
  }
  if (msg.method === "tools/call") {
    try {
      const result = handleTool(msg.params.name, msg.params.arguments);
      respond(msg.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      log(`tool error ${msg.params?.name}: ${e.message}`);
      respond(msg.id, { content: [{ type: "text", text: `Ошибка: ${e.message}` }], isError: true });
    }
    return;
  }
  if (msg.id !== undefined) {
    respondError(msg.id, -32601, `Метод не найден: ${msg.method}`);
  }
});
