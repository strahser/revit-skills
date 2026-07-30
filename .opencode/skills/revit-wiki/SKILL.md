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

## Быстрые факты

- Проект: `E:\ПлагиныРевит\MepBimServer\` — C# ASP.NET + Revit плагин
- 3D вьювер: `MepBimServer\ui\demo3D\Index.html` — Three.js r170, standalone HTML
- Revit JSON экспорт лежит в `demo3D\ProjectExport_*.json`
- Навигация: `ui\partials\site-header.html`
- BoundingBox не экспортится для не-стен (windows, doors, floors, roofs) — это баг сериализации
- MCP серверы: opencode-browser (python/playwright) + playwright CLI
