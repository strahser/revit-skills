# Project Structure

## MepBimServer (`E:\ПлагиныРевит\MepBimServer\`)

Основной C# ASP.NET проект — Revit плагин + веб-интерфейс.

```
MepBimServer\
  ├── Controllers\        — ASP.NET API контроллеры
  ├── Models\             — C# модели данных
  ├── Services\           — Бизнес-логика
  ├── Views\              — Razor-вьюхи
  ├── ui\
  │   ├── css\            — Стили
  │   ├── js\             — Клиентский JS
  │   ├── demo3D\         — Three.js 3D вьювер
  │   │   └── Index.html  — ✱ Главный файл вьювера
  │   └── partials\       — Razor partials
  │       └── site-header.html — ✱ Навигация
  └── wwwroot\            — Статика
```

Локальная вики: `MepBimServer\.opencode\wiki\index.md`.

## agent-skills (`E:\ПлагиныРевит\agent-skills\`)

Хаб знаний: общий репозиторий OpenCode навыков и wiki (`strahser/revit-skills`, main).

```
agent-skills\
  └── .opencode\
      ├── skills\         — Навыки (SKILL.md): Revit + конвейер dev-pipeline
      ├── wiki\           — Хаб: общие темы + ссылки на локальные вики проектов
      └── README.md       — Описание репозитория
```

## Workspace (`E:\ПлагиныРевит\`)

```
E:\ПлагиныРевит\
  ├── .opencode\             — Локальная opencode конфигурация
  │   ├── opencode.json      — MCP + skills.paths
  │   ├── package.json       — Зависимости (@opencode-ai/plugin)
  │   └── plugins\           — Кастомные плагины
  │       ├── html-tools.js  — Валидация и форматирование HTML
  │       ├── threejs-tools.js  — Revit→Three.js координаты, bbox
  │       └── revit-tools.js    — Сборка, тесты, деплой плагина
  ├── agent-skills\           — Хаб знаний: скилы + wiki (ссылки на проекты)
  ├── dev-pipeline\           — Фреймворк-конвейер задач (сервер, агенты, TDL)
  ├── HeatLossRevit2\         — Проект: плагин теплопотерь (локальная вики)
  ├── MepBimServer\           — Основной Revit/ASP.NET проект (локальная вики)
  ├── MepTaggingSolution\     — Проект: маркировка MEP (локальная вики)
  └── AHUCalculator\          — Проект: расчёт установок (локальная вики)
```

Каждый проект ведёт локальную вики в `<проект>\.opencode\wiki\index.md`;
навигация по всем проектам — в `agent-skills\.opencode\wiki\index.md`.

## Глобальные плагины (`~/.config/opencode/`)

Те же 3 плагина продублированы в глобальную директорию, чтобы загружаться при открытии любого проекта:
```
~/.config/opencode/
  ├── opencode.jsonc       — MCP + skills.paths (вкл. agent-skills\.opencode\skills)
  ├── package.json         — @opencode-ai/plugin
  └── plugins/
      ├── html-tools.js
      ├── threejs-tools.js
      └── revit-tools.js
```
