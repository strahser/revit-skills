# Revit Skills Orchestrator — Полное руководство пользователя

Детальная инструкция: развёртывание системы, ежедневное использование, где хранятся скилы,
поведение оркестратора с GitHub, содержимое базы данных и отслеживание миссий.
Проверено на реальной системе 2026-08-01.

---

## 1. Обзор системы

Система состоит из четырёх слоёв:

```
┌─────────────────────────────────────────────────────────┐
│  OpenCode TUI (терминал) — точка входа: /task, /cancel   │
├─────────────────────────────────────────────────────────┤
│  Плагин opencode-orchestrator v1.7.10                   │
│  Цикл: Commander → Planner → Worker → Reviewer          │
│  Состояние: .opencode/ (todo.md, context.md, ledger)    │
├─────────────────────────────────────────────────────────┤
│  SQLite project.db (.opencode/project.db)               │
│  MCP storage (.opencode/storage-mcp.mjs)                │
├─────────────────────────────────────────────────────────┤
│  Дашборд (node .opencode/dashboard.mjs) → :4317         │
│  MCP: playwright, revit-mcp, memory, pdf, filesystem    │
└─────────────────────────────────────────────────────────┘
```

**Компоненты:**

| Компонент | Что делает | Как запустить |
|---|---|---|
| **opencode** (TUI) | основной терминал агента | `opencode` |
| **opencode-orchestrator** | мультиагентный цикл миссий | автоматически (плагин) |
| **storage-mcp.mjs** | доступ к БД через MCP | автоматически (MCP server) |
| **dashboard.mjs** | веб-панель состояния | `node .opencode/dashboard.mjs` → http://localhost:4317 |
| **project.db** | SQLite-хранилище миссий | readOnly из дашборда, запись через storage MCP |

---

## 2. Развёртывание с нуля

### 2.1. Требования

| Требование | Версия | Проверка |
|---|---|---|
| Node.js | 24+ | `node --version` |
| opencode | актуальная | `opencode --version` |
| npm | 10+ | `npm --version` |
| Revit (для revit-mcp) | 2022–2026 (у нас 2024) | `C:\Program Files\Autodesk\Revit 2024\` |

### 2.2. Шаги установки

```powershell
# 1. Установить opencode (глобально)
npm install -g opencode

# 2. Установить плагин оркестратора (глобально)
npm install -g opencode-orchestrator

# 3. Установить MCP-серверы (глобально, без зависимостей сборки)
npm install -g @playwright/mcp
npm install -g @shuotao/revit-mcp-server
npm install -g @modelcontextprotocol/server-memory
npm install -g @modelcontextprotocol/server-sequential-thinking
npm install -g @modelcontextprotocol/server-pdf
npm install -g @modelcontextprotocol/server-filesystem

# 4. Установить браузер Playwright (Chromium)
#    пакет: @playwright/mcp, браузер ставится через npx playwright install chromium
npx playwright install chromium
```

**Важно про `mcp-server-for-revit`:** не использовать — пакет требует `better-sqlite3`
(MSVC/node-gyp), для Node 24 нет prebuilt. Рабочая альтернатива: `@shuotao/revit-mcp-server`
(чистый JS).

### 2.3. Структура проекта (что должно быть)

```
Default Project/                      ← корень проекта (рабочая папка)
├── opencode.json                     ← конфиг opencode (MCP, агенты, плагин)
├── AGENTS.md                         ← инструкции для агента (подгружается в сессию)
├── .opencode/
│   ├── dashboard.mjs                 ← веб-дашборд
│   ├── storage-mcp.mjs               ← MCP-сервер БД
│   ├── schema.sql                    ← схема БД
│   ├── project.db                    ← SQLite (миссии, задачи, проблемы...)
│   ├── skills/                       ← 9 скилов (SKILL.md)
│   ├── wiki/                         ← база знаний (инструкции, guide)
│   ├── todo.md                       ← задачи текущей миссии (runtime)
│   ├── context.md                    ← контекст миссии (runtime)
│   ├── mission-ledger.jsonl          ← журнал решений (runtime)
│   └── prompt-drafts.json            ← сохранённые промпты (из дашборда)
```

### 2.4. Revit MCP аддон (C#)

Для работы геометрических инструментов Revit MCP нужен C#-аддон в Revit:

```powershell
# Клонировать репозиторий аддона
git clone --depth 1 https://github.com/shuotao/REVIT_MCP_study.git C:\Users\Strakhov\AppData\Local\Temp\opencode\REVIT_MCP_study

# Собрать для своей версии Revit (у нас 2024 → Release.R24; 2025 → R25 и т.д.)
cd C:\Users\Strakhov\AppData\Local\Temp\opencode\REVIT_MCP_study\MCP
dotnet build -c Release.R24 RevitMCP.csproj

# Задеплоить: .addin в папку версии, DLL в подпапку RevitMCP\
$addinDir = "$env:APPDATA\Autodesk\Revit\Addins\2024"
Copy-Item .\RevitMCP.addin $addinDir
Copy-Item .\bin\Release.R24\*.dll "$addinDir\RevitMCP\"
```

Проверка: файлы `RevitMCP.addin` и `RevitMCP\RevitMCP.dll` должны быть в
`%APPDATA%\Autodesk\Revit\Addins\2024\`. Затем **запустить Revit 2024** и включить
**MCP Service** на ленте (порт 8964).

---

## 3. Конфигурация opencode.json

Файл: `opencode.json` в корне проекта. Ключевые блоки:

```jsonc
{
  "instructions": ["AGENTS.md", ".opencode/wiki/index.md"],   // глобальные промпты (system prompt)
  "skills": { "paths": [".opencode/skills"] },                 // где искать скилы
  "plugin": [ ["opencode-orchestrator", { "agentConcurrency": { "planner": 4, "worker": 4, "reviewer": 4 }, "missionLoop": { "ledger": true, "markdownMemory": true } }] ],
  "agent": {
    "Commander": { "model": "opencode/nemotron-3-ultra-free" },
    "Planner":   { "model": "opencode/nemotron-3-ultra-free" },
    "Worker":    { "model": "opencode/deepseek-v4-flash-free" },
    "Reviewer":  { "model": "opencode/big-pickle" }            // отдельная модель для ревью
  },
  "mcp": {
    "storage": { "type": "local", "command": ["node", ".opencode/storage-mcp.mjs"], "enabled": true },
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp", "enabled": true },
    "memory": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-memory\\dist\\index.js"], "enabled": true },
    "sequential-thinking": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-sequential-thinking\\dist\\index.js"], "enabled": true },
    "pdf": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-pdf\\dist\\index.js", "--stdio"], "enabled": true },
    "filesystem": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-filesystem\\dist\\index.js", "C:\\Users\\Strakhov\\OneDrive\\Документы\\Default Project"], "enabled": true },
    "playwright": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@playwright\\mcp\\cli.js"], "enabled": true, "environment": { "PLAYWRIGHT_BROWSERS_PATH": "C:\\Users\\Strakhov\\AppData\\Local\\ms-playwright" } },
    "revit-mcp": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@shuotao\\revit-mcp-server\\build\\index.js"], "enabled": true, "environment": { "REVIT_MCP_PORT": "8964", "MCP_PROFILE": "structural" } }
  }
}
```

**Важные нюансы:**
- **pdf**: обязателен флаг `--stdio`, иначе сервер уходит в HTTP-режим и не отвечает по stdio
- **filesystem**: путь должен существовать и быть доступным (кириллица «Документы» — нормально)
- **revit-mcp**: порт 8964 должен совпадать с портом аддона в Revit; профиль `structural`
- **instructions** = глобальные промпты проекта: `AGENTS.md` + `wiki/index.md` загружаются в каждую сессию

---

## 4. Ежедневное использование

### 4.1. Быстрый старт

```powershell
# 1. Запустить дашборд (в отдельном окне/фоне)
node .opencode/dashboard.mjs
# → http://localhost:4317

# 2. Запустить opencode (TUI)
opencode
```

### 4.2. Сценарии

| Сценарий | Действие |
|---|---|
| Запустить новую задачу | `/task "описание задачи"` |
| Посмотреть прогресс | дашборд → вкладка «Миссия» (todo.md, context.md) или «База данных» |
| Остановить миссию | `/cancel` или `/stop` |
| Продолжить прерванную | новый `/task` (миссия персистентна) |
| Посмотреть агентов | `/agents` |
| Сохранить черновик промпта | дашборд → «Промпт» → «Сохранить черновик» |

---

## 5. Миссии и команда /task

### 5.1. Как работает

`/task "..."` — единственная команда для запуска миссии:

```text
/task "Исправить навигацию дашборда и записать результат в БД"
        │
        ▼
  Commander (планирует итерации)
        │ делегирует
        ▼
  Planner → Worker → Reviewer
        │
        ▼
  Состояние: .opencode/ (todo.md, context.md, mission-ledger.jsonl)
  БД: project.db (missions, tasks, progress_log, problems, documents, review_rounds)
```

### 5.2. «Нужно ли каждый раз вызывать /task внутри сессии?»

**НЕТ.** Миссия **персистентна**:

- `/task` с текстом создаёт новую миссию (M-N) **или** продолжает активную
- Цикл продолжается автоматически (плагин сам перезапускает итерации, пока не завершится)
- Повторно `/task` вводить **не нужно** — только если хочешь новую задачу или возобновить прерванную
- Остановка: `/cancel` (деактивирует), `/stop` (останавливает)

**Пример полного цикла:**
```text
> /task "Добавить в дашборд вкладку «Промпт»"
  → M-3 создана в project.db, todo.md создан, Commander стартует
  → Planner разбивает на T-3.1...T-3.2
  → Worker пишет код, Reviewer проверяет
  → всё [x], миссия status='done'
```

---

## 6. Где хранятся скилы и wiki

### 6.1. Скилы

**Путь:** `.opencode/skills/<имя>/SKILL.md` (9 штук):

| Скил | Назначение |
|---|---|
| `revit-api` | Revit API (Nice3point) |
| `revit-testing` | тесты RevitApiTest |
| `revit-test-fixtures` | фикстуры/данные для тестов |
| `revit-test-runner` | запуск тестов |
| `revit-3d-export` | экспорт геометрии для Three.js |
| `revit-json-serialization` | сериализация в JSON |
| `threejs-viewer` | 3D-вьювер |
| `mcp-setup` | настройка MCP |
| `revit-wiki` | самоуправление wiki |

**Как подключаются:** автоматически. opencode читает `skills.paths` из конфига и
загружает SKILL.md при совпадении описания задачи. **Не нужно** указывать скил вручную.

**Формат SKILL.md** (frontmatter обязателен):
```markdown
---
name: revit-api
description: Build Revit model automation... (когда использовать)
---
# Содержимое скила
```

### 6.2. Wiki

**Путь:** `.opencode/wiki/*.md` (индекс: `index.md`):

| Страница | Содержимое |
|---|---|
| `index.md` | оглавление базы знаний |
| `revit-export.md` | спецификация формата экспорта |
| `3d-viewer.md` | архитектура вьювера |
| `project-structure.md` | структура проекта MepBimServer |
| `mcp-servers.md` | MCP-серверы (8 рабочих) |
| `clean-architecture-v10.md` | архитектура HeatLossRevit2 |
| `dashboard-opencontext.md` | дашборд + OpenContext |
| `agent-workflow.md` | самоуправление: скилы, wiki, git push |
| `orchestrator-guide.md` | краткая инструкция по оркестратору |
| `user-guide.md` | **этот файл** — полное руководство |

---

## 7. Оркестратор и GitHub

### 7.1. Делает ли оркестратор коммиты и push?

**НЕТ, автоматически — нет.** Плагин `opencode-orchestrator` управляет миссиями,
но **не трогает git**. Коммиты выполняют **агенты внутри миссии**, когда задача
включает «закоммитить и запушить» (по `agent-workflow.md`).

### 7.2. Как это работает на практике

Агент (Worker/Commander) по инструкции выполняет:

```powershell
cd C:\Users\Strakhov\OneDrive\Документы\Default Project
git pull                     # сначала синхронизация
git add -A
git commit -m "описание изменений"
git push skills master       # remote «skills» → https://github.com/strahser/revit-skills.git
```

**Важно про ветки/remote:**
```powershell
git remote -v
# skills  https://github.com/strahser/revit-skills.git (fetch)
# skills  https://github.com/strahser/revit-skills.git (push)

git branch --show-current    # master (локальная)
git push skills master       # пушит локальную master в remote
```

### 7.3. Что НЕ коммитится (runtime-артефакты в .gitignore)

| Файл | Почему не в git |
|---|---|
| `.opencode/todo.md`, `context.md`, `work-log.md`, `status.md` | рантайм-состояние миссий |
| `.opencode/sync-issues.md`, `integration-status.md` | синхронизация (рантайм) |
| `.opencode/project.db` | SQLite-БД (рантайм) |
| `.opencode/docs/`, `archive/`, `unit-tests/` | временные/память |
| `.opencode/prompt-drafts.json` | черновики промптов |

**Публикуются на GitHub:** `opencode.json`, `AGENTS.md`, `.opencode/skills/`, `.opencode/wiki/`,
`.opencode/dashboard.mjs`, `schema.sql`, `.opencode/README.md`.

### 7.4. Как убедиться, что изменения ушли на GitHub

```powershell
git status          # чисто?
git log --oneline -5
git push skills master
```

---

## 8. База данных project.db

### 8.1. Файлы

| Что | Путь |
|---|---|
| БД | `.opencode/project.db` (SQLite) |
| Схема | `.opencode/schema.sql` |
| MCP-сервер | `.opencode/storage-mcp.mjs` |

### 8.2. Таблицы (6)

```sql
missions       -- миссии: id (M-1), title, description, objective, status (active/done/cancelled), iteration, created_at, completed_at
tasks          -- подзадачи: id (T-3.1), mission_id, title, description, status (todo/in_progress/done/blocked), assigned_role (worker/planner/reviewer), evidence, completed_at
progress_log   -- хронология: mission_id, task_id, action (started/done/problem/note), detail, file_refs, created_at
problems       -- проблемы: mission_id, task_id, severity (info/warning/blocker), description, resolution, status (open/resolved), resolved_at
documents      -- документы: mission_id, title, kind (file/link/text), path, url, content, description
review_rounds  -- ревью: mission_id, reviewer, model, status (pending/passed/failed), summary, next_steps
```

### 8.3. Доступ к БД

**Через MCP storage** (предпочтительно):

| Инструмент | Назначение |
|---|---|
| `storage_init` | создать таблицы (авто) |
| `storage_query` | SELECT (чтение) |
| `storage_execute` | INSERT/UPDATE/DELETE/DDL (один оператор) |
| `storage_state` | снимок проекта |
| `storage_mission` | begin/update/complete миссии |
| `storage_task` | добавить/обновить подзадачу |
| `storage_problem` | открыть/закрыть проблему |
| `storage_document` | сохранить документ |
| `storage_review` | записать раунд ревью |

**Прямой SQL** (для отладки/чтения):

```powershell
node -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('.opencode/project.db',{readOnly:true}); console.log(d.prepare('SELECT * FROM missions').all()); d.close();"
```

### 8.4. Примеры запросов

```sql
-- Активные миссии
SELECT id, title, status FROM missions WHERE status='active';

-- Задачи миссии M-3
SELECT id, title, status, assigned_role FROM tasks WHERE mission_id='M-3';

-- Открытые проблемы
SELECT id, severity, status, description FROM problems WHERE status='open';

-- Последние события
SELECT * FROM progress_log ORDER BY id DESC LIMIT 10;

-- Документы миссии
SELECT id, title, kind FROM documents WHERE mission_id='M-3';
```

---

## 9. MCP-серверы

| Сервер | Пакет | Инструментов | Статус |
|---|---|---|---|
| **storage** | свой `.opencode/storage-mcp.mjs` | 9 | ✅ работает |
| **context7** | remote `https://mcp.context7.com/mcp` | — | ✅ работает |
| **memory** | `@modelcontextprotocol/server-memory` | 9 | ✅ работает |
| **sequential-thinking** | `@modelcontextprotocol/server-sequential-thinking` | 1 | ✅ работает |
| **pdf** | `@modelcontextprotocol/server-pdf` (**--stdio обязателен**) | 9 | ✅ работает |
| **filesystem** | `@modelcontextprotocol/server-filesystem` | 14 | ✅ работает |
| **playwright** | `@playwright/mcp@0.0.78` | 24 | ✅ работает |
| **revit-mcp** | `@shuotao/revit-mcp-server@1.6.0` | 71 | ✅ работает (нужен аддон в Revit) |
| **git** | `@liangshanli/mcp-server-git` | — | ⛔ disabled (не используется) |

**Нюансы:**
- **pdf**: без `--stdio` сервер поднимает HTTP на порту и молчит по stdio (несколько минут «таймаут») — это была частая ошибка
- **filesystem**: аргументом передаётся путь; кириллица ок, но путь должен существовать
- **revit-mcp**: handshake проходит (71 инструмент), но вызовы вернут `Error:`, если Revit не запущен с включённым MCP Service на ленте (порт 8964)
- **handshake-тест** (как проверяли):
```javascript
// initialize → {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
// notifications/initialized → БЕЗ id (иначе зависнет!)
// tools/list → {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

---

## 10. Дашборд

**Запуск:**
```powershell
node .opencode/dashboard.mjs
# → http://localhost:4317
```

**Вкладки:**

| Вкладка | Что показывает |
|---|---|
| **Скилы** | дерево 9 скилов, просмотр SKILL.md справа |
| **Wiki** | дерево страниц wiki, просмотр markdown справа |
| **База данных** | дерево миссий → задачи/проблемы/документы/ревью; окно ревью (summary + next_steps) |
| **Миссия** | рантайм-артефакты: todo.md, context.md, work-log.md, mission-ledger.jsonl |
| **Промпт** | композитор промпта: написать → сохранить черновик → скопировать `/task` |

Дашборд **readOnly** для БД (никаких изменений), черновики промптов пишутся в
отдельный `.opencode/prompt-drafts.json`.

---

## 11. Отслеживание промпта в миссии

**Вопрос:** как включить отслеживание промпта (задачи) в миссии?

### 11.1. Механика

Промпт (текст задачи) попадает в миссию через команду `/task`. Плагин при старте
миссии фиксирует промпт в трёх местах:

| Где | Что именно |
|---|---|
| **project.db → missions.description** | текст промпта (поле `description`) |
| **project.db → missions.objective** | цель миссии |
| **.opencode/context.md** | контекст миссии |
| **.opencode/todo.md** | разбивка на подзадачи |
| **.opencode/mission-ledger.jsonl** | журнал решений |

### 11.2. Полный workflow «промпт → миссия → отслеживание»

```text
Шаг 1. Дашборд → вкладка «Промпт»
       └─ написать текст → «Сохранить черновик» (prompt-drafts.json)
Шаг 2. «Копировать /task» → команда /task "текст" в буфере обмена
Шаг 3. Вставить в терминал opencode → Enter
       └─ плагин создаёт миссию M-N:
          • project.db: missions (description=промпт, status='active')
          • tasks: подзадачи T-N.x
          • progress_log: 'started'
Шаг 4. Отслеживание:
       └─ дашборд → «Миссия»: todo.md, context.md, ledger
       └─ дашборд → «База данных»: дерево M-N → задачи/ревью
       └─ или SQL: SELECT * FROM missions WHERE status='active';
Шаг 5. Завершение:
       └─ Reviewer: review_rounds (passed/failed)
       └─ миссия status='done', completed_at заполнен
```

### 11.3. Пример (реальный, из этой системы)

Промпт: `"Добавить в дашборд вкладку «Промпт»"`

```sql
-- после /task
SELECT id, title, status, description FROM missions WHERE id='M-3';
-- M-3 | Dashboard DB tree + review window + orchestrator guide | active | <промпт>

SELECT id, title, status FROM tasks WHERE mission_id='M-3';
-- T-3.1 | Dashboard: DB tree + review window + prompt tab   | done
-- T-3.2 | Orchestrator usage guide (wiki + DB)              | done

SELECT reviewer, status, summary FROM review_rounds WHERE mission_id='M-3';
-- reviewer | passed | ...

SELECT id, title, kind FROM documents WHERE mission_id='M-3';
-- 3 | Orchestrator Usage Guide | text
```

### 11.4. Если миссия прервана (перезагрузка сессии)

```text
1. storage_state → снимок (активные миссии, открытые проблемы)
2. SELECT ... FROM missions WHERE status='active' → активная миссия
3. SELECT ... FROM problems WHERE status='open' → где проблемы
4. Прочитать .opencode/context.md → контекст
5. /task "тот же текст" → продолжить
```

---

## 12. Устранение неполадок

| Симптом | Причина | Решение |
|---|---|---|
| pdf-сервер молчит (timeout) | запущен без `--stdio` | добавить `--stdio` в аргументы конфига |
| filesystem «None of the directories are accessible» | неверный путь/кириллица | указать существующий путь с «Документы» |
| revit-mcp инструменты → `Error:` | Revit не запущен / MCP Service выключен | запустить Revit 2024, включить на ленте (8964) |
| `notifications/initialized` зависает | отправлен с id | слать БЕЗ id (notify) |
| миссия «зависла» | стагнация цикла | `/cancel`, затем новый `/task` |
| верификатор «Sync issues not resolved: N» при чистом файле | внешний слой платформы (кэш) | перезапустить opencode-сессию; файл уже чист, БД чиста |

---

## Быстрые команды (шпаргалка)

```powershell
# Запуск
opencode
node .opencode/dashboard.mjs

# Миссии
/task "описание"          # старт/продолжение
/cancel                   # деактивировать
/stop                     # остановить
/agents                   # список агентов

# БД (чтение)
node -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('.opencode/project.db',{readOnly:true}); console.log(d.prepare('SELECT id,title,status FROM missions').all()); d.close();"

# Git
git pull
git add -A
git commit -m "..."
git push skills master

# Проверка MCP (handshake)
# см. раздел 9.3
```
