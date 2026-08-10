# AGENTS.md — revit-skills (база знаний по Revit)

**Роль репозитория:** общая база знаний и справочник скилов по Revit-разработке.
Это НЕ конвейер задач (конвейер — dev-pipeline) и НЕ рабочий проект (HeatLossRevit2 и др.).
Здесь живут **знания**: wiki проекта + общие скилы, которые нельзя точно отнести к агенту.

## Структура

- Скилы: `.opencode/skills/` — revit-api, revit-testing, revit-test-fixtures, revit-test-runner,
  revit-3d-export, revit-json-serialization, threejs-viewer, mcp-setup, revit-wiki, cloud-ai-bridge
- Wiki: `.opencode/wiki/` — читай `index.md` при старте сессии; страницы:
  `clean-architecture-v10.md` (HeatLossRevit2), `revit-export.md`, `3d-viewer.md`,
  `project-structure.md`, `mcp-servers.md`, `agent-workflow.md`, `revit-tunit-tests.md`,
  `dashboard-opencontext.md`, `django-task-app.md`
- Git: `main`, remote `https://github.com/strahser/revit-skills.git`. Перед работой: `git pull`.

## Как пополняется база знаний

1. Агенты конвейера dev-pipeline (executor/controller/reviewer/qwen-worker) получают новое
   стабильное знание при выполнении задач — и записывают его сюда (см. скилл `knowledge-base`
   в dev-pipeline).
2. Локальный путь: `D:\Projects\revit-skills\` (рабочий ПК: `E:\ПлагиныРевит\revit-skills\`).
3. Формат: markdown; заголовок H1; ссылки относительные; commit message на английском, краткий
   (до 80 символов). Коммиты делает контролёр (Агент-1): `docs:` или `agent/A-NN: wiki: ...`.
4. Новую страницу — добавить ссылку в `wiki/index.md`.
5. Не удалять существующие страницы и скилы без явной необходимости.

## Что НЕ делать

- Не вести здесь статусы задач/отчёты/вердикты — это dev-pipeline (TDL-задачи).
- Не коммитить: `.idea\`, `.opencode\` (runtime-состояние оркестратора устарело — не использовать),
  `node_modules`, `project.db`, логи.
- Устаревшая конфигурация оркестратора (opencode-orchestrator, /task, Commander/Planner/Worker)
  в `opencode.json` НЕ используется — конвейер живёт в dev-pipeline.

## Синхронизация

После изменений: commit + push (контролёр). Уведомление пользователю: «обновлено в revit-skills».
