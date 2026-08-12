# Revit Skills Wiki

База знаний по Revit плагинам и 3D-вьюверу.

## Разделы

- [Revit JSON Export](revit-export.md) — спецификация формата экспорта
- [3D Viewer](3d-viewer.md) — архитектура и отладка three.js вьювера
- [Project Structure](project-structure.md) — структура проекта MepBimServer
- [MCP Servers](mcp-servers.md) — документация MCP-серверов
- [Clean Architecture V10](clean-architecture-v10.md) — HeatLossRevit2: Revit=presenter, Core=бизнес-логика, Base=DTO
- [Revit API: потоки и ExternalEvent](revit-external-events.md) — правило «Revit API только через ExternalEvent», диагноз deadlock в SpaceLinkingViewModel, аудит обращений
- [Dashboard и OpenContext](dashboard-opencontext.md) — локальный веб-дашборд и глобальная база знаний
- [Agent Workflow](agent-workflow.md) — самоуправление: добавление скилов, обновление wiki, git push
- [Revit TUnit Tests](revit-tunit-tests.md) — unit-тесты Revit с подключением к процессу (TUnit, SnapshotTool)
- [Django Task App](django-task-app.md) — планировщик задач: архитектура, переключение БД, фильтры, цель ToDoList
- [MepTagging: Разделение ядра](tagging-core-split.md) — Ядро 1 (отопление, v5CBR) vs Ядро 2 (воздуховоды/3D/кластеризация); священные файлы и golden-тест идентичности
- [MepTagging: баги размещения марок приборов и труб](tagging-marking-bugs.md) — марки приборов внутри помещений (профиль без архитектурной ссылки + FindFreePoint), не удалялись старые марки труб, двойная выноска вместо одинарной
- [Создание стен: исправление багов](walls-creation-fixes.md) — радио «Пользовательская» в WallsAllSpacesCreatorDS; «Ошибка создания стен по функции/по типам» в WallsFromFacesCreatorDS
- [Окно теплопотерь и панель свойств: исправления](heatloss-ui-fixes-2026-08-11.md) — метод инфильтрации Sum/Max в конвейере; валидация удалённых моделей; сводки по типам/уровням; «Детализация»; PropertyPalette
- [Настройки, валидация, хранение](heatloss-settings-validation-storage-2026-08-11.md) — единый источник настроек (configs/ vs JSON-БД); static-флаг → явная передача; самоизлечение реестра (Adopted/DeletedProgrammatically); content-addressed снимки + snapshotHash

## Быстрые ссылки

| Что | Где |
|-----|-----|
| Вьювер | `MepBimServer\ui\demo3D\Index.html` |
| Revit плагин | `MepBimServer\` (C#) |
| Тестовый экспорт | `demo3D\ProjectExport_*.json` |
| Навигация шапка | `ui\partials\site-header.html` |
| Плагины opencode | `.opencode\plugins\` (html-tools, threejs-tools, revit-tools) |
