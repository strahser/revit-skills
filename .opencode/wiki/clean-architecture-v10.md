# Clean Architecture V10 (HeatLossRevit2)

Ветка `V10CleanArchitecture`. Цель — отделить бизнес-логику от Revit API:
**Revit = только presenter**, **Core = только бизнес-логика**, **Base = общие DTO (snapshot'ы)**.

## Слои

```
MainAppHeatLoss  — presenter: команды, UI, DI-обвязка, адаптеры Revit <-> DTO
     │
     ▼
Core             — бизнес-логика: расчёт, конвейер, репозитории (JSON), отчёты, экспорт
     │
     ▼
Base             — модели/DTO: Snapshot, Settings, Results (никакого Revit API)
```

### Base
- `Base\Models\Snapshot\` — `SnapshotModel`, `SpaceSnapshot`, `WallSnapshot`, `OpeningSnapshot`, `ProjectInfo`
- `Base\Models\Results\` — `HeatLossResult`, `SpaceResult`, `WallResult` и др.
- `Base\Models\Settings\` — настройки расчёта
- `Base\Models\ModelsStatic\` — справочники, `UnitConverter`, `AzimuthCalculation`
- Обязательное условие: **без ссылок на `Autodesk.Revit.*`** (проверяется grep'ом)

### Core
Чистый C# (net48), без Revit API:
- `Database\` — JSON-база: `IJsonDatabase`, `JsonDatabase`, `HeatLossDataPaths`, репозитории (`SnapshotRepository`, `ResultRepository`, `SettingsRepository`, `IRepository<T>`)
- `Snapshot\` — `ISnapshotValidator`, `SnapshotValidator`
- `Geometry\` — `WallGeometryBuilder`, `OpeningGeometryBuilder`, `SpaceWallLinker`, `ZoneEngine`
- `Calculation\` — `HeatLossEngine`, `InfiltrationEngine`, `NormativeCalculator`
- `Pipeline\` — `IHeatLossPipeline`, `HeatLossPipeline`
- `Report\` — `IReportEngine`, `ReportEngine`
- `Export\` — `IExportService`, `SnapshotExporter`, `ResultExporter` (JSON в `%AppData%\HeatLossRevit2\data\exports`)
- `Cache\`, `Settings\` — кэш и менеджер настроек

### MainAppHeatLoss (presenter)
- `Snapshot\` — `ISnapshotBuilder`, `RevitSnapshotBuilder`, экстракторы (`SpaceSnapshotExtractor`, `WallSnapshotExtractor`, `OpeningSnapshotExtractor`, `ProjectInfoExtractor`) — читают модель Revit и возвращают DTO
- `Adapters\` — `SnapshotToDirectShapeAdapter` (polygon m → feet → DirectShape), `ResultToParameterAdapter`
- `Rendering\` — `DirectShapeBuilder`, `ColorRenderer`, `IResultParameterWriter`/`ResultParameterWriter`, `IRevitPresenter`/`RevitPresenter`
- Команды — тонкие: построить snapshot → сохранить в репозиторий → сделать вывод

## Пути данных
`%AppData%\HeatLossRevit2\data` (`HeatLossDataPaths`):
- `snapshots\` — JSON-снимки моделей (ключ: `snapshots\<docTitle>\<yyyyMMdd_HHmmss>_<guid>`)
- `settings\`, `results\`, `cache\`, `exports\`

## Правила миграции команд
1. Тонкая команда получает из DI только интерфейсы Core/presenter.
2. Логика внутри команды: snapshot → расчёт → отчёт/экспорт, без прямых обращений к Revit API для расчёта.
3. Весь доступ к модели Revit — через `ISnapshotBuilder`.

## Пример: ExportSharedModelsCommand
`MainAppHeatLoss\Projects\ExportSharedModels\ExportSharedModelsCommand.cs` —
снимок модели (`ISnapshotBuilder.BuildSnapshot`) → сохранение (`ISnapshotRepository.Add`) → диалог → сериализация в файл. Не использует старые `ProjectExportService`/`BimExportService`.
