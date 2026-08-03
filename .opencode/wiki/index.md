# Revit Skills Wiki

База знаний по Revit плагинам и 3D-вьюверу.

## Разделы

- [Revit JSON Export](revit-export.md) — спецификация формата экспорта
- [3D Viewer](3d-viewer.md) — архитектура и отладка three.js вьювера
- [Project Structure](project-structure.md) — структура проекта MepBimServer
- [MCP Servers](mcp-servers.md) — документация MCP-серверов
- [Clean Architecture V10](clean-architecture-v10.md) — HeatLossRevit2: Revit=presenter, Core=бизнес-логика, Base=DTO
- [Dashboard и OpenContext](dashboard-opencontext.md) — локальный веб-дашборд и глобальная база знаний
- [Agent Workflow](agent-workflow.md) — самоуправление: добавление скилов, обновление wiki, git push
- [Revit TUnit Tests](revit-tunit-tests.md) — unit-тесты Revit с подключением к процессу (TUnit, SnapshotTool)
- [Django Task App](django-task-app.md) — планировщик задач: архитектура, переключение БД, фильтры, цель ToDoList

## Быстрые ссылки

| Что | Где |
|-----|-----|
| Вьювер | `MepBimServer\ui\demo3D\Index.html` |
| Revit плагин | `MepBimServer\` (C#) |
| Тестовый экспорт | `demo3D\ProjectExport_*.json` |
| Навигация шапка | `ui\partials\site-header.html` |
| Плагины opencode | `.opencode\plugins\` (html-tools, threejs-tools, revit-tools) |
