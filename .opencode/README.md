# Revit Skills for OpenCode

Набор навыков (skills) для [OpenCode](https://opencode.ai), упрощающих разработку плагинов и тестов для Autodesk Revit.

## Skills

| Skill | Описание |
|-------|----------|
| [revit-api](skills/revit-api/SKILL.md) | Базовые паттерны Revit API: транзакции, сборщики, геометрия |
| [revit-testing](skills/revit-testing/SKILL.md) | Unit-тесты с Nice3point.TUnit.Revit |
| [revit-test-fixtures](skills/revit-test-fixtures/SKILL.md) | Фикстуры, хуки, параметризованные тесты |
| [revit-test-runner](skills/revit-test-runner/SKILL.md) | Автоматизация запуска тестов в Revit |
| [revit-3d-export](skills/revit-3d-export/SKILL.md) | Экспорт геометрии Revit для 3D-вьювера |
| [revit-json-serialization](skills/revit-json-serialization/SKILL.md) | Сериализация Revit объектов в JSON |
| [threejs-viewer](skills/threejs-viewer/SKILL.md) | Архитектура Three.js 3D вьювера |
| [mcp-setup](skills/mcp-setup/SKILL.md) | Настройка MCP серверов |
| [revit-wiki](skills/revit-wiki/SKILL.md) | База знаний проекта (автозагрузка при старте) |

## Wiki

База знаний проекта: [wiki/](wiki/index.md)

- [Revit JSON Export](wiki/revit-export.md) — спецификация формата экспорта
- [3D Viewer](wiki/3d-viewer.md) — архитектура и отладка
- [Project Structure](wiki/project-structure.md) — структура репозиториев
- [MCP Servers](wiki/mcp-servers.md) — документация MCP

## Установка

Скопируйте папку `skills/` в `.opencode/` вашего проекта, либо настройте `skills.import` в `opencode.json`:

```
your-project/
  .opencode/
    skills/
      revit-api/SKILL.md
      revit-testing/SKILL.md
      revit-test-fixtures/SKILL.md
      revit-test-runner/SKILL.md
```

## Требования

- Autodesk Revit 2025+
- .NET SDK 8.0+
- [Nice3point.TUnit.Revit](https://www.nuget.org/packages/Nice3point.TUnit.Revit)
- [Nice3point.Revit.Sdk](https://www.nuget.org/packages/Nice3point.Revit.Sdk)

## Лицензия

MIT