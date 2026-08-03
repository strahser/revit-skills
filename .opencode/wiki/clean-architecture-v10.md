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
- `Base\Models\ModelsStatic\` — справочники, `UnitConverter`, `OrientationNames`
- Обязательное условие: **без ссылок на `Autodesk.Revit.*`** (проверяется grep'ом и по ссылкам сборки: `Base.dll` ссылается только на mscorlib/System/System.Core/PresentationCore/Newtonsoft.Json)

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

## Статус тестирования Core (без Revit) — Core.Tests (xunit, net48)
84 теста, все зелёные. Запуск: `vstest.console.exe Core.Tests\bin\Debug\net48\Core.Tests.dll` (сборка только VS MSBuild, `dotnet build` не резолвит PackageReference для легаси-проектов).

- `SnapshotFixtureTests` — целостность реального снимка `SnapshotTool\TestData\Snapshot_TestBuildingHvac.json` (39 помещений, 80 стен и 212 проёмов из АР-связи, 9 уровней, hostWallId, координаты в метрах, DocumentTitle без расширения).
- `GoldenFormulaTests` — эталоны формул на синтетическом снимке: Q=k·A·Δt (302.4 Вт), вычитание окна (264.6+226.8), угловые корректировки (+2°C, ×1.05, +0.5 м), инфильтрация СП (150.595 Вт), высотная/турбулентная коррекции, округление, фолбэки температур.
- `PipelineCalculationTests` — полный прогон `HeatLossPipeline` на реальном снимке + настройках из export JSON (теплопотери, инфильтрация, зоны). Найден и исправлен баг `SpaceWallLinker` (перпендикулярный допуск 0.5 м вместо длины стены).
- `DatabaseRepositoryTests` — round-trip `JsonDatabase`/`SnapshotRepository`/`ResultRepository`/`SettingsRepository` (вложенные ключи, кэш, delete, разделение проектов, `SanitizeKey`).
- `SettingsFixtureTests` — десериализация настроек из `ProjectExport_*.json`.
- `CsvExportTests` — CSV-экспорт `HeatLossExport.Csv.CsvExportService`: заголовки по `[ColumnOrder]`/`[CustomDescription]`, вычисляемые теплопотери, экранирование `;`, запись файла UTF-8.

Фикстуры: `SnapshotTool\TestData\Snapshot_TestBuildingHvac.json` (генерируется TUnit-прогоном в Revit 2024), `Core.Tests\TestData\*.json`.

## Пример: CalculateHeatLossCommand (новый пайплайн в Revit)
`MainAppHeatLoss\Projects\CalculateHeatLoss\CalculateHeatLossCommand.cs` — кнопка "Расчёт теплопотерь (новый Core)" в ленте: снимок → `HeatLossPipeline` (настройки по ProjectKey из JSON-базы) → сохранение результата в `results\` → экспорт JSON + сводка по помещениям. Легаси-сервисы `HeatLossCalculationService` пока используются основным окном и не затрагиваются.

## HeatLossExport (новый слой)
`HeatLossExport\` — net48, без Revit API (проверено grep'ом по DLL: ссылки на RevitAPI отсутствуют), зависимости: Base + Core + EPPlus + DocX.

- `Src\ExcelReport\` — `ExcelExportService` (пути через `ExportPaths`, без `Document`/`IStoragePathService`)
- `Src\DocxReport\` — `DocxReportService(ILogger, templatePath = null)` (шаблон: `%AppData%\StructureDraw\templates\reports\ReportTemplate.docx`, при отсутствии — `DocX.Create`)
- `Src\CsvReport\` — `CsvExportService(ILogger)` (уже был чистым — перенесён как есть)
- `Src\ReportService\` — `ReportExportService`/`IReportExportService`
- `Src\UnifiedExportService.cs` — `IFileExportDialogService`/`FileExportDialogService` (WPF-диалог, default = `MyDocuments\HeatLossRevit`) + `UnifiedExportService`
- `ExportPaths.cs` — пути экспорта: `MyDocuments\HeatLossRevit\reports\HeatLoss\...`

Плагин: `MainAppHeatLoss.csproj` → ProjectReference на HeatLossExport; DI (`ServiceCollectionExtensions`) регистрирует `IExcelExportService`/`IDocxReportService`/`IReportExportService` из HeatLossExport. `EpplusLicenseHelper` переехал в `HeatLossExport.Excel` (используется и `InfiltrationExcelExportService`).

## Дедупликация моделей (V10)
- `CornerRoomSettings`: единственный источник — `Base\Models\Settings\CornerRoomSettings.cs`; дубль `Core\HeatLossResult\Models\CornerRoomSettings.cs` удалён. Осторожно: namespace `MainAppHeatLoss.ProjectSettings.CornerRoomSettings` перекрывает имя типа — в `CornerRoomSettingsService`/`CornerRoomSettingsViewModel` используется алиас `using CornerSettingsModel = Base.Models.Settings.CornerRoomSettings;` (using-alias с именем типа не работает — CS0118, полная квалификация тоже — CS0118 из-за вложенного namespace).
- `ValveMappingSettings`: единственный источник — `Base\Models\Settings\ValveMappingSettings.cs` (с `GetDefault()`); дубль `MainAppHeatLoss\ProjectSettings\InfiltrationValveSettings\Models\ValveMappingSettings.cs` удалён; в `AirFlowFamilyModel` алиас `using ValveMappingSettings = Base.Models.Settings.ValveMappingSettings;` (JSON-совместимо: те же `[JsonProperty]`-ключи).
- `CalculationSettings` — единственный источник — `Base\Models\Settings\CalculationSettings.cs` (union-класс: наследует `ViewModelBase` — UI нужен INPC; ключи `[JsonProperty]` обоих оригиналов сохранены). Дубль `Core\InfiltrationWindows\Settings\Models\CalculationSettings.cs` удалён; `InfiltrationConstants` перенесён в `Base\Models\Settings\` (namespace `Base.Models.Settings`, добавлен в `<Compile Include>` в `Base.csproj`). Во всех файлах `using Core.InfiltrationWindows.Settings.Models;` → `using Base.Models.Settings;` (34 файла). **Важно:** дефолты инфильтрации в union-классе обязаны быть старыми литералами (`InfiltrationCoefficient=0.5`, `DefaultWindSpeed=4.8`, динамические коэффициенты `1.1`, `AirFlowExponent=0.67` — НЕ `InfiltrationConstants.*`; константные значения 0.8/4.9/2/3 остались только в `GetDefaultSp2024Settings()`) — на них завязаны золотые тесты (150.595).

## RevitServices (новый слой, вынесен из MainAppHeatLoss)
`RevitServices\` — net48, SDK-стиль (Microsoft.NET.Sdk), namespace `RevitServices.*`, зависимости: Base + Core + RevitAPI/RevitAPIUI + Newtonsoft.Json. Слой **Revit-сервисов**, не зависящих от UI/DI-обвязки presenter'а.

- Перенесено из `MainAppHeatLoss\BaseServices` (83 файла, `git mv` + ренейм namespace `MainAppHeatLoss.BaseServices` → `RevitServices`): `AreaCalculation`, `ParameterHandlerService`, `Geometry`, `Validation`, `ZoomServices`, `Storage` (`AppDataStorage`, `ProjectStorage`, `StorageFactory`, `StoragePathService`), `BimExport` (`BimExportService`, `BimThreeJsSerializer`), `SpaceSelection`, `ExternalEvents`, `Caching`, `UndergroundZone`, `LevelHash`, `CustomResult`, `LinkedDocumentService`, `ToleranceSettings`, `WallAreaUpdater`, `ZoneColorService`.
- Из `Base` перенесены `CollectorQuery.cs` и `RevitConfig.cs` (namespace `Base` → `RevitServices`). Потребители в MainAppHeatLoss получили `using RevitServices;` (77 файлов).
- Глобальные using (ранее обеспечивались MainAppHeatLoss через Nice3point SDK): `RevitServices\GlobalUsings.cs` (Autodesk.Revit.DB, System, System.Collections.Generic, System.Linq, System.Threading, System.Threading.Tasks).
- **Разорван цикл MainAppHeatLoss ← RevitServices:**
  - `AppDataStorage.cs` — fallback-логгер заменён с `ServiceProviderHolder.Instance.GetRequiredService<ILogger>()` (DI-зависимость MainAppHeatLoss) на `new LoggingService("App.log")`; `using Microsoft.Extensions.DependencyInjection` убран.
  - `ZoneColorService.cs` — убран неиспользуемый `using MainAppHeatLoss.AppData;`.
- MainAppHeatLoss и Test получили ProjectReference на `RevitServices.csproj` (проект добавлен в sln, GUID `{35F49C29-571C-4348-B9C2-0F220E914E62}`).
- **Base полностью чистый (Фаза 1 завершена):** Revit-зависимости удалены. `Base.dll` не ссылается на RevitAPI/RevitAPIUI.
- Проверка: `grep -r "MainAppHeatLoss.BaseServices\|Base.CollectorQuery\|Base.RevitConfig"` — 0 совпадений. Сборка sln Debug|AnyCPU ✓, плагин Debug.R24 ✓ (DeployAddin=false, если запущен Revit), Core.Tests 84/84 ✓.

## Фаза 1: полная очистка Base от Revit API (выполнено)
Убраны все 5 Revit-файлов Base; `Base.csproj` больше не ссылается на RevitAPI/RevitAPIUI (ни `<Reference>`, ни `<PackageReference>`). `Base.dll` ссылается только на mscorlib/System/System.Core/PresentationCore/Newtonsoft.Json.

- **`Base\Models\CurveSerializer.cs` → `RevitServices\Geometry\CurveSerializer.cs`** (namespace `Base.Models` → `RevitServices.Geometry`). Все потребители переведены на `CurveSerializer.Deserialize/Serialize` (ранее `SpaceInfoBase.ParseLocationCurve/LocationCurveToString`).
- **`Base\Models\ModelsStatic\AzimuthCalculation.cs` → `RevitServices\Geometry\AzimuthCalculation.cs`** (namespace → `RevitServices.Geometry`; добавлен `using Base.Models` — используется `WallParameters`).
- **`Base\Attributes\RevitParameterAttribute.cs`** — оставлен в Base как чистый маркер (`public string ParameterTypeString { get; }`, только строковый параметр, без ForgeTypeId/SpecTypeId). Логика резолва типа перенесена в новый **`RevitServices\Attributes\RevitParameterTypeResolver.cs`** (`GetParameterType(attribute, propertyType)`); единственный вызов — `BaseParameterCreator.cs:108`.
- **`Base\Models\SharedMainModels\SpaceInfoBase.cs`** — удалены статические обёртки `ParseLocationCurve`/`LocationCurveToString` (внутри остался только чистый DTO c `[RevitParameter]`-маркерами).
- **`Base\Models\ModelsStatic\OrientationNames.cs`** — `GetSideFromOrientationAzimuth(XYZ)` → чистая `GetSideFromAzimuth(double azimuthDegrees)`; единственный потребитель `ConstructionSurfaceModelFactory.cs:22` вычисляет азимут через `Math.Atan2` на стороне presenter.
- Обновлены потребители (12 файлов: AzimuthService, WallDataProvider×2, LinkedWallMarker, CurveProcessor, WallGeometryEditorViewModel, DirectShapeCreator, DirectShapeParameterSetter, VerticalParameterSetter, WallSnapshotExtractor, ConstructionSurfaceModelFactory, BaseParameterCreator).
- Проверка: сборка sln Debug|AnyCPU ✓, плагин Debug.R24 ✓ (DeployAddin=false), Core.Tests 84/84 ✓.

## Фаза 2: разрыв транзитивной Revit-зависимости Core (выполнено)
Core.csproj никогда не содержал Revit-пакетов — транзитивная зависимость шла через легаси `Base.csproj` (PackageReference RevitAPI/RevitAPIUI, убраны в Фазе 1). После Фазы 1 в `Core\obj\project.assets.json` остались stale-транзитивные ссылки RevitAPIUI 2024.3.30 (дата restore старше правок Base.csproj), дававшие ложный MSB3270 для Core.csproj.

- Выполнен явный `MSBuild HeatLossRevit.sln -t:Restore` — `Core\obj\project.assets.json` обновлён, RevitAPI больше не содержится.
- `PrivateAssets="all"` не потребовался: Revit-пакеты удалены из Base полностью, в Core их нет.
- Проверка ссылок сборок: `Base`, `Core`, `HeatLossExport`, `Core.Tests`, `ZoneVisualizer` — **ни одна не ссылается на RevitAPI/RevitAPIUI**.
- MSB3270 для Core.csproj теперь только про архитектуру `Base.dll` (AMD64 vs MSIL), не про Revit.
- Проверка: сборка sln Debug|AnyCPU ✓, Core.Tests 84/84 ✓.

## Реструктуризация DirectShapeStructureDraw
Папка `MainAppHeatLoss\DirectShapeStructureDraw\` — создание DirectShapes (стены/полы/окна/витражи). Устранены дубли и dead code:

- **Дедуплицировано 6 пар сервисов** (побайтово идентичны, различие только в namespace): удалены копии в `WallsFromFacesCreatorDS\Services\` (`ConstructionSurfaceModelFactory`, `FaceCurveExtractor`, `RoomGeometryProvider`, `RoomSpaceLinker`, `WallFaceExtractor`, `WallTypeFilter`); канонические версии — `BaseConstructions\WallsFromFacesCreator\Services`. 4 из них были dead code в DS (не вызывались), 2 (`FaceCurveExtractor`, `RoomSpaceLinker`) переключены на канонические через уже существующий `using` в `DrawDirectShapesFromFaces.cs`.
- **Удалён dead code**: `WallMatcher.cs`+`IWallMatcher.cs` (не использовались; стратегии подключаются напрямую в `DirectShapeProcessor`), `WindowsDoorsCurtainWall\abstractions\ICurtainWallService.cs`, `WindowsDoorsDirectShape\abstraction\IOpeningCollector.cs`.
- **`ICleanupService` перенесён** из файла `WallMatcherService\abstraction\IStrategy.cs` (неправильное имя файла и папка) в `BaseConstructions\DirectShapeProcessor\abstraction\ICleanupService.cs`; обновлены using в `ServiceCollectionExtensions`, `CleanupService`, `CurtainWallViewModel`, `OpeningViewModel`.
- **`WindowsDoorsCurtainWall\Services\Validation.cs` → `DocumentValidator.cs`** (файл содержал класс `DocumentValidator`); поправлен комментарий в `CustomSpaceFilter.cs`.
- Проверка дублей по содержимому (без учёта namespace) внутри DS: 0 совпадений, 120 файлов уникальны.
- **Фикс `RevitServices.csproj` (CS0579)**: `Compile Include="**\*.cs"` без исключений включал сгенерированный `obj\...\AssemblyAttributes.cs` в компиляцию дважды → дублирующийся `TargetFrameworkAttribute`. Добавлено `Exclude="obj\**;bin\**"`.
- Проверка: сборка sln Debug|AnyCPU ✓ (DeployAddin=false), Core.Tests 84/84 ✓.
