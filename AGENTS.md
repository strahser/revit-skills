# AGENTS.md — контекст проекта и конвенции хранения

## Проект

Репозиторий `strahser/revit-skills`: скилы и база знаний для разработки Revit-плагинов и 3D-вьювера.

- Скилы: `.opencode/skills/` (revit-api, revit-testing, revit-test-fixtures, revit-test-runner, revit-3d-export, revit-json-serialization, threejs-viewer, mcp-setup, revit-wiki)
- База знаний: `.opencode/wiki/` — читай `index.md` при старте сессии
- Git: `main`, remote `https://github.com/strahser/revit-skills.git`. Перед работой: `git pull`. После изменений скилов/wiki: commit + push (см. `.opencode/wiki/agent-workflow.md`).

## Оркестрация (opencode-orchestrator)

Плагин реализует цикл `Commander → Planner → Worker → Reviewer`. Запуск миссии — команда `/task "<описание>"`.

- Состояние миссии плагин хранит в `.opencode/`:
  - `context.md` — контекст миссии (инструкции, что сделано, где проблемы)
  - `todo.md` — задачи
  - `mission-ledger.jsonl` — журнал решений
  - `docs/brain/` — память (scratchpad, memories)
- При стагнации плагин сам применяет `DECOMPOSE → RE-PLAN → ASK`, а не зацикливается.
- При исчерпании контекста включается авто-компакция (`compaction.auto`); плагин сохраняет состояние миссии в компактирующий промпт.

## Хранилище проекта (SQLite) — главный источник правды о задаче

SQLite-база `.opencode/project.db` — структурированное хранилище состояния проекта:
инструкции заданий, что выполнено, где проблемы, документы, раунды ревью.

Доступ через **MCP-сервер `storage`** (локальный, `.opencode/storage-mcp.mjs`, без внешних зависимостей). Инструменты:

| Инструмент | Назначение |
|-----------|------------|
| `storage_init` | создать таблицы (вызывается автоматически) |
| `storage_query` | только SELECT (чтение состояния) |
| `storage_execute` | INSERT/UPDATE/DELETE/DDL (один оператор) |
| `storage_state` | снимок проекта: миссии, задачи, проблемы, ревью, документы |
| `storage_mission` | begin/update/complete миссии |
| `storage_task` | добавить/обновить подзадачу |
| `storage_problem` | записать/закрыть проблему |
| `storage_document` | сохранить документ (file/link/text) |
| `storage_review` | записать раунд независимого ревью |

Схема: `.opencode/schema.sql`. Таблицы: `missions`, `tasks`, `progress_log`, `problems`, `documents`, `review_rounds`.

### Обязательный порядок работы с хранилищем

1. **Старт миссии** — `storage_mission action=begin` (id вида `M-1`, title, description/задание, objective). Параллельно веди `context.md` плагина.
2. **План** — Planner: `storage_task action=add` для каждой подзадачи (status `todo`/`in_progress`, assigned_role).
3. **Работа** — Worker: обновляй статусы (`done` + `evidence` — файлы/тесты), пиши `progress_log` (`INSERT INTO progress_log ...`) о ключевых действиях.
4. **Проблемы** — при затруднении `storage_problem action=open` (severity: info/warning/blocker). Решение — `action=resolve` с полем resolution.
5. **Документы** — `storage_document`: `kind=link` (url) или `kind=text` (содержимое прямо в базе) или `kind=file` (path). Объём небольшой — храни текст целиком в базе, если документ короткий.
6. **Завершение работы агента** — `storage_mission action=complete`, затем:
7. **Независимое ревью** — новая сессия агента-ревьюера получает `storage_state`/`storage_query` по миссии, проверяет выполнение, пишет `storage_review` (status passed/failed, summary, **next_steps** — дальнейшие шаги по улучшению). Ревьюер делает это отдельной сессией с чистым контекстом.
8. **Возврат в цикл** — если ревью `failed`, Commander создаёт продолжение миссии с учётом `next_steps`.

### Восстановление контекста при перезагрузке сессии

При исчерпании контекста или старте новой сессии восстанови состояние так:

1. `storage_state` — полный снимок (миссии, открытые проблемы, ожидающие ревью).
2. `storage_query` по активной миссии (`SELECT ... FROM missions WHERE status='active'`) и её задачам.
3. `storage_query` по `problems WHERE status='open'` — где проблемы.
4. Прочитай `.opencode/context.md` (контекст миссии плагина).

## Скилы

Скилы подгружаются автоматически из `.opencode/skills/`. Для Revit-работы обращайся к релевантному скилу (revit-api, revit-testing, ...) вместо переписывания паттернов с нуля. Добавление нового скила/wiki — по `.opencode/wiki/agent-workflow.md`.
