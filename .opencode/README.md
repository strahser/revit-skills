# Revit Skills for OpenCode

Набор навыков (skills) для [OpenCode](https://opencode.ai), упрощающих разработку плагинов и тестов для Autodesk Revit.

## Skills

| Skill | Описание |
|-------|----------|
| [revit-api](skills/revit-api/SKILL.md) | Базовые паттерны Revit API: транзакции, сборщики, геометрия |
| [revit-testing](skills/revit-testing/SKILL.md) | Unit-тесты с Nice3point.TUnit.Revit |
| [revit-test-fixtures](skills/revit-test-fixtures/SKILL.md) | Фикстуры, хуки, параметризованные тесты |
| [revit-test-runner](skills/revit-test-runner/SKILL.md) | Автоматизация запуска тестов в Revit |

## Установка

Скопируйте папку `skills/` в `.opencode/` вашего проекта:

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