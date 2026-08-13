---
name: revit-wiki
description: Project wiki knowledge base. Use when starting a session to read the knowledge hub from agent-skills\.opencode\wiki\index.md (links to local project wikis), or when updating wiki pages and self-management (adding skills, updating README, pushing to GitHub).
---

# Revit Project Wiki

Хаб знаний: `E:\ПлагиныРевит\agent-skills\.opencode\wiki\index.md`.

Структура вики (двухуровневая):
- **Общий хаб** `agent-skills\.opencode\wiki\index.md` — навигация: общие темы
  (MCP, workflow, структура, дашборд) + **ссылки на локальные вики проектов**.
- **Локальные вики проектов**: `<проект>\.opencode\wiki\index.md` — знание конкретного
  проекта (HeatLossRevit2, MepBimServer, MepTaggingSolution, dev-pipeline, AHUCalculator).

Все страницы — markdown. При старте сессии читай хаб `wiki/index.md`, затем локальную
вики проекта, с которым работаешь.

## Общий хаб (agent-skills) — страницы

| Файл | Содержание |
|------|-----------|
| `index.md` | Хаб: навигация по проектам + общие темы (читай ПЕРВЫМ) |
| `mcp-servers.md` | Документация MCP серверов |
| `project-structure.md` | Структура репозиториев и workspace |
| `agent-workflow.md` | Инструкция по самоуправлению: добавление скилов, обновление wiki, git push |
| `dashboard-opencontext.md` | Локальный дашборд и глобальная база знаний |
| `django-task-app.md` | Планировщик задач (внешний проект) |

Проектные страницы (Clean Architecture, JSON export, 3D viewer, tagging-*, heatloss-* и т.п.)
переехали в **локальные вики проектов** — см. ссылки в `index.md`.

## Локальные вики проектов

| Проект | Путь |
|--------|------|
| HeatLossRevit2 | `E:\ПлагиныРевит\HeatLossRevit2\.opencode\wiki\index.md` |
| MepBimServer | `E:\ПлагиныРевит\MepBimServer\.opencode\wiki\index.md` |
| MepTaggingSolution | `E:\ПлагиныРевит\MepTaggingSolution\.opencode\wiki\index.md` |
| dev-pipeline | `E:\ПлагиныРевит\dev-pipeline\.opencode\wiki\index.md` |
| AHUCalculator | `E:\ПлагиныРевит\AHUCalculator\.opencode\wiki\index.md` |

## Самоуправление

Агент должен самостоятельно:
- Добавлять новые навыки в `agent-skills\.opencode\skills\` и регистрировать их в README
- Обновлять вики (локальную проекта или общий хаб) при получении новой информации о проекте
- Пушить изменения в GitHub (agent-skills) или в репозиторий проекта (если `.opencode` не в `.gitignore`)
- При необходимости: редактировать глобальный конфиг `~/.config/opencode/opencode.jsonc`

Подробнее: [agent-workflow.md](agent-workflow.md)

## Плагины opencode

Установлены 3 кастомных плагина в `~/.config/opencode/plugins/` (автозагрузка из любой сессии):

| Плагин | Инструменты | Назначение |
|--------|-------------|------------|
| `html-tools` | `validate_html`, `fmt_html` | Проверка и форматирование HTML |
| `threejs-tools` | `rvt_to_threejs`, `calc_bbox` | Revit→Three.js конвертация, вычисление bbox |
| `revit-tools` | `build_revit`, `test_revit`, `revit_deploy` | Сборка, тесты, деплой .dll |

Исходники: `E:\ПлагиныРевит\.opencode\plugins\`

## Быстрые факты

- Проект: `E:\ПлагиныРевит\MepBimServer\` — C# ASP.NET + Revit плагин
- 3D вьювер: `MepBimServer\ui\demo3D\Index.html` — Three.js r170, standalone HTML
- Revit JSON экспорт лежит в `demo3D\ProjectExport_*.json`
- Навигация: `ui\partials\site-header.html`
- BoundingBox не экспортится для не-стен (windows, doors, floors, roofs) — это баг сериализации
- MCP серверы: opencode-browser (python/playwright) + playwright CLI
