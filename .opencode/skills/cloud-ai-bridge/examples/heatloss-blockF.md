# Пример ТЗ: перенос ProjectSettings из MainAppHeatLoss в RevitServices (HeatLossRevit2, Блок F)

> Это РЕАЛЬНОЕ ТЗ из практики (блок F реструктуризации HeatLossRevit2).
> Итог: ответ облачного ИИ оказался обрезанным на ~78% — перенос сделан
> напрямую с диска. ТЗ приложено как эталон структуры + уроки.

---

## 1. Контекст

- **Проект:** HeatLossRevit2 (C# net48, Revit-плагин)
- **Ветка:** V10CleanArchitecture, последний коммит bd1934a8
- **Цель:** вынос Revit-сервисов из MainAppHeatLoss в RevitServices (чистая архитектура)
- **Сборка:** `MSBuild.exe HeatLossRevit.sln -p:Configuration=Debug -p:DeployAddin=false`
- **Тесты:** vstest.console.exe Test\bin\Debug\Tests.dll — 109 тестов, ожидание 106/109
  (3 предсуществующих падения в Core)

## 2. Цель

Перенести 60 файлов из `MainAppHeatLoss\ProjectSettings\` в
`RevitServices\ProjectSettings\` с переименованием namespace
`MainAppHeatLoss.ProjectSettings` → `RevitServices.ProjectSettings`,
обновить 43 файла-потребителя и 3 XAML-файла, добиться сборки EXIT 0 и тестов 106/109.

## 3. Инвентарь (фрагмент — всего 60 файлов)

### 3.1 Файлы на перенос

| Путь | Строк | Namespace | Зависимости |
|------|------:|-----------|-------------|
| MainAppHeatLoss\ProjectSettings\ClimateData\ClimateDataRepository.cs | 8348 | MainAppHeatLoss.ProjectSettings.ClimateData | Base, Core |
| MainAppHeatLoss\ProjectSettings\CornerRoom\CornerRoomSettingsService.cs | 412 | MainAppHeatLoss.ProjectSettings.CornerRoom | Base, RevitServices.ParameterHandlerService |
| ... (ещё 58) | | | |

### 3.2 Файлы, ОСТАЮЩИЕСЯ в MainApp (7 шт.)

| Файл | Причина |
|------|---------|
| ParametersSettings\Core\BaseParameterCreator.cs | тянут MainApp-зависимости |
| Services\UserInteractionService.cs | реализация (интерфейс выносим) |

### 3.3 Потребители (43 файла)

| Файл | Что меняется |
|------|--------------|
| MainAppHeatLoss\Services\HeatLossCalculationService.cs | using ProjectSettings... → RevitServices.ProjectSettings... |
| ... | |

### 3.4 XAML (3 файла)

| Файл | Что меняется |
|------|--------------|
| ExclusionsManagementDialog.xaml | xmlns:models → +assembly=RevitServices |

## 4. Формат ответа

Только секции: 4.1 Решения (MOVE/KEEP+причина), 4.2 Маппинг namespace,
4.3 Скрипт переноса PowerShell, 4.4 Список потребителей, 4.5 Риски.

## 5. Контракт полноты

- Каждый файл в скриптах — маркер `// END OF FILE`
- В конце: `### SUMMARY` с total_files и строками каждого файла

## 6. Ограничения

- НЕ переписывать файлы целиком — только скрипты и таблицы
- НЕ менять namespace вне п.4.2
- Кодировка скриптов ASCII (PS 5.1)

---

## 📌 УРОКИ ИЗ ЭТОГО ОПЫТА (важно!)

1. **Ответ ИИ пришёл обрезанным:** ClimateDataRepository — 1844 из 8348 строк
   (~78% потеряно). Причина: 118 встроенных файлов (~800 КБ) → лимит вывода.
2. **Вывод:** НЕ встраивать полный код в ТЗ! Подавать инвентарь (таблица из п.3).
3. **Вывод:** требовать SUMMARY + END OF FILE — без этого обрезка невидима.
4. **Что сработало:** прямое копирование с диска скриптами (move/delete/update)
   + сборка как источник истины. Перенос занял ~1 час вместо ожидания ИИ.
5. **Рекомендация:** для переноса большого объёма (50+ файлов) используй
   LocalAssitent для генерации ПЛАНА (MOVE/KEEP, маппинг, риски), а сам перенос
   делай детерминированными скриптами локально.
