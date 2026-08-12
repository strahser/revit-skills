# Настройки, валидация и хранение (HeatLossRevit2, 2026-08-11)

Продолжение фиксов окна теплопотерь. Покрывает: источник настроек инфильтрации,
удаление static-флага, самоизлечение реестра DirectShape, content-addressed хранение снимков.

## 1. Единый источник настроек (файлы configs/, а не JSON-БД)

**Проблема.** Пользователь правит `CalculationSettings.InfiltrationCalculationMethod` в
настройках инфильтрации → сохраняется в **JSON-файл рядом с RVT**:
`configs\AirFlowFamilyModel\AirFlowFamilyModel.json` (`"infiltrationCalculationMethod": 1` = Max).
А конвейер и окно читали `ISettingsManager` → JSON-БД `%AppData%\HeatLossRevit2\data\settings\{project}\calculation`
(файла нет → всегда `Sum`). Результат: «Максимум» не применялся.

**Решение.** Окно (`HeatLossTableViewModel`) и риббон (`CalculateHeatLossCommand`) теперь берут настройки
из `ICalculationSettingsProvider`/`ICornerRoomSettingsProvider` (читают файлы configs/) и передают в конвейер
через `PipelineContext.Settings`/`CornerSettings`. `HeatLossPipeline` использует их (`context.Settings ?? ...`).
JSON-БД осталась только фолбэком.

**Файлы:** `HeatLossTableViewModel.cs`, `CalculateHeatLossCommand.cs`, `HeatLossPipeline.cs`.

## 2. Static-флаг инфильтрации → явная передача

`ConstructionSurfaceModel.GlobalInfiltrationCalculationMethod` (mutable static) заменён на
экземплярное `InfiltrationMethod?` (JSON-ignored). Маппер проставляет его каждой модели из настроек;
сводки (`SummaryCalculationService`), детализация (`ConstructionSurfaceRow`, `DetailedViewModel`)
и `InfiltrationCalculationService` используют его (static — только legacy-фолбэк для `HeatLossCalculationService`).

**Файлы:** `ConstructionSurfaceModel.cs`, `HeatLossResultSurfaceMapper.cs`, `SummaryCalculationService.cs`,
`InfiltrationCalculationService.cs` (+ интерфейс), `ConstructionSurfaceRow.cs`, `DetailedViewModel.cs`,
`SummaryByTypeViewModel.cs`, `SummaryBySpacesViewModel.cs`.

## 3. Реестр DirectShape: самоизлечение и честные статусы

`PreCalculationValidator.SyncRegistryWithModel`:
- собирает DirectShape **только host-документа** (`ds.Document == _document`);
- **усыновляет** `UnregisteredInModel` (стены старых сборок/чужие) со `Status=Adopted` (тип из параметра EnclosureType);
- `DeletedFromModel` = Active/Adopted без пары в модели → удалены вручную.

Реестр: добавлен статус `Adopted`; `MarkAsDeletedProgrammatically`/`MarkManyDeletedProgrammatically`.
`WallCreationService` при пересоздании помечает старые id как `DeletedProgrammatically` (история сохраняется).

Ограничение (документировано): удаление, случившееся ДО первого усыновления, детектировать нельзя —
реестр не знает о никогда не регистрированных объектах.

**Файлы:** `PreCalculationValidator.cs`, `JsonDirectShapeRegistry.cs`, `IDirectShapeRegistry.cs`,
`DirectShapeRegistryService.cs`, `WallCreationService.cs`.

## 4. Хранение сырых данных: content-addressed снимки + хэш

- `HeatLossResult.Metadata` (`ResultMetadata`): `SchemaVersion`, `SnapshotHash`, `SnapshotRef`, счётчики.
- `SnapshotModel.Metadata.SchemaVersion = "1.1"` (ставится в `RevitSnapshotBuilder`).
- `SnapshotHashCalculator` (`Core/Snapshot`): детерминированный SHA256 по канонической строке
  (id + area/volume/temperature, isExternal/azimuth/constructionName; double→0.01 invariant;
  исключены documentPath/timestamp/guid).
- `SnapshotRepository.AddByHash(hash, snapshot)` → `snapshots/{project}/{hash}.json`
  (один файл на неизменную модель; результат ссылается на хэш, а не дублирует снимок).

**Вывод по вопросу «меняют ли обобщённые модели снимок»:** нет. Снимок строится только из нативной
модели (OST_Walls, окна/двери, пространства, клапаны). DirectShape — проекция результата, в снимок
не читаются; их правка не меняет хэш/расчёт (и не должна). Реестр отслеживает их отдельно для валидации удалений.

**Файлы:** `HeatLossResult.cs`, `SnapshotModel.cs`, `SnapshotHashCalculator.cs`, `SnapshotRepository.cs`,
`HeatLossTableViewModel.cs`, `RevitSnapshotBuilder.cs`, `RevitSnapshotSource.cs`, `ISnapshotSource.cs`.

## 5. Долгий расчёт

- `CalculateHeatLossCommand`: `CalculateZones = false`.
- Прогресс снимка: `ISnapshotSource.GetSnapshot(reporter)` + `SnapshotProgressReporter` → этапы
  логируются в журнал окна («Строим снимок модели…», «[снимок N/M] …»).

## 6. Фоновый мониторинг обобщённых моделей (DirectShapeChangeMonitor)

Проблема: удаление пользователем обобщённых моделей **вне инструмента** (чтобы визуально оценить
модель) не детектировалось надёжно — реестр рассинхронизировался, снимок «оставался старым»
(снимок строится из нативной геометрии, DirectShape в него не входят).

Решение — фоновый мониторинг через событие `Application.DocumentChanged`
(`RevitServices\Monitoring\DirectShapeChangeMonitor.cs`):
- **удалённые** DirectShape (Active/Adopted) сразу помечаются `DeletedManually`;
- **добавленные** DirectShape (в т.ч. созданные вне плагина) «усыновляются» (`Active`);
- **изменённые** — обновляют SpaceId/EnclosureType/ConstructionName в реестре;
- работает только с активным host-документом (`ReferenceEquals(doc, RevitConfig.Document)`),
  linked-документы пропускаются.

Жизненный цикл:
- стартует при открытии главного окна (`ShowMainWindowCommand`), по опции
  `FacesDirectShapesSettings.EnableDirectShapeMonitoring` (по умолчанию true);
- **НЕ останавливается при закрытии главного окна** — подписка на уровне `Application`,
  пользователь может закрыть окно и продолжать править модель;
- явное отключение: чекбокс «Мониторинг обобщённых моделей» в настройках Faces
  (при сохранении вызывает `SetEnabled`) или выгрузка плагина (`App.OnShutdown` → `Shutdown()`).

Опция добавлена: `FacesDirectShapesSettings.EnableDirectShapeMonitoring` (модель),
`FacesDirectShapesSettingsViewModel`, `FacesDirectShapesSettingsManager` (save/load + live-toggle),
чекбокс в `FacesGeneralSettingsUserControl.xaml`.

Валидация перед пересчётом стала **неблокирующей**: `ValidateDeletedGenericModelsAsync`
больше не показывает MessageBox — только логирует счётчики и авто-помечает удалённые вне
инструмента. Расчёт никогда не прерывается из-за «удалённых обобщённых моделей».

Окно теплопотерь получило статусную строку (`StatusMessage`/`IsProcessing`) и кэшированные
команды (повторный «Пересчитать» работает корректно, во время расчёта кнопка недоступна и
виден статус «Выполняется пересчёт…»).

## 7. Проверка свежести снимка + сброс при «Связать помещения»

**Архитектурное правило:** обобщённые модели (DirectShape) — **только отображение**. Снимок
(база данных) строится исключительно из нативной геометрии и не меняется от изменений DirectShape.
В реестре при изменениях обобщённых моделей меняются **только id** (добавление/удаление) — это
отслеживает фоновый мониторинг (см. раздел 6). Параметры DirectShape пишутся ИЗ снимка/расчёта
(выход), а не читаются в снимок (вход).

Поэтому:
- `RevitSnapshotBuilder` НЕ читает DirectShape в снимок — снимок = нативные стены (host+linked) +
  окна/двери + пространства + пол/кровля + клапаны.
- `SnapshotFreshnessChecker` (`RevitServices\Snapshot`) сверяет **только по ID** нативные стены
  (`OST_Walls`) и проёмы (окна/двери) host-документа со снимком. Параметры не сравниваются
  (ведутся панелью свойств). DirectShape в проверке не участвуют (это отображение).
- `HeatLossTableViewModel.RunPipelineAsync` — после построения снимка проверяет свежесть по ID;
  если в модели есть нативные конструкции, которых нет в снимке — пересобирает; логирует
  «Конструкции модели: нативных стен=…, проёмов=…; свежесть снимка: OK/обновлён».
- `SpaceLinkingViewModel` («Связать помещения») — если в построенном снимке нет конструкций
  (walls+openings+floors == 0), сбрасывает общий кэш снимка (`ISnapshotSource.Invalidate()`),
  чтобы теплопотери не взяли устаревший снимок от прошлой модели.

Следствие: «внутренние стены» как обобщённые модели в отчёт теплопотерь НЕ попадают — они
отображение. Для учёта в расчёте стена должна существовать в модели как нативная (или быть
производной от граней пространств).

## Проверка
- Сборка VS MSBuild: 0 CS-ошибок.
- Core.Tests vstest: 175/181 (6 предсуществующих падений SnapshotModel round-trip, не связаны).
- Ручной прогон в Revit: требуется перезапуск плагина.
