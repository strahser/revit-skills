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

## revit-skills (`E:\ПлагиныРевит\revit-skills\`)

Репозиторий OpenCode навыков и wiki.

```
revit-skills\
  └── .opencode\
      ├── skills\         — Навыки (SKILL.md)
      ├── wiki\           — База знаний (markdown)
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
  ├── MepBimServer\          — Основной проект
  └── revit-skills\          — Навыки + wiki
```

## Глобальные плагины (`~/.config/opencode/`)

Те же 3 плагина продублированы в глобальную директорию, чтобы загружаться при открытии любого проекта:
```
~/.config/opencode/
  ├── opencode.jsonc       — MCP + skills.paths
  ├── package.json         — @opencode-ai/plugin
  └── plugins/
      ├── html-tools.js
      ├── threejs-tools.js
      └── revit-tools.js
```
