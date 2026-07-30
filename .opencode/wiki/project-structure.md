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
  ├── .opencode\           — Локальная opencode конфигурация
  │   ├── opencode.json    — Основной конфиг (MCP + skills import)
  │   └── skills\          — Локальные/временные навыки
  ├── MepBimServer\        — Основной проект
  └── revit-skills\        — Навыки + wiki
```
