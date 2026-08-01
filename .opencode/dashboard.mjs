import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const DB_PATH = join(ROOT, '.opencode', 'project.db');
const PORT = Number(process.env.DASHBOARD_PORT || 4317);

const SKILLS_DIR = join(ROOT, '.opencode', 'skills');
const WIKI_DIR = join(ROOT, '.opencode', 'wiki');

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

function json(res, data, code = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
}

const PAGE = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orchestrator Dashboard</title>
<style>
:root { --bg:#0f1117; --panel:#171a23; --panel2:#1d2130; --border:#2a2f42; --text:#e6e8ef; --muted:#9aa2b5; --accent:#6ea8ff; --green:#4ade80; --yellow:#facc15; --red:#f87171; }
* { box-sizing:border-box; }
body { margin:0; font:14px/1.5 system-ui,Segoe UI,sans-serif; background:var(--bg); color:var(--text); }
header { position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:16px; padding:10px 20px; background:#12141c; border-bottom:1px solid var(--border); }
header h1 { font-size:16px; margin:0; }
header .status { font-size:12px; color:var(--muted); }
nav { display:flex; gap:6px; flex-wrap:wrap; padding:10px 20px; border-bottom:1px solid var(--border); background:#14161f; }
nav button { background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; }
nav button:hover { border-color:var(--accent); }
nav button.active { background:var(--accent); color:#0b0f17; border-color:var(--accent); font-weight:600; }
main { padding:20px; max-width:1400px; margin:0 auto; }
.tab { display:none; }
.tab.active { display:block; }
.card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:16px; }
.card h3 { margin:0 0 10px; font-size:14px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
table { width:100%; border-collapse:collapse; font-size:12.5px; }
th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
th { color:var(--muted); font-weight:600; position:sticky; top:0; background:var(--panel); }
code, pre { font-family:Consolas,monospace; }
pre { background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:12px; overflow:auto; font-size:12px; max-height:600px; }
.badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; }
.badge.ok { background:#123b26; color:var(--green); }
.badge.warn { background:#3b3312; color:var(--yellow); }
.badge.err { background:#3b1212; color:var(--red); }
.badge.info { background:#12263b; color:var(--accent); }
.muted { color:var(--muted); }
summary { cursor:pointer; font-weight:600; }
.collapse { margin-top:8px; }
a { color:var(--accent); }
.empty { color:var(--muted); padding:20px; text-align:center; }
.json-key { color:var(--accent); } .json-str { color:var(--green); } .json-num { color:var(--yellow); }
</style>
</head>
<body>
<header>
  <h1>Revit Skills Orchestrator Dashboard</h1>
  <span class="status" id="status">…</span>
</header>
<nav>
  <button data-tab="skills" class="active">Скилы</button>
  <button data-tab="db">База данных</button>
  <button data-tab="mission">Миссия</button>
  <button data-tab="wiki">Wiki</button>
</nav>
<main>
  <section id="tab-skills" class="tab active"></section>
  <section id="tab-db" class="tab"></section>
  <section id="tab-mission" class="tab"></section>
  <section id="tab-wiki" class="tab"></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function jsonHtml(v){
  const s = JSON.stringify(v, null, 2);
  return esc(s).replace(/(&quot;[^&]*&quot;)(:?)/g, '<span class="json-key">$1</span>$2');
}
function badge(status){
  const map={done:'ok',completed:'ok',passed:'ok',resolved:'ok',active:'warn',todo:'info',in_progress:'warn',open:'warn',pending:'info',failed:'err',blocked:'err',cancelled:'err',warning:'warn',blocker:'err',info:'info'};
  return '<span class="badge '+(map[status]||'info')+'">'+esc(status)+'</span>';
}
function table(headers, rows){
  if(!rows.length) return '<div class="empty">Нет записей</div>';
  return '<table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
async function load(tab){
  const res = await fetch('/api/'+tab);
  const data = await res.json();
  const el = $('tab-'+tab);
  if(tab==='skills') el.innerHTML = skills(data);
  else if(tab==='db') el.innerHTML = dbTab(data);
  else if(tab==='mission') el.innerHTML = mission(data);
  else if(tab==='wiki') el.innerHTML = wiki(data);
}
function skills(d){
  return '<div class="grid">'+d.map(s=>'<div class="card"><h3>'+esc(s.name)+'</h3>'+
    '<div class="muted" style="font-size:12px;margin-bottom:6px">'+esc(s.path)+' · '+s.size+' B · '+esc(s.modified.slice(0,16))+'</div>'+
    '<div>'+esc(s.description)+'</div></div>').join('')+'</div>'+
    '<div class="card muted">Всего скилов: '+d.length+'</div>';
}
function dbTab(d){
  if(!d.exists) return '<div class="card empty">База данных не найдена: '+esc('project.db')+'</div>';
  return '<div class="grid">'+d.tables.map(t=>'<div class="card"><h3>'+esc(t.name)+' <span class="muted">('+t.count+')</span></h3>'+
    (t.rows.length? '<details open><summary>последние записи</summary><div class="collapse"><pre>'+jsonHtml(t.rows)+'</pre></div></details>' : '<div class="muted">пусто</div>')+
    '</div>').join('')+'</div>';
}
function mission(d){
  const entries = Object.entries(d);
  if(!entries.length) return '<div class="card empty">Артефакты миссии не найдены</div>';
  return entries.map(([name,content])=>{
    const isList = Array.isArray(content);
    return '<div class="card"><h3>'+esc(name)+'</h3>'+
      (isList ? '<div class="muted">'+content.map(esc).join('<br>')+'</div>' : '<details open><summary>показать</summary><pre>'+esc(content)+'</pre></details>')+'</div>';
  }).join('');
}
function wiki(d){
  return '<div class="grid">'+d.map(w=>'<div class="card"><h3>'+esc(w.name)+'</h3>'+
    '<div class="muted" style="font-size:12px">'+esc(w.path)+' · '+w.size+' B · '+esc(w.modified.slice(0,16))+'</div></div>').join('')+'</div>'+
    '<div class="card muted">Всего страниц: '+d.length+'</div>';
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const t=b.dataset.tab;
  $('tab-'+t).classList.add('active');
  load(t);
}));
async function boot(){
  try {
    const res = await fetch('/api/state');
    const s = await res.json();
    $('status').textContent = 'БД: '+s.dbExists+', скилы: '+s.skills+', wiki: '+s.wiki;
  } catch(e){ $('status').textContent = 'ошибка подключения'; }
  load('skills');
}
boot();
setInterval(()=>{ const a=document.querySelector('nav button.active'); if(a) load(a.dataset.tab); }, 15000);
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/') return html(res, PAGE);
    if (url.pathname === '/api/state') {
      return json(res, {
        dbExists: existsSync(DB_PATH),
        skills: readSkills().length,
        wiki: readWiki().length,
      });
    }
    if (url.pathname === '/api/skills') return json(res, readSkills());
    if (url.pathname === '/api/db') return json(res, dbState());
    if (url.pathname === '/api/mission') return json(res, readMissionFiles());
    if (url.pathname === '/api/wiki') return json(res, readWiki());
    json(res, { error: 'not found' }, 404);
  } catch (e) {
    json(res, { error: String(e && e.message || e) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[dashboard] http://localhost:${PORT}`);
  console.log(`[dashboard] root: ${ROOT}`);
});
