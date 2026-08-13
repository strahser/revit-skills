---
name: knowledge-base
description: Общая база знаний по Revit-плагинам и 3D-вьюверу (репозиторий strahser/revit-skills, рабочая копия agent-skills): хаб wiki в .opencode/wiki/ + локальные вики проектов (<проект>\.opencode\wiki\) + общие скилы в .opencode/skills/ (revit-api, revit-testing, revit-3d-export, threejs-viewer, pipeline-* и др.). Use when starting work on a Revit-related task (нужен контекст архитектуры/форматов/паттернов), when learning something new about the project (обнови локальную вики проекта или общий хаб), or when asked to maintain the project knowledge base.
---

# Knowledge Base (agent-skills)

Общая база знаний проектов Revit-разработки. Хранится в ОТДЕЛЬНОМ репозитории
`strahser/revit-skills` (рабочая копия `agent-skills` — это НЕ dev-pipeline и НЕ
HeatLossRevit2 — это хаб-справочник).

## Что и где лежит

| Что | Путь (локальный) | Репозиторий |
|---|---|---|
| Хаб wiki (общие темы + ссылки на проекты) | `E:\ПлагиныРевит\agent-skills\.opencode\wiki\` | strahser/revit-skills, main |
| Локальная вики проекта | `<проект>\.opencode\wiki\` (например, `E:\ПлагиныРевит\HeatLossRevit2\.opencode\wiki\`) | репозиторий проекта |
| Общие скилы | `E:\ПлагиныРевит\agent-skills\.opencode\skills\` | strahser/revit-skills, main |
| Скилы конвейера | те же `.opencode/skills/` (pipeline-*, planning-with-files, architect-review, …) | strahser/revit-skills, main |

## Вики — как устроено

| Страница | Содержание |
|---|---|
| `agent-skills\.opencode\wiki\index.md` | Хаб: навигация по локальным вики проектов + общие темы (читай ПЕРВЫМ) |
| `<проект>\.opencode\wiki\index.md` | Локальная вики конкретного проекта |
| `agent-skills\.opencode\wiki\mcp-servers.md` | Документация MCP-серверов |
| `agent-skills\.opencode\wiki\agent-workflow.md` | Самоуправление: добавление скилов, обновление wiki, git push |
| `agent-skills\.opencode\wiki\project-structure.md` | Структура репозиториев и workspace |
| `agent-skills\.opencode\wiki\dashboard-opencontext.md` | Локальный дашборд и глобальная база знаний |
| `agent-skills\.opencode\wiki\django-task-app.md` | Планировщик задач (внешний проект) |

Проектные страницы (Clean Architecture, tagging-core-split, heatloss-*, 3d-viewer, revit-export
и т.п.) живут в ЛОКАЛЬНЫХ вики соответствующих проектов.

## Общие скилы (общая база, НЕ привязаны к агентам)

Скилы в agent-skills — справочник паттернов и ролей. Используй их содержимое
как контекст, если задача касается Revit API, тестов, вьювера или конвейера:

- `revit-api` — базовые паттерны Revit API: транзакции, сборщики, геометрия
- `revit-testing` / `revit-test-fixtures` / `revit-test-runner` — unit-тесты (Nice3point.TUnit.Revit)
- `revit-3d-export` / `revit-json-serialization` — экспорт геометрии и сериализация
- `threejs-viewer` — архитектура Three.js вьювера
- `mcp-setup` — настройка MCP-серверов
- `cloud-ai-bridge` — роутинг задач к облачному ИИ (ТЗ-шаблоны, контракт полноты)
- `revit-wiki` — описание wiki и самоуправления
- `pipeline-*`, `planning-with-files`, `architect-review`, `software-architecture`,
  `solid-principles` — роли/методики конвейера dev-pipeline

## Когда использовать

1. **Перед Revit-задачей** — прочитай хаб `wiki/index.md`, затем локальную вики проекта
   (например, `HeatLossRevit2\.opencode\wiki\index.md`) и релевантную страницу.
2. **Новая информация о конкретном проекте** (архитектура, баг, формат, конфигурация) —
   ОБНОВИ локальную вики проекта.
3. **Новое общее знание** (паттерн, формат, MCP) — в хаб agent-skills.
4. **Новый полезный паттерн** — добавь в скил agent-skills или создай новый.

## Правила пополнения базы знаний (ОБЯЗАТЕЛЬНО для всех агентов конвейера)

Агенты конвейера (executor, controller, reviewer, qwen-worker) пополняют wiki:

1. Узнал что-то новое и стабильное (не одноразовый факт) — записывай в вики
   (локальную проекта или общий хаб), НЕ держи знания только в отчётах по задачам.
2. Git-дисциплина: общий хаб — ветка `main`, коммиты `docs:` или `agent/A-NN: wiki: ...`;
   проектные вики — коммиты в репозиторий проекта (если `.opencode` не в `.gitignore`).
3. Формат: markdown; заголовок H1; ссылки относительные; commit message на английском,
   краткий (до 80 символов).
4. Не удаляй существующие страницы и скилы без согласования.
5. `wiki/index.md` (соответствующей вики) — обновляй ссылку при добавлении новой страницы.

## Разграничение с dev-pipeline

| dev-pipeline | agent-skills + локальные вики |
|---|---|
| Конвейер задач: TDL-задачи, отчёты, вердикты, статусы | База знаний: хаб + локальные вики проектов + общие скилы |
| Источник истины по ЗАДАЧАМ | Источник истины по ЗНАНИЯМ (архитектура, паттерны, форматы) |
| Жизненный цикл A-NN | Жизненный цикл знаний (пополнение при новом знании) |

Не дублируй содержимое: отчёты задач остаются в dev-pipeline, знания — в вики.
Ссылка из отчёта на wiki-страницу — приветствуется.
