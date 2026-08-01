---
name: revit-wiki
description: Project wiki knowledge base in .opencode/wiki/. Use when starting a session to read project context from wiki/index.md, or when updating wiki pages and self-management (adding skills, updating README, pushing to GitHub).
---

# Revit Project Wiki

Проектная wiki находится в `E:\ПлагиныРевит\revit-skills\.opencode\wiki\`.

Все страницы — markdown. При старте сессии читай wiki/index.md, чтобы получить контекст проекта.

## Страницы

| Файл | Содержание |
|------|-----------|
| `index.md` | Навигация по wiki |
| `revit-export.md` | Спецификация JSON экспорта геометрии Revit |
| `3d-viewer.md` | Архитектура Three.js вьювера, известные проблемы |
| `project-structure.md` | Структура репозиториев MepBimServer и revit-skills |
| `mcp-servers.md` | Документация MCP серверов |
| `agent-workflow.md` | Инструкция по самоуправлению: добавление скилов, обновление wiki, git push |

## Самоуправление

Агент должен самостоятельно:
- Добавлять новые навыки в `skills/` и регистрировать их в README
- Обновлять wiki при получении новой информации о проекте
- Пушить изменения в GitHub
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
