import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
.tree-children { padding-left:18px; }
.tree-children.hidden { display:none; }
.content { flex:1; overflow:auto; padding:20px 28px; max-width:1100px; }
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

function sidebarVisibleFor(tab){ return tab === 'skills' || tab === 'wiki'; }
function setSidebarVisible(show){ $('sidebar').style.display = show ? '' : 'none'; }

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
  state.tab = item.dataset.kind;
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
async function loadTab(tab){
  if(tab==='skills' || tab==='wiki'){
    setSidebarVisible(true);
    if(state.selection && state.selection.kind===tab) openDoc(state.selection.kind, state.selection.name);
    else $('content').innerHTML = '<div class="placeholder">Выберите элемент слева.</div>';
    return;
  }
  setSidebarVisible(false);
  if(tab==='db'){
    const d = await get('/api/db');
    $('content').innerHTML = d.exists
      ? '<div class="grid">'+d.tables.map(t=>'<div class="card"><h3>'+esc(t.name)+' <span class="muted">('+t.count+')</span></h3>'+
          (t.rows.length ? '<details open><summary>последние записи</summary><div class="collapse"><pre>'+jsonHtml(t.rows)+'</pre></div></details>' : '<div class="muted">пусто</div>')+'</div>').join('')+'</div>'
      : '<div class="card empty">База данных не найдена: project.db</div>';
  } else if(tab==='mission'){
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
    $('status').textContent = 'БД: '+s.dbExists+', скилы: '+s.skills+', wiki: '+s.wiki;
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
      return json(res, {
        dbExists: existsSync(DB_PATH),
        skills: readSkills().length,
        wiki: readWiki().length,
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
    if (url.pathname === '/api/mission') return json(res, readMissionFiles());
    json(res, { error: 'not found' }, 404);
  } catch (e) {
    json(res, { error: String(e && e.message || e) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[dashboard] http://localhost:${PORT}`);
  console.log(`[dashboard] root: ${ROOT}`);
});
