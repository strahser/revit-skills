import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const DB_PATH = join(ROOT, '.opencode', 'project.db');
const PORT = Number(process.env.DASHBOARD_PORT || 4317);

const SKILLS_DIR = join(ROOT, '.opencode', 'skills');
const WIKI_DIR = join(ROOT, '.opencode', 'wiki');
const PROMPTS_PATH = join(ROOT, '.opencode', 'prompt-drafts.json');

function db() {
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!m) return {};
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const key = keyMatch[1].trim();
    let value = keyMatch[2].trim();
    if (value === '>' || value === '|' || value.startsWith('>-') || value.startsWith('|-')) {
      const parts = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].trim() === '')) {
        parts.push(lines[++i].trim());
      }
      value = parts.filter((p) => p).join(' ');
    }
    meta[key] = value;
  }
  return meta;
}

function stripFrontmatter(text) {
  return text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '');
}

function readSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const p = join(SKILLS_DIR, d.name, 'SKILL.md');
      if (!existsSync(p)) return { name: d.name, description: '(SKILL.md не найден)' };
      const text = readFileSync(p, 'utf8');
      const meta = parseFrontmatter(text);
      const st = statSync(p);
      return {
        name: meta.name || d.name,
        description: meta.description || '(без описания)',
        path: join('.opencode', 'skills', d.name, 'SKILL.md').replaceAll('\\', '/'),
        size: st.size,
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readSkillContent(name) {
  const p = join(SKILLS_DIR, name, 'SKILL.md');
  if (!existsSync(p)) return null;
  const text = readFileSync(p, 'utf8');
  const st = statSync(p);
  return {
    name,
    path: join('.opencode', 'skills', name, 'SKILL.md').replaceAll('\\', '/'),
    size: st.size,
    modified: st.mtime.toISOString(),
    meta: parseFrontmatter(text),
    content: stripFrontmatter(text),
  };
}

function readWiki() {
  if (!existsSync(WIKI_DIR)) return [];
  return readdirSync(WIKI_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const p = join(WIKI_DIR, f);
      const st = statSync(p);
      return {
        name: f,
        path: join('.opencode', 'wiki', f).replaceAll('\\', '/'),
        size: st.size,
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readWikiContent(name) {
  const p = join(WIKI_DIR, name);
  if (!existsSync(p) || !p.endsWith('.md')) return null;
  const text = readFileSync(p, 'utf8');
  const st = statSync(p);
  return {
    name,
    path: join('.opencode', 'wiki', name).replaceAll('\\', '/'),
    size: st.size,
    modified: st.mtime.toISOString(),
    content: text,
  };
}

function dbState() {
  if (!existsSync(DB_PATH)) return { exists: false, tables: [] };
  const d = db();
  try {
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const out = tables.map((t) => {
      const count = d.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c;
      let rows = [];
      if (count > 0) {
        rows = d.prepare(`SELECT * FROM "${t.name}" ORDER BY rowid DESC LIMIT 100`).all();
      }
      return { name: t.name, count, rows };
    });
    return { exists: true, tables: out };
  } finally {
    d.close();
  }
}

function readMissionFiles() {
  const files = ['context.md', 'todo.md', 'summary.md', 'work-log.md', 'mission-ledger.jsonl', 'loop-state.json'];
  const out = {};
  for (const f of files) {
    const p = join(ROOT, '.opencode', f);
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      out[f] = text.length > 40000 ? text.slice(0, 40000) + '\n…(обрезано)' : text;
    }
  }
  const brain = join(ROOT, '.opencode', 'docs', 'brain');
  if (existsSync(brain)) {
    out['docs/brain/'] = readdirSync(brain, { recursive: true })
      .filter((f) => typeof f === 'string')
      .map((f) => join('docs/brain', f).replaceAll('\\', '/'));
  }
  return out;
}

/* ---- DB tree & item API ---- */

function dbTree() {
  if (!existsSync(DB_PATH)) return { error: 'project.db not found' };
  const d = db();
  try {
    const missions = d.prepare('SELECT * FROM missions ORDER BY rowid DESC').all();
    const out = missions.map((m) => {
      const children = [];
      for (const r of d.prepare('SELECT id, title, status, assigned_role FROM tasks WHERE mission_id = ? ORDER BY rowid').all(m.id))
        children.push({ type: 'task', id: r.id, title: r.title, status: r.status, role: r.assigned_role });
      for (const r of d.prepare('SELECT id, severity, description, status FROM problems WHERE mission_id = ? ORDER BY rowid').all(m.id))
        children.push({ type: 'problem', id: r.id, descr: r.description, severity: r.severity, status: r.status });
      for (const r of d.prepare('SELECT id, title, kind FROM documents WHERE mission_id = ? ORDER BY rowid').all(m.id))
        children.push({ type: 'document', id: r.id, title: r.title, kind: r.kind });
      for (const r of d.prepare('SELECT id, reviewer, status, summary FROM review_rounds WHERE mission_id = ? ORDER BY rowid').all(m.id))
        children.push({ type: 'review', id: r.id, reviewer: r.reviewer, status: r.status, summary: r.summary });
      return {
        type: 'mission',
        id: m.id,
        title: m.title,
        status: m.status,
        iteration: m.iteration,
        created_at: m.created_at,
        completed_at: m.completed_at,
        children,
      };
    });
    // orphan rows (no mission / deleted mission)
    const orphan = [];
    for (const r of d.prepare("SELECT id, title, status, assigned_role FROM tasks WHERE mission_id IS NULL OR mission_id NOT IN (SELECT id FROM missions) ORDER BY rowid").all())
      orphan.push({ type: 'task', id: r.id, title: r.title, status: r.status, role: r.assigned_role });
    for (const r of d.prepare("SELECT id, severity, description, status FROM problems WHERE mission_id IS NULL OR mission_id NOT IN (SELECT id FROM missions) ORDER BY rowid").all())
      orphan.push({ type: 'problem', id: r.id, descr: r.description, severity: r.severity, status: r.status });
    for (const r of d.prepare("SELECT id, title, kind FROM documents WHERE mission_id IS NULL OR mission_id NOT IN (SELECT id FROM missions) ORDER BY rowid").all())
      orphan.push({ type: 'document', id: r.id, title: r.title, kind: r.kind });
    for (const r of d.prepare("SELECT id, reviewer, status, summary FROM review_rounds WHERE mission_id IS NULL OR mission_id NOT IN (SELECT id FROM missions) ORDER BY rowid").all())
      orphan.push({ type: 'review', id: r.id, reviewer: r.reviewer, status: r.status, summary: r.summary });
    if (orphan.length)
      out.push({ type: 'mission', id: null, title: '(без миссии)', status: '', iteration: 0, created_at: '', completed_at: '', children: orphan });
    return out;
  } finally {
    d.close();
  }
}

function dbItem(type, id) {
  if (!existsSync(DB_PATH)) return null;
  const d = db();
  try {
    switch (type) {
      case 'mission': return d.prepare('SELECT * FROM missions WHERE id = ?').get(String(id)) || null;
      case 'task': return d.prepare('SELECT * FROM tasks WHERE id = ?').get(String(id)) || null;
      case 'problem':
      case 'document':
      case 'review': {
        if (!/^\d+$/.test(String(id))) return null;
        const table = type === 'review' ? 'review_rounds' : type + 's';
        return d.prepare('SELECT * FROM "' + table + '" WHERE id = ?').get(Number(id)) || null;
      }
      default: return null;
    }
  } finally {
    d.close();
  }
}

/* ---- prompt drafts v2 (structured JSON + Common part + DB progress log) ---- */

function readPrompts() {
  if (!existsSync(PROMPTS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(PROMPTS_PATH, 'utf8'));
    if (Array.isArray(data)) return data; // legacy v1
    return Array.isArray(data.prompts) ? data.prompts : [];
  } catch { return []; }
}

function readCommonPart() {
  if (!existsSync(PROMPTS_PATH)) return '';
  try {
    const data = JSON.parse(readFileSync(PROMPTS_PATH, 'utf8'));
    if (!data || Array.isArray(data)) return '';
    return data.common || '';
  } catch { return ''; }
}

function writePrompts(prompts, common) {
  const data = { version: 2, common: common || '', prompts: prompts || [] };
  writeFileSync(PROMPTS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function savePrompt({ title, text, category }) {
  const prompts = readPrompts();
  const common = readCommonPart();
  const item = {
    id: Date.now(),
    title: String(title || '').trim() || ('Промпт ' + (prompts.length + 1)),
    text: String(text || ''),
    category: String(category || 'general').trim() || 'general',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    executions: 0,
    last_used: null,
  };
  prompts.push(item);
  writePrompts(prompts, common);
  return item;
}

function deletePrompt(id) {
  const prompts = readPrompts();
  const common = readCommonPart();
  const idx = prompts.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return false;
  prompts.splice(idx, 1);
  writePrompts(prompts, common);
  return true;
}

function saveCommonPart(text) {
  writePrompts(readPrompts(), String(text || ''));
  return String(text || '');
}

function markPromptUsed(id) {
  const prompts = readPrompts();
  const common = readCommonPart();
  const p = prompts.find(x => String(x.id) === String(id));
  if (!p) return null;
  p.executions = (p.executions || 0) + 1;
  p.last_used = new Date().toISOString();
  p.updated_at = p.last_used;
  writePrompts(prompts, common);
  logPromptProgress('Prompt used: ' + (p.title || p.text.slice(0, 60)));
  return p;
}

function logPromptProgress(detail) {
  // Dashboard writes to project.db on purpose for prompt progress tracking
  try {
    const d = new DatabaseSync(DB_PATH); // read-write
    d.prepare("INSERT OR IGNORE INTO missions (id, title, status, created_at, updated_at) VALUES ('M-PROMPTS', 'Prompt work log', 'active', datetime('now'), datetime('now'))").run();
    d.prepare("INSERT INTO progress_log (mission_id, action, detail, file_refs, created_at) VALUES ('M-PROMPTS', 'note', ?, 'prompt-drafts.json', datetime('now'))").run(detail);
    d.close();
    return true;
  } catch (e) { return false; }
}

const TOP_PROMPTS = [
  { title: 'Развернуть/починить MCP-серверы', text: 'Проверь все MCP-серверы в opencode.json (handshake через stdio JSON-RPC), исправь конфигурацию, обнови .opencode/wiki/mcp-servers.md и запиши результат в project.db.', category: 'mcp' },
  { title: 'Ревью кода Revit-плагина', text: 'Проведи независимое ревью кода Revit-плагина по .opencode/skills/revit-api: транзакции, исключения BooleanOperationsUtils, производительность, best practices. Запиши review_rounds в project.db.', category: 'revit' },
  { title: 'Обновить wiki/документацию', text: 'Обнови базу знаний .opencode/wiki/ по актуальному состоянию проекта, добавь ссылку в index.md, закоммить и запушь в GitHub (skills master).', category: 'docs' },
  { title: 'Написать тесты для Revit API', text: 'Напиши RevitApiTest-тесты по .opencode/skills/revit-testing и revit-test-fixtures, выполни их через revit-test-runner и зафиксируй результаты в project.db.', category: 'revit' },
  { title: 'Экспорт геометрии для 3D-вьювера', text: 'Экспортируй геометрию Revit по .opencode/skills/revit-3d-export (BoundingBox/LocationCurve/LocationPoint fallback, Z-up feet → Y-up mm) и проверь в demo3D/Index.html.', category: 'viewer' },
];

const DEFAULT_COMMON = [
  'РАБОТАЙ ПО ИНСТРУКЦИЯМ ПРОЕКТА:',
  '- .opencode/wiki/index.md — оглавление базы знаний (все страницы wiki)',
  '- .opencode/wiki/user-guide.md — полное руководство по системе (развёртывание, MCP, GitHub, БД, промпты)',
  '- .opencode/AGENTS.md — правила проекта и конвенции',
  'ХОД РАБОТЫ ФИКСИРУЙ В SQLITE: .opencode/project.db через storage MCP',
  '  (storage_mission/storage_task/storage_problem/storage_document/storage_review)',
  'ГОТОВОЕ РЕЗУЛЬТАТ КОММИТЬ И ПУШИТЬ: git push skills master',
  'ИСПОЛЬЗУЙ SKILLS: revit-api, revit-testing, revit-3d-export, revit-json-serialization, mcp-setup, threejs-viewer, revit-test-fixtures, revit-test-runner, revit-wiki'
].join('\n');

function json(res, data, code = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const PAGE = String.raw`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orchestrator Dashboard</title>
<style>
:root { --bg:#0f1117; --panel:#171a23; --panel2:#1d2130; --border:#2a2f42; --text:#e6e8ef; --muted:#9aa2b5; --accent:#6ea8ff; --green:#4ade80; --yellow:#facc15; --red:#f87171; --code:#0b0e14; }
* { box-sizing:border-box; }
html,body { height:100%; }
body { margin:0; font:14px/1.55 system-ui,Segoe UI,sans-serif; background:var(--bg); color:var(--text); }
header { display:flex; align-items:center; gap:16px; padding:10px 20px; background:#12141c; border-bottom:1px solid var(--border); }
header h1 { font-size:16px; margin:0; }
header .status { font-size:12px; color:var(--muted); }
nav { display:flex; gap:6px; padding:10px 20px; border-bottom:1px solid var(--border); background:#14161f; }
nav button { background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; }
nav button:hover { border-color:var(--accent); }
nav button.active { background:var(--accent); color:#0b0f17; border-color:var(--accent); font-weight:600; }
.layout { display:flex; height:calc(100vh - 96px); }
.sidebar { width:280px; min-width:280px; border-right:1px solid var(--border); background:#12141c; overflow:auto; padding:10px; }
.sidebar .group { margin-bottom:10px; }
.sidebar .group-title { font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; padding:6px 8px; }
.tree-item { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:13px; user-select:none; }
.tree-item:hover { background:var(--panel2); }
.tree-item.active { background:#1d3a5c; color:var(--accent); }
.tree-item .caret { width:12px; color:var(--muted); font-size:10px; transition:transform .1s; }
.tree-item .caret.open { transform:rotate(90deg); }
.tree-item .icon { font-size:12px; }
.tree-item .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tree-item .count { margin-left:auto; font-size:11px; color:var(--muted); }
.tree-item .tree-del { border:none; background:transparent; color:var(--muted); font-size:11px; cursor:pointer; padding:2px 5px; border-radius:4px; line-height:1; flex:0 0 auto; }
.tree-item .tree-del:hover { background:#c0392b; color:#fff; }
.tree-item.active .tree-del { color:#9db4cc; }
.tree-item.active .tree-del:hover { background:#c0392b; color:#fff; }
.tree-children { padding-left:18px; }
.tree-children.hidden { display:none; }
.content { flex:1; overflow:auto; padding:20px 28px; }
.placeholder { color:var(--muted); padding:60px 20px; text-align:center; }
.doc-meta { display:flex; gap:12px; font-size:12px; color:var(--muted); padding:10px 0 14px; border-bottom:1px solid var(--border); margin-bottom:18px; }
.card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:16px; }
.card h3 { margin:0 0 10px; font-size:14px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
table { width:100%; border-collapse:collapse; font-size:12.5px; }
th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
th { color:var(--muted); font-weight:600; }
code, pre, .md code { font-family:Consolas,monospace; }
pre, .md pre { background:var(--code); border:1px solid var(--border); border-radius:8px; padding:12px; overflow:auto; font-size:12.5px; line-height:1.5; }
.badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; }
.badge.ok { background:#123b26; color:var(--green); }
.badge.warn { background:#3b3312; color:var(--yellow); }
.badge.err { background:#3b1212; color:var(--red); }
.badge.info { background:#12263b; color:var(--accent); }
.muted { color:var(--muted); }
summary { cursor:pointer; font-weight:600; }
.collapse { margin-top:8px; }
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }
.empty { color:var(--muted); padding:20px; text-align:center; }
.btn { background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; }
.btn:hover { border-color:var(--accent); }
.btn.primary { background:var(--accent); color:#0b0f17; border-color:var(--accent); font-weight:600; }
.flash { position:fixed; bottom:20px; right:20px; background:var(--panel2); border:1px solid var(--accent); color:var(--text); padding:10px 16px; border-radius:8px; opacity:0; transform:translateY(8px); transition:.2s; pointer-events:none; z-index:99; max-width:60%; }
.flash.show { opacity:1; transform:none; }
.json-key { color:var(--accent); } .json-str { color:var(--green); } .json-num { color:var(--yellow); }
/* markdown rendering */
.md { font-size:14px; line-height:1.65; }
.md h1 { font-size:22px; margin:0 0 16px; padding-bottom:8px; border-bottom:1px solid var(--border); }
.md h2 { font-size:18px; margin:24px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--border); }
.md h3 { font-size:15px; margin:20px 0 8px; }
.md h4 { font-size:14px; margin:16px 0 6px; }
.md p { margin:8px 0; }
.md ul, .md ol { margin:8px 0; padding-left:24px; }
.md li { margin:3px 0; }
.md li.task { list-style:none; margin-left:-20px; }
.md blockquote { margin:10px 0; padding:2px 14px; border-left:3px solid var(--accent); background:var(--panel); border-radius:0 8px 8px 0; color:var(--muted); }
.md code { background:var(--code); border:1px solid var(--border); border-radius:4px; padding:1px 5px; font-size:12.5px; }
.md pre code { background:none; border:none; padding:0; font-size:12.5px; }
.md hr { border:none; border-top:1px solid var(--border); margin:20px 0; }
.md img { max-width:100%; border-radius:8px; }
.md .anchor { opacity:0; } .md h2:hover .anchor, .md h3:hover .anchor { opacity:1; }
</style>
</head>
<body>
<header>
  <h1>Revit Skills Orchestrator Dashboard</h1>
  <span class="status" id="status">…</span>
</header>
<nav>
  <button data-tab="skills" class="active">Скилы</button>
  <button data-tab="wiki">Wiki</button>
  <button data-tab="db">База данных</button>
  <button data-tab="mission">Миссия</button>
  <button data-tab="prompt">Промпт</button>
  <button data-tab="guide">Инструкция</button>
</nav>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="group" id="group-skills">
      <div class="group-title">Скилы</div>
      <div id="tree-skills"></div>
    </div>
    <div class="group" id="group-wiki">
      <div class="group-title">Wiki</div>
      <div id="tree-wiki"></div>
    </div>
    <div class="group" id="group-db" style="display:none">
      <div class="group-title">База данных</div>
      <div id="tree-db"></div>
    </div>
    <div class="group" id="group-guide" style="display:none">
      <div class="group-title">Содержание</div>
      <div id="tree-guide"></div>
    </div>
    <div class="group" id="group-prompt" style="display:none">
      <div class="group-title">Промпты</div>
      <div id="tree-prompt"></div>
    </div>
  </aside>
  <main class="content" id="content">
    <div class="placeholder" id="placeholder">Выберите скил или страницу wiki слева, либо вкладку «База данных» / «Миссия».</div>
  </main>
</div>
<script>
const $ = (id) => document.getElementById(id);
const state = { tab: 'skills', selection: null, skills: [], wiki: [] };

function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---- minimal markdown renderer ---- */
function inline(text){
  // escape first, then apply inline tokens via placeholders
  let s = esc(text);
  const codes = [];
  const BT = String.fromCharCode(96);
  s = s.replace(new RegExp(BT+'([^'+BT+']+)'+BT, 'g'), (_, c) => { codes.push('<code>'+c+'</code>'); return '@@C'+ (codes.length-1) +'@@'; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/@@C(\d+)@@/g, (_, i) => codes[+i]);
  return s;
}
function renderTable(rows){
  if(!rows.length) return '';
  const head = rows[0].map(c=>'<th>'+inline(c)+'</th>').join('');
  const body = rows.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('');
  return '<table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table>';
}
function renderMarkdown(src){
  const lines = src.replace(/\r\n/g,'\n').split('\n');
  const out = [];
  let i = 0;
  const flushCode = (buf) => { if(buf && buf.length) out.push('<pre><code>'+buf.join('\n')+'</code></pre>'); };
  const flushList = (buf) => {
    if(!buf || !buf.length) return;
    const items = buf.map(l=>{
      const m = l.match(/^(\s*)([-*+]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/);
      const task = m && m[3] !== undefined;
      const body = task ? '<span style="display:inline-flex;gap:6px"><input type="checkbox"'+(m[3].toLowerCase()==='x'?' checked':'')+' disabled>'+inline(m[4])+'</span>' : inline(m[4]);
      return '<li'+(task?' class="task"':'')+'>'+body+'</li>';
    });
    out.push('<ul>'+items.join('')+'</ul>');
  };
  let codeBuf = null, listBuf = null;
  const FENCE = String.fromCharCode(96).repeat(3);
  while(i < lines.length){
    const line = lines[i];
    if(codeBuf !== null){
      if(line.startsWith(FENCE)){
        flushCode(codeBuf); codeBuf = null;
      } else codeBuf.push(line);
      i++; continue;
    }
    if(line.startsWith(FENCE)){
      flushList(listBuf); listBuf = null;
      codeBuf = []; i++; continue;
    }
    if(/^\s*[-*+] |^\s*\d+\. /.test(line) && !/^\s*[-*+] /.test(line)) flushList(listBuf);
    if(/^\s*[-*+] |^\s*\d+\. /.test(line)){
      if(listBuf === null) listBuf = [];
      listBuf.push(line); i++; continue;
    }
    flushList(listBuf); listBuf = null;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if(h){ const lv=h[1].length; const id='h'+lv+'-'+i; out.push('<h'+lv+'>'+inline(h[2])+'</h'+lv+'>'); i++; continue; }
    if(/^\s*\|/.test(line)){
      const rows = [];
      while(i < lines.length && lines[i].trim().startsWith('|')){
        const cells = lines[i].trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
        if(!/^:?-+:?$/.test(cells.join(''))) rows.push(cells);
        i++;
      }
      if(rows.length) out.push(renderTable(rows));
      continue;
    }
    if(/^>\s?/.test(line)){
      const q = [];
      while(i < lines.length && /^>\s?/.test(lines[i])){ q.push(lines[i].replace(/^>\s?/,'')); i++; }
      out.push('<blockquote>'+renderMarkdown(q.join('\n'))+'</blockquote>');
      continue;
    }
    if(/^---+\s*$/.test(line)){ out.push('<hr>'); i++; continue; }
    if(/^\s*$/.test(line)){ i++; continue; }
    out.push('<p>'+inline(line)+'</p>');
    i++;
  }
  flushCode(codeBuf);
  flushList(listBuf);
  return out.join('\n');
}

/* ---- api ---- */
async function get(path){ const r = await fetch(path); return r.json(); }

function sidebarVisibleFor(tab){ return tab === 'skills' || tab === 'wiki' || tab === 'db' || tab === 'guide' || tab === 'prompt'; }
function setSidebarVisible(show){ $('sidebar').style.display = show ? '' : 'none'; }
function setTreeGroup(tab){
  $('group-skills').style.display = (tab === 'skills') ? '' : 'none';
  $('group-wiki').style.display  = (tab === 'wiki')  ? '' : 'none';
  $('group-db').style.display    = (tab === 'db')    ? '' : 'none';
  $('group-guide').style.display = (tab === 'guide') ? '' : 'none';
  $('group-prompt').style.display = (tab === 'prompt') ? '' : 'none';
}

async function buildTrees(){
  const [skills, wiki] = await Promise.all([get('/api/skills'), get('/api/wiki')]);
  state.skills = skills; state.wiki = wiki;
  $('tree-skills').innerHTML = skills.map(s=>
    '<div class="tree-item" data-kind="skill" data-name="'+esc(s.name)+'">'+
    '<span class="icon">📦</span><span class="name">'+esc(s.name)+'</span></div>').join('');
  $('tree-wiki').innerHTML = wiki.map(w=>
    '<div class="tree-item" data-kind="wiki" data-name="'+esc(w.name)+'">'+
    '<span class="icon">📄</span><span class="name">'+esc(w.name)+'</span></div>').join('');
  $('tree-skills').addEventListener('click', onTreeClick);
  $('tree-wiki').addEventListener('click', onTreeClick);
}
function onTreeClick(e){
  const item = e.target.closest('.tree-item');
  if(!item) return;
  document.querySelectorAll('.tree-item').forEach(x=>x.classList.remove('active'));
  item.classList.add('active');
  const tab = item.dataset.kind === 'skill' ? 'skills' : 'wiki';
  document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active', x.dataset.tab === tab));
  state.tab = tab;
  openDoc(item.dataset.kind, item.dataset.name);
}
async function openDoc(kind, name){
  state.selection = { kind, name };
  const data = await get('/api/doc?kind='+encodeURIComponent(kind)+'&name='+encodeURIComponent(name));
  if(data.error){ $('content').innerHTML = '<div class="empty">'+esc(data.error)+'</div>'; return; }
  const metaRows = ['<span>'+esc(data.path)+'</span>','<span>'+data.size+' B</span>','<span>'+esc(data.modified.slice(0,16))+'</span>'];
  if(kind==='skill' && data.meta && data.meta.license) metaRows.push('<span>license: '+esc(data.meta.license)+'</span>');
  $('content').innerHTML =
    '<h1 style="margin:0 0 4px">'+esc(data.name)+'</h1>'+
    '<div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>'+
    '<div class="md">'+renderMarkdown(data.content)+'</div>';
}

/* ---- db & mission tabs ---- */
function jsonHtml(v){
  const s = JSON.stringify(v, null, 2);
  return esc(s).replace(/(&quot;[^&]*&quot;)(:?)/g, '<span class="json-key">$1</span>$2');
}
function badge(status){
  const map={done:'ok',completed:'ok',passed:'ok',resolved:'ok',active:'warn',todo:'info',in_progress:'warn',open:'warn',pending:'info',failed:'err',blocked:'err',cancelled:'err',warning:'warn',blocker:'err',info:'info'};
  return '<span class="badge '+(map[status]||'info')+'">'+esc(status)+'</span>';
}

/* ---- db tree tab ---- */
const DB_ICON = { task:'✅', problem:'⚠️', document:'📄', review:'🔍' };
function dbLabel(c){
  return c.title || c.descr || (c.reviewer ? 'review #'+c.id : c.type+' #'+c.id) || c.type;
}
function dbBadge(c){
  const s = c.status || c.severity || '';
  return s ? badge(s) : '';
}
function dbTreeHtml(tree){
  return tree.map((m) => {
    const kids = (m.children || []).map((c) =>
      '<div class="tree-item" data-db-type="'+c.type+'" data-db-id="'+esc(String(c.id))+'">'+
        '<span class="caret" style="visibility:hidden">▸</span>'+
        '<span class="icon">'+(DB_ICON[c.type]||'•')+'</span>'+
        '<span class="name">'+esc(dbLabel(c))+'</span>'+
        '<span class="count">'+dbBadge(c)+'</span>'+
      '</div>').join('');
    return '<div class="tree-group">'+
      '<div class="tree-item group-head" data-db-type="mission" data-db-id="'+esc(m.id==null?'':String(m.id))+'">'+
        '<span class="caret open">▸</span>'+
        '<span class="icon">🚀</span>'+
        '<span class="name">'+esc(m.title || m.id || '(без миссии)')+'</span>'+
        '<span class="count">'+(m.children ? m.children.length : 0)+'</span>'+
      '</div>'+
      '<div class="tree-children">'+kids+'</div>'+
    '</div>';
  }).join('');
}
function bindDbTreeClick(){
  const el = $('tree-db');
  if(!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', (e) => {
    const item = e.target.closest('.tree-item');
    if(!item) return;
    el.querySelectorAll('.tree-item').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    if(item.classList.contains('group-head')){
      const ch = item.parentElement.querySelector('.tree-children');
      const caret = item.querySelector('.caret');
      if(ch){ ch.classList.toggle('hidden'); caret.classList.toggle('open', !ch.classList.contains('hidden')); }
    }
    const type = item.dataset.dbType;
    const id = item.dataset.dbId;
    if(type && id !== '') openDbItem(type, id);
  });
}
function renderDbItem(type, data){
  const metaRows = [];
  const h = '<h1 style="margin:0 0 4px">';
  if(type === 'mission'){
    metaRows.push(badge(data.status), '<span>iteration: '+esc(String(data.iteration))+'</span>', '<span>'+esc(data.created_at||'')+'</span>');
    if(data.completed_at) metaRows.push('<span>✓ '+esc(data.completed_at)+'</span>');
    let out = h+esc(data.id)+' — '+esc(data.title)+'</h1><div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(data.description) out += '<div class="card"><h3>Описание</h3><div class="md">'+renderMarkdown(data.description)+'</div></div>';
    if(data.objective) out += '<div class="card"><h3>Цель</h3><div class="md">'+renderMarkdown(data.objective)+'</div></div>';
    if(data.session_hint) out += '<div class="card"><h3>Session hint</h3><div class="md">'+renderMarkdown(data.session_hint)+'</div></div>';
    const kids = (data._children || []).map((c) =>
      '<div class="tree-item" data-jump-type="'+c.type+'" data-jump-id="'+esc(String(c.id))+'">'+
        '<span class="icon">'+(DB_ICON[c.type]||'•')+'</span>'+
        '<span class="name">'+esc(dbLabel(c))+'</span>'+
        '<span class="count">'+dbBadge(c)+'</span>'+
      '</div>').join('');
    if(kids) out += '<div class="card"><h3>Содержимое миссии</h3>'+kids+'</div>';
    return out;
  }
  if(type === 'task'){
    metaRows.push(badge(data.status), '<span>role: '+esc(data.assigned_role||'')+'</span>', '<span>'+esc(data.created_at||'')+'</span>');
    let out = h+esc(data.id)+' — '+esc(data.title)+'</h1><div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(data.description) out += '<div class="card"><h3>Описание</h3><div class="md">'+renderMarkdown(data.description)+'</div></div>';
    if(data.evidence) out += '<div class="card"><h3>Доказательства</h3><div class="md">'+renderMarkdown(data.evidence)+'</div></div>';
    if(data.completed_at) out += '<div class="card muted">Завершено: '+esc(data.completed_at)+'</div>';
    return out;
  }
  if(type === 'problem'){
    metaRows.push(badge(data.severity), badge(data.status), '<span>'+esc(data.created_at||'')+'</span>');
    let out = h+'Проблема #'+data.id+'</h1><div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    out += '<div class="card"><h3>Описание</h3><div class="md">'+renderMarkdown(data.description)+'</div></div>';
    if(data.resolution) out += '<div class="card"><h3>Решение</h3><div class="md">'+renderMarkdown(data.resolution)+'</div></div>';
    if(data.resolved_at) out += '<div class="card muted">Решено: '+esc(data.resolved_at)+'</div>';
    return out;
  }
  if(type === 'document'){
    metaRows.push(badge(data.kind), '<span>'+esc(data.created_at||'')+'</span>');
    if(data.url) metaRows.push('<span><a href="'+esc(data.url)+'" target="_blank" rel="noopener">'+esc(data.url)+'</a></span>');
    if(data.path) metaRows.push('<span><code>'+esc(data.path)+'</code></span>');
    let out = h+esc(data.title)+'</h1><div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(data.description) out += '<div class="card"><h3>Описание</h3><div class="md">'+renderMarkdown(data.description)+'</div></div>';
    if(data.content) out += '<div class="card"><h3>Содержимое</h3><div class="md">'+renderMarkdown(data.content)+'</div></div>';
    return out;
  }
  if(type === 'review'){
    metaRows.push(badge(data.status), '<span>reviewer: '+esc(data.reviewer||'')+'</span>');
    if(data.model) metaRows.push('<span>model: '+esc(data.model)+'</span>');
    metaRows.push('<span>'+esc(data.created_at||'')+'</span>');
    let out = h+'Ревью #'+data.id+'</h1><div class="doc-meta">'+metaRows.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(data.summary) out += '<div class="card"><h3>Summary</h3><div class="md">'+renderMarkdown(data.summary)+'</div></div>';
    if(data.next_steps) out += '<div class="card"><h3>Дальнейшие шаги</h3><div class="md">'+renderMarkdown(data.next_steps)+'</div></div>';
    return out;
  }
  return '<div class="card"><pre>'+jsonHtml(data)+'</pre></div>';
}
async function openDbItem(type, id){
  state.selection = { kind:'db', type, id };
  const p = [get('/api/db/item?type='+encodeURIComponent(type)+'&id='+encodeURIComponent(id))];
  if(type === 'mission') p.push(get('/api/db/tree'));
  const results = await Promise.all(p);
  const data = results[0];
  if(data.error){ $('content').innerHTML = '<div class="empty">'+esc(data.error)+'</div>'; return; }
  if(type === 'mission' && results[1]){
    const node = results[1].find(m => String(m.id) === String(id));
    data._children = node ? node.children : [];
  }
  $('content').innerHTML = renderDbItem(type, data);
  const jumps = $('content').querySelectorAll('[data-jump-type]');
  for(const j of jumps){
    j.addEventListener('click', () => openDbItem(j.dataset.jumpType, j.dataset.jumpId));
  }
}

/* ---- prompt tab (v2: structured, common part, top5, delete, use, DB progress) ---- */
function promptHtml(){
  return '<h1 style="margin:0 0 4px">Композитор промпта</h1>'+
    '<p class="muted" style="margin:0 0 16px">Создавайте промпты, сохраняйте в библиотеку и запускайте через /task. Ход работы пишется в project.db. <b>Слева — меню с Топ-5 и библиотекой.</b></p>'+
    '<div class="card"><h3>Общая часть команды (инструкции агентам)</h3>'+
      '<p class="muted" style="margin:0 0 8px">Добавляется к каждому /task — кратко объясняет агентам, как мы обрабатываем данные.</p>'+
      '<textarea id="prompt-common" rows="3" placeholder="Например: Работай по AGENTS.md и wiki/index.md. Результаты фиксируй в .opencode/project.db через storage MCP. Готовое коммить и пушить: git push skills master." style="width:100%;background:var(--code);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px;font:13px/1.5 Consolas,monospace;resize:vertical"></textarea>'+
      '<div style="margin-top:8px"><button id="common-save" class="btn">Сохранить общую часть</button></div>'+
    '</div>'+
    '<div class="card"><h3>Новый промпт</h3>'+
      '<div style="display:flex;gap:8px;margin-bottom:8px">'+
        '<input id="prompt-title" placeholder="Название (кратко)" style="flex:1;background:var(--code);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font:13px Consolas,monospace">'+
        '<select id="prompt-category" style="background:var(--code);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font:13px">'+
          '<option value="general">general</option><option value="revit">revit</option><option value="mcp">mcp</option><option value="docs">docs</option><option value="viewer">viewer</option><option value="test">test</option>'+
        '</select>'+
      '</div>'+
      '<textarea id="prompt-text" rows="6" placeholder="Описание миссии..." style="width:100%;background:var(--code);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px;font:13px/1.5 Consolas,monospace;resize:vertical"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:8px">'+
        '<button id="prompt-save" class="btn primary">Сохранить в библиотеку</button>'+
        '<button id="prompt-copy" class="btn">Копировать /task</button>'+
      '</div>'+
    '</div>';
}
function flash(msg){
  let el = $('flash');
  if(!el){ el = document.createElement('div'); el.id = 'flash'; el.className = 'flash'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}
async function postJson(path, body){
  const r = await fetch(path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function delReq(path){
  const r = await fetch(path, { method:'DELETE' });
  return r.json();
}
function copyTaskCmd(title, text, common){
  const t = (title ? title + '\n\n' : '') + String(text || '');
  const full = (common && common.trim()) ? t + '\n\n' + common : t;
  return '/task "' + full.replace(/"/g, '\\"') + '"';
}
async function copyTask(title, text, common){
  const cmd = copyTaskCmd(title, text, common);
  try {
    await navigator.clipboard.writeText(cmd);
    flash('Команда /task скопирована');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = cmd;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flash('Команда /task скопирована'); }
    catch(e2) { flash('Не удалось скопировать: '+e2.message); }
    document.body.removeChild(ta);
  }
}
function currentCommon(){ return ($('prompt-common') ? $('prompt-common').value : '') || ''; }
function catBadge(cat){
  const map={revit:'info',mcp:'info',docs:'info',viewer:'info',test:'info',general:'info'};
  return '<span class="badge '+(map[cat]||'info')+'">'+esc(cat||'general')+'</span>';
}
function bindPromptHandlers(){
  $('prompt-save').addEventListener('click', async function(){
    const text = $('prompt-text').value.trim();
    if(!text){ flash('Введите текст промпта'); return; }
    const title = $('prompt-title').value.trim();
    const category = $('prompt-category').value;
    await postJson('/api/prompts', { title: title, text: text, category: category });
    $('prompt-text').value = ''; $('prompt-title').value = '';
    flash('Промпт сохранён');
    loadPromptTree();
  });
  $('prompt-copy').addEventListener('click', function(){
    const text = $('prompt-text').value.trim();
    if(!text){ flash('Введите текст промпта'); return; }
    copyTask($('prompt-title').value.trim(), text, currentCommon());
  });
  $('common-save').addEventListener('click', async function(){
    const c = $('prompt-common').value;
    await postJson('/api/prompts/common', { text: c });
    flash('Общая часть сохранена');
  });
}
async function loadCommon(){
  const data = await get('/api/prompts');
  if($('prompt-common')) $('prompt-common').value = data.common || '';
}
async function loadPromptTree(){
  const data = await get('/api/prompts');
  const top = data.top || [];
  const drafts = data.prompts || [];
  const el = $('tree-prompt');
  if(!el) return;
  let html = '';
  html += '<div class="group-title" style="font-size:11px;color:var(--muted);text-transform:uppercase;padding:4px 8px">Топ-5</div>';
  html += top.map((p,i) =>
    '<div class="tree-item" data-kind="top" data-idx="'+i+'">'+
      '<span class="icon">⭐</span><span class="name">'+esc(p.title)+'</span>'+
      '<span class="count">'+catBadge(p.category)+'</span></div>'
  ).join('');
  if(drafts.length){
    html += '<div class="group-title" style="font-size:11px;color:var(--muted);text-transform:uppercase;padding:4px 8px;margin-top:10px">Библиотека ('+drafts.length+')</div>';
    html += drafts.map((p,i) =>
      '<div class="tree-item" data-kind="draft" data-idx="'+i+'">'+
        '<span class="icon">📋</span><span class="name">'+esc(p.title||('#'+p.id))+'</span>'+
        '<span class="count">'+(p.executions||0)+'</span>'+
        '<button class="tree-del" data-id="'+p.id+'" title="Удалить промпт">✕</button></div>'
    ).join('');
  }
  el.innerHTML = html;
  el.querySelectorAll('.tree-item').forEach(function(it){
    it.addEventListener('click', function(){
      el.querySelectorAll('.tree-item').forEach(x=>x.classList.remove('active'));
      it.classList.add('active');
      const p = it.dataset.kind === 'top' ? top[+it.dataset.idx] : drafts[+it.dataset.idx];
      if(!p) return;
      $('prompt-title').value = p.title || '';
      $('prompt-text').value = p.text;
      $('prompt-category').value = p.category || 'general';
      flash('Промпт загружен в форму');
      document.getElementById('content').scrollTop = 0;
    });
  });
  el.querySelectorAll('.tree-del').forEach(function(btn){
    btn.addEventListener('click', async function(ev){
      ev.stopPropagation();
      if(!confirm('Удалить промпт «' + (btn.closest('.tree-item').querySelector('.name').textContent || '') + '»?')) return;
      const r = await delReq('/api/prompts?id=' + encodeURIComponent(btn.dataset.id));
      if(r.ok){ flash('Промпт удалён'); loadPromptTree(); }
      else flash(r.error || 'Ошибка удаления');
    });
  });
}

async function loadTab(tab){
  if(tab==='skills' || tab==='wiki'){
    setSidebarVisible(true);
    setTreeGroup(tab);
    if(state.selection && state.selection.kind === (tab==='skills' ? 'skill' : 'wiki')) openDoc(state.selection.kind, state.selection.name);
    else $('content').innerHTML = '<div class="placeholder">Выберите элемент слева.</div>';
    return;
  }
  if(tab==='db'){
    setSidebarVisible(true);
    setTreeGroup('db');
    const tree = await get('/api/db/tree');
    if(tree.error){ $('content').innerHTML = '<div class="empty">'+esc(tree.error)+'</div>'; return; }
    $('tree-db').innerHTML = dbTreeHtml(tree);
    bindDbTreeClick();
    if(state.selection && state.selection.kind === 'db' && state.selection.type && state.selection.id){
      openDbItem(state.selection.type, state.selection.id);
    } else if(tree.length){
      $('content').innerHTML = '<div class="placeholder">Выберите миссию или элемент дерева слева.</div>';
    } else {
      $('content').innerHTML = '<div class="card empty">База данных пуста</div>';
    }
    return;
  }
  if(tab==='prompt'){
    setSidebarVisible(true);
    setTreeGroup('prompt');
    $('content').innerHTML = promptHtml();
    bindPromptHandlers();
    loadCommon();
    loadPromptTree();
    return;
  }
  if(tab==='guide'){
    setSidebarVisible(true);
    setTreeGroup('guide');
    const g = await get('/api/guide');
    if(g.error){ $('content').innerHTML = '<div class="empty">'+esc(g.error)+'</div>'; return; }
    // Render content with IDs on H2 for anchor scrolling
    const rendered = renderMarkdown(g.content);
    const headerHtml =
      '<h1 style="margin:0 0 4px">'+esc(g.title)+'</h1>'+
      '<div class="doc-meta"><span>'+esc(g.path)+'</span><span>'+g.size+' B</span><span>'+esc(g.modified.slice(0,16))+'</span></div>';
    $('content').innerHTML = headerHtml + '<div class="md">'+rendered+'</div>';
    // Assign IDs to H2 elements for anchor scrolling
    const h2s = $('content').querySelectorAll('.md h2');
    h2s.forEach((h, i) => { h.id = 'sec-'+i; });
    // Build sidebar tree from H2s
    const items = Array.from(h2s).map((h, i) =>
      '<div class="tree-item" data-sec="sec-'+i+'">'+
        '<span class="icon">📑</span><span class="name">'+esc(h.textContent)+'</span></div>'
    ).join('');
    $('tree-guide').innerHTML = items;
    // Bind clicks: scroll to section
    $('tree-guide').addEventListener('click', (e) => {
      const item = e.target.closest('.tree-item');
      if(!item) return;
      document.querySelectorAll('#tree-guide .tree-item').forEach(x=>x.classList.remove('active'));
      item.classList.add('active');
      const secId = item.dataset.sec;
      const el = document.getElementById(secId);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
    return;
  }
  setSidebarVisible(false);
  if(tab==='mission'){
    const m = await get('/api/mission');
    const entries = Object.entries(m);
    $('content').innerHTML = entries.length
      ? entries.map(([name,content])=>{
          const isList = Array.isArray(content);
          return '<div class="card"><h3>'+esc(name)+'</h3>'+
            (isList ? '<div class="muted">'+content.map(esc).join('<br>')+'</div>' : '<details open><summary>показать</summary><pre>'+esc(content)+'</pre></details>')+'</div>';
        }).join('')
      : '<div class="card empty">Артефакты миссии не найдены</div>';
  }
}

/* ---- wiring ---- */
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  state.tab = b.dataset.tab;
  loadTab(state.tab);
}));

async function boot(){
  try {
    const s = await get('/api/state');
    const dbTxt = s.db ? ('миссии: '+s.db.missions+', задачи: '+s.db.tasks+', ревью: '+s.db.reviews) : (s.dbExists ? 'есть' : 'нет');
    $('status').textContent = 'БД ('+dbTxt+'), скилы: '+s.skills+', wiki: '+s.wiki;
  } catch(e){ $('status').textContent = 'ошибка подключения'; }
  await buildTrees();
  loadTab('skills');
}
boot();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/') return html(res, PAGE);
    if (url.pathname === '/api/state') {
      const dbCounts = { missions: 0, tasks: 0, reviews: 0 };
      if (existsSync(DB_PATH)) {
        const d = db();
        try {
          dbCounts.missions = d.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
          dbCounts.tasks = d.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
          dbCounts.reviews = d.prepare('SELECT COUNT(*) AS c FROM review_rounds').get().c;
        } catch (e) { /* ignore */ } finally { d.close(); }
      }
      return json(res, {
        dbExists: existsSync(DB_PATH),
        skills: readSkills().length,
        wiki: readWiki().length,
        db: dbCounts,
      });
    }
    if (url.pathname === '/api/skills') return json(res, readSkills());
    if (url.pathname === '/api/wiki') return json(res, readWiki());
    if (url.pathname === '/api/doc') {
      const kind = url.searchParams.get('kind');
      const name = url.searchParams.get('name');
      if (kind === 'skill') {
        const d = readSkillContent(name);
        return d ? json(res, d) : json(res, { error: 'skill not found: ' + name }, 404);
      }
      if (kind === 'wiki') {
        const d = readWikiContent(name);
        return d ? json(res, d) : json(res, { error: 'wiki page not found: ' + name }, 404);
      }
      return json(res, { error: 'bad kind' }, 400);
    }
    if (url.pathname === '/api/db') return json(res, dbState());
    if (url.pathname === '/api/db/tree') return json(res, dbTree());
    if (url.pathname === '/api/db/item') {
      const item = dbItem(url.searchParams.get('type'), url.searchParams.get('id'));
      return item ? json(res, item) : json(res, { error: 'item not found' }, 404);
    }
    if (url.pathname === '/api/prompts' && req.method === 'GET') {
      const common = readCommonPart() || DEFAULT_COMMON;
      return json(res, { common, prompts: readPrompts(), top: TOP_PROMPTS });
    }
    if (url.pathname === '/api/prompts' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (typeof data.text !== 'string' || !data.text.trim()) return json(res, { error: 'text required' }, 400);
          return json(res, savePrompt(data), 201);
        } catch (e) {
          return json(res, { error: String(e && e.message || e) }, 500);
        }
      });
      return;
    }
    if (url.pathname === '/api/prompts' && req.method === 'DELETE') {
      const ok = deletePrompt(url.searchParams.get('id'));
      return ok ? json(res, { ok: true }) : json(res, { error: 'not found' }, 404);
    }
    if (url.pathname === '/api/prompts/use' && req.method === 'POST') {
      const p = markPromptUsed(url.searchParams.get('id'));
      return p ? json(res, p) : json(res, { error: 'not found' }, 404);
    }
    if (url.pathname === '/api/prompts/common' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const c = saveCommonPart(data.text);
          return json(res, { common: c });
        } catch (e) {
          return json(res, { error: String(e && e.message || e) }, 500);
        }
      });
      return;
    }
    if (url.pathname === '/api/mission') return json(res, readMissionFiles());
    if (url.pathname === '/api/guide') {
      const d = readWikiContent('user-guide.md');
      return d ? json(res, { title: 'User Guide', path: d.path, size: d.size, modified: d.modified, content: d.content }) : json(res, { error: 'user-guide.md not found' }, 404);
    }
    json(res, { error: 'not found' }, 404);
  } catch (e) {
    json(res, { error: String(e && e.message || e) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[dashboard] http://localhost:${PORT}`);
  console.log(`[dashboard] root: ${ROOT}`);
});
