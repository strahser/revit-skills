# Revit API: потоки, ExternalEvent и зависание modeless-окон (HeatLossRevit2)

Дата: 2026-08-10. Ветка: `feature/standalone-ui-webview2`. Диагноз, аудит и **рефакторинг**
после изучения [Revit.Async](https://github.com/KennanChan/Revit.Async/blob/master/README.md)
(пакет [NuGet 2.1.1](https://www.nuget.org/packages/Revit.Async)) и статьи про
async-паттерны в Revit (Dzen).

## Правило: Revit API — только в Revit-потоке, из modeless-окна — только через ExternalEvent

Revit API однопоточный. Внешние события (`IExternalEventHandler` + `ExternalEvent.Raise()`)
— единственный легальный способ выполнить код Revit из modeless-окна/фонового потока.
Revit.Async — просто обёртка над этим механизмом (TAP: `Task<T>` + `ExternalEvent`),
она **не создаёт второй поток** для Revit API.

- README: https://github.com/KennanChan/Revit.Async/blob/master/README.md
- NuGet: https://www.nuget.org/packages/Revit.Async
- Цитата: «Revit.Async is simply a wrapper around this built-in pattern. There
  is **no** multithreading involved in Revit.Async.»

## Суть проблемы (зависание «Связать пространства»)

Команда «Связывание пространств с АР» → `SpaceLinkingViewModel.ExecuteLink` → зависание Revit.

Корень: **deadlock на Revit-потоке** из-за синхронного ожидания ExternalEvent:

```
RelayCommand.Execute (UI-поток = Revit main thread, modeless окно)
  → ExecuteLink
    → SnapshotBuildService.BuildSnapshotAsync(...).GetAwaiter().GetResult()   // БЛОК
      → ExternalEventService.RunAsync(action)
        → _runAsyncEvent.Raise()          // запрос в очередь Revit
        → await completionTask            // ждём, пока выполнится обработчик
```

Внешнее событие Revit может быть обработано только когда Revit **простаивает** (idle).
`.GetAwaiter().GetResult()` блокирует главный поток → Revit не получает idle →
`completionTask` никогда не завершится → deadlock.

## Выполненный рефакторинг (2026-08-10)

### Инфраструктура (финальная версия)
- `Base\MVMV_Base\AsyncRelayCommand.cs` — **новый**: async-команда WPF
  (`Func<object, Task>` / `Func<Task>`), блокирует повторное выполнение.
- `RevitServices\ExternalEvents\ReusableActionExternalEvent.cs` /
  `ReusableFunctionExternalEvent<T>.cs` — **переиспользуемые** обработчики
  (перезаписываемый action/function + TCS на каждый вызов).
- `RevitServices\ExternalEvents\ExternalEventService.cs` — `RunAsync(Action<UIApplication>)`
  и `RunAsync<T>(Func<UIApplication, T>)`. **`ExternalEvent.Create` — ТОЛЬКО один раз
  в `Initialize()`** (из `IExternalCommand.Execute`, это API-контекст; создание вне
  стандартного API-контекста запрещено: «Attempting to create an ExternalEvent outside
  of a standard API execution context»). Перекрывающиеся вызовы сериализуются через
  `SemaphoreSlim(1,1)` — исключает `Pending` и конфликт перезаписи в переиспользуемом
  обработчике.
- `RevitServices\ExternalEvents\ExternalEventRunner.cs` — **новый**: перегрузки
  `RunAsync(Action)` / `RunAsync<T>(Func<T>)` **без UIApplication** для случаев,
  когда UI-контекст не нужен (коллекторы, транзакции по Document). Полезно и для
  тестов: TUnit-раннер Nice3point НЕ предоставляет RevitAPIUI (см. revit-tunit-tests.md).

> **Критично:** НЕ создавать `ExternalEvent.Create` на каждый вызов — это бросает
> «Attempting to create an ExternalEvent outside of a standard API execution context»,
> т.к. `RunAsync` вызывается из modeless-окна (вне стандартного API-контекста).
> События создаются один раз в `Initialize()`.

## Реестр обобщённых моделей (DirectShapeRegistry) — идентификация поверхностей

При создании DirectShape (обобщённой модели) и установке параметров элемент
**регистрируется в реестре** (`JsonDirectShapeRegistry`), чтобы:
- валидация удалённых элементов (`PreCalculationValidator.SyncRegistryWithModel`) работала
  для ВСЕХ типов конструкций, а не только стен;
- в базе был id поверхности (`ElementId` DirectShape + SpaceId/EnclosureType/ConstructionName)
  для идентификации при сверке.

**Механизм:** `RevitServices\DirectShapeStructureDraw\Common\DirectShapeRegistryService.cs` —
единая обёртка: `Register(ds, doc)` строит `DirectShapeRegistryEntry` из параметров DirectShape
и сохраняет в JSON-базу (`directShapeRegistry/{projectKey}`). Регистрируется в DI
(`AddRevitServices`) и прокидывается в конвертеры создания.

**Точки регистрации при создании DirectShape:**

| Конструкция | Где регистрируется |
|---|---|
| Стены (всех пространств) | `WallProcessingService.RegisterManyWithProjectKey` (было) + `WallsAllSpacesCreatorDSViewModel` |
| Стены из граней (CreateByFunction/BySelection/Retry) | `WallCreationService.ExecuteCreation`/`RetryFailed` |
| Окна и двери | `DirectShapeOpensBuilder.BuildDirectShape` (через `OpeningToDirectShapeConverter`) |
| Витраж | `DirectShapeHelper.CreateFromWall` (через `CurtainWallToDirectShapeConverter`) |
| Перекрытия (простые) | `FloorToDirectShapeConverter.ConvertFloorsToDirectShapes` (через `DrawFloors`/`FloorCreationService`) |

**Запись реестра (`DirectShapeRegistryEntry`):**
- `ElementId` — id DirectShape в Revit (поверхность);
- `SpaceId`, `SpaceNumber`, `EnclosureType`, `ConstructionName` — из параметров DirectShape;
- `Status` — Active/DeletedManually/DeletedProgrammatically.

**Интерфейс** пополнен методом `RegisterWithProjectKey(string projectKey, DirectShapeRegistryEntry)`.

> Ограничение: зонирование перекрытий (`BuildingZoneCreator`) и рендеринг результатов
> (`DirectShapeBuilder`) пока не регистрируются — вне основного сценария конструкций.

### Исправления по итогам ручного теста (2026-08-10)
| Проблема в тесте | Причина | Исправление |
|---|---|---|
| «Связать пространства» зависание | deadlock `.GetAwaiter().GetResult()` на Revit-потоке | `await` + RunAsync (см. выше) |
| `Attempting to create an ExternalEvent outside of a standard API execution context` | `ExternalEvent.Create` на каждый вызов из modeless-окна (вне API-контекста) | события создаются один раз в `Initialize()`; вызовы сериализуются `SemaphoreSlim` |
| «Настройки пространств»: `ExternalEvent.Raise() returned Pending` | повторный Raise на ещё не обработанном событии при параллельных вызовах | сериализация `SemaphoreSlim(1,1)` |
| «Создание Параметров»: `Pending` при загрузке ожидаемых параметров | то же (fire-and-forget в конструкторе) | сериализация + `_ = ...Async()` |
| «Сбросить наружные стены»: `outside of API context` | `ApplyWallColors()` вызывалась ПОСЛЕ `await RunAsync` | обёрнута в `RunAsync` (DistanceMarker, AnaliticalExteriorWalls) |
| «Создание Перекрытий»: `Имя параметра: source` | fire-and-forget `LoadLevels()` → `Levels` ещё null | синхронная загрузка в конструкторе (конструктор на Revit-потоке) |
| «Наружные стены из граней»: настройки не подтягиваются | fire-and-forget `LoadLevels/LoadLinkedDocuments/UpdateTotalSpaces` + гонка | синхронная инициализация конструктора |
| **Теплотехнический расчёт: инфильтрация через окна = 0** | `InfiltrationEngine` записывал `InfiltrationLoad` только в глобальный `result.OpeningResults`, а маппер читает из `space.OpeningResults` (разные объекты) | обновлять `InfiltrationLoad` и в `spaceResult.OpeningResults` |
| **Инфильтрация: комбобокс уровней не заполняется при перерасчёте** | `UpdateCollections`/`UpdateSpaceSummaries` вызывались после `await RunAsync` на фоновом потоке (WPF не обновляет UI) | весь UI-блок обёрнут в `_dispatcher.InvokeAsync` |
| **Проверить данные снимка** | снимок полный (spaces/rooms/walls/openings/floors/valves) — данные переданы; добавлено логирование | `LogSnapshotHash` в `HeatLossTableViewModel` (хэш-сверка снимка и переданных в расчёт данных) |
| **Объём пространства считался неверно** | `Volume = FeetToMeters(space.Volume)` — линейная конвертация для кубических футов | добавлен `UnitConverter.CubicFeetToCubicMeters` (`*0.3048³`) |

## Снимок модели: что снимается (для проверки хэша)

Хэш-сверка в `HeatLossTableViewModel.LogSnapshotHash` логирует при каждом расчёте:

```
Хэш снимка: spaces=N, rooms=N, walls=N, openings=N, floors=N, valves=N |
наружные стены: X (из них из связанного АР: Y/Z), внутр. температура: K/N пространств, средняя T °C |
в расчёт передано: walls=..., openings=..., floors=..., valves=...
```

- **Наружные стены (`WallSnapshot.IsExternal`)** — снимаются для нативных и **связанных** стен
  (`WallSnapshotExtractor.DetermineIsExternal`): приоритет — параметр `IsExternalWall` из файла
  (в т.ч. из связанного АР, читается `LookupParameter` на объекте linkDoc), затем тип стены из
  списка наружных типов, затем геометрический анализ (соседние помещения по нормали).
- **Внутренняя температура (`SpaceSnapshot.Temperature`)** — снимается из параметра
  «Температура» (по имени) или `SPACE_HEATING_SET_POINT` (`SpaceSnapshotExtractor.GetTemperature`).
  У `RoomSnapshot` (связанный АР) температуры нет — она берётся из аналитических Space HVAC.
- **Объём** — исправлена конвертация куб. футы → куб. метры (`CubicFeetToCubicMeters`).

### Исправлено (все — только через ExternalEvent, только await, без .GetResult())
| Модуль | Что исправлено |
|---|---|
| `SpaceLinkingSettings\SpaceLinkingViewModel` | **deadlock**: `GetAwaiter().GetResult()` → `await`; executor/zoom/baseline/links → `ExternalEventService.RunAsync`; Core-связывание → `Task.Run` |
| `SpaceReassign\SpaceReassignViewModel` | LoadSpaceTypes/RefreshData/ApplyChanges/UpdateSurfaces/OpenTypeEditor → async + RunAsync |
| `SpaceReassignTypeEditor\SpaceTypeEditorViewModel` | Load/Delete/Save/SaveParameter/Reload → async + RunAsync (транзакции в Revit-контексте) |
| `ClimateSettings\ClimateDataViewModel` | OnConfirm → async + RunAsync (запись параметров проекта) |
| `InfiltrationSettings\InfiltrationMainViewModel` | LoadWinterWindSpeed / CalculateBuildingHeight / Reset → async + RunAsync |
| `InfiltrationValveSettings\ValveMappingViewModel` | LoadValveMappings (коллектор) → async + RunAsync |
| `SchedulesCreation\MaterialsReportViewModel` | CreateSchedules (спецификации) → async + RunAsync |
| `ParametersSettings\ReportViewModel` | CreateParameters (общие параметры) + LoadExpected → async + RunAsync |
| `NormativeHeatResistance\NormativeHeatViewModel` | ApplyNormativeValues / DeleteSelectedSurfaces / ExportReport → async + RunAsync (транзакции) |
| `DistanceMarker\DistanceMarkerViewModel` | RunAnalysis / ResetExteriorMarks → async + RunAsync; `ApplyWallColors` внутри RunAsync |
| `EnergyModelMarker\AnaliticalExteriorWallsViewModel` | RunEnergyModel / ResetExteriorMarks → async + RunAsync; `ApplyWallColors` внутри RunAsync |
| `InfiltrationValves\ValveSpaceMappingViewModel` | Mapping / RefreshDocs / ZoomToSpace / ZoomToValve → async + RunAsync |
| `InfiltrationWindows\InfiltrationReportViewModel` | LoadData (коллекторы) → async + RunAsync |
| `DirectShapeStructureDraw\DrawFloorsViewModel` | CreateExecute → async + RunAsync; LoadLevels/LoadTotalSpaces — синхронно в конструкторе (на Revit-потоке) |
| `WallsFromFacesCreatorDS\FacesDirectShapesViewModel` | UpdateTotalSpaces / LoadLevels / LoadLinkedDocuments — синхронно в конструкторе; Refresh → RunAsync |
| `WallsFromFacesCreatorDS\CreateBySelectionViewModel` | CreateBySelection / LoadWallTypes / ViewDirectShape → async + RunAsync (транзакции WallCreationService) |
| `WallsFromFacesCreatorDS\CreateByFunctionViewModel` | CreateByFunction → async + RunAsync |
| `WallsFromFacesCreatorDS\FailedSpacesViewModel` | RetryFailed / ZoomToSpace → async + RunAsync |
| `Common\CommonOpeningsViewModel` | LoadLinkedDocuments — синхронно в конструкторе (на Revit-потоке) |
| `WindowsDoorsCurtainWall\CurtainWallViewModel` | CreateCurtainWalls / CleanUp → async + RunAsync (починены несуществующие `...Async` ссылки) |
| `HeatLossRevit.UI\HeatLossTableViewModel` | Recalculate / SetRoomHeatLoads / SetSurfaceHeatLoads / SelectSpaces → async; снимок через RunAsync, Core-расчёт через `Task.Run`, запись через RunAsync |

> **Правило:** конструктор VM выполняется на Revit-потоке (при навигации) — тяжёлые
> коллекторы допустимы синхронно (они не блокируют Revit, т.к. окно modeless).
> Асинхронно через ExternalEvent — команды, которые дёргают Revit по клику.
> Критично асинхронно: снимок АР («Связать помещения») — параллельные запросы.

### Аудит: осталось вне ExternalEvent (приемлемо / не в меню)
- `ExternalWallsFinders\LinkedMarker\LinkedMarkerViewModel` и его вложенные
  (`LinkWallMatcherViewModel`) — НЕ входят в немодальное окно главного меню
  (отдельные ribbon-команды), оставлены как есть.
- `TemperatureParameters\TemperatureParametersViewModel` — вне меню, оставлено.
- Модальные диалоги (`SpaceSelectionRevitViewModel`, `DuplicateSpacesDialog`,
  `DeleteOrphanedSpacesDialog`) — открываются на Revit-потоке, приемлемо.
- Конструкторы VM захватывают `RevitConfig.Document`/`RevitConfig.UiDocument` в поля —
  допустимо, т.к. VM создаётся на Revit-потоке при навигации; тяжёлые загрузки,
  необязательные для конструктора, вынесены в `_ = LoadXAsync()`.

## Проверка

```bash
# блокирующие ожидания async-задач в UI-слое — должно быть 0:
rg "GetAwaiter\(\)\.GetResult\(\)|\.Wait\(\)" MainAppHeatLoss* HeatLossRevit.UI
# транзакции в VM — должны быть внутри ExternalEventService.RunAsync:
rg "new Transaction\(" MainAppHeatLoss* HeatLossRevit.UI
```
- Сборка: MSBuild `HeatLossRevit.sln /p:Configuration=Debug /p:Platform="Any CPU"` — EXIT 0.
- Тесты: `vstest Test\bin\Debug\Tests.dll` — 104/104 (0 падений; базовое 106/109 с 3 known-fail).

### Ограничение TUnit-тестирования ExternalEvent
TUnit-раннер `Nice3point.TUnit.Revit` (SnapshotTool) НЕ предоставляет `RevitAPIUI.dll`,
поэтому тест, вызывающий метод с сигнатурой `Action<UIApplication>` (например
`ExternalEventService.RunAsync(Action<UIApplication>)`), падает при JIT с
`FileLoadException: Could not load RevitAPIUI.dll` (0x8007045A). Binding redirect
и AssemblyResolve не помогают (раннер перехватывает загрузку Revit API).
Для таких проверок используй перегрузки **без UIApplication**
(`ExternalEventRunner.RunAsync(Action)` / `RunAsync<T>(Func<T>)`) — тогда тест
выполняется на Revit-потоке в API-контексте без RevitAPIUI. Команды, которым нужен
UI (зум, UIDocument), в TUnit-раннере проверить нельзя — только ручной прогон в Revit.

## Ключевой паттерн (копия для новых VM)

```csharp
private async Task RunAsyncCommand(object parameter)
{
    IsBusy = true;
    try
    {
        var result = await ExternalEventService.RunAsync(app =>
        {
            using var tx = new Transaction(_doc, "Имя");
            tx.Start();
            // ... Revit API ...
            tx.Commit();
            return value;
        });
        StatusMessage = result;
    }
    catch (Exception ex) { /* лог */ }
    finally { IsBusy = false; }
}
// команда: new AsyncRelayCommand(_ => RunAsyncCommand(null), canExecute);
```

Тяжёлые чистые вычисления Core (без Revit API) — `await Task.Run(...)`. Снимок АР —
только через `SnapshotBuildService.BuildSnapshotAsync` (await, не .GetResult()).

## ExternalEventRunner — когда UIApplication не нужен

`ExternalEventService.RunAsync` требует `Action<UIApplication>` в сигнатуре — это
тянет за собой RevitAPIUI.dll при JIT. Если действию не нужен UI (только коллекторы
и транзакции по `Document`), используй `ExternalEventRunner` — те же гарантии, но
без привязки к RevitAPIUI:

```csharp
// было (нужен UIApplication, лямбда его не использует):
await ExternalEventService.RunAsync(app => collector.Query());

// стало (без UIApplication):
await ExternalEventRunner.RunAsync(() => collector.Query());

// с возвратом значения:
var count = await ExternalEventRunner.RunAsync(() => new FilteredElementCollector(doc).OfClass(typeof(Wall)).GetElementCount());
```

`ExternalEventRunner.RunAsync(Action)` / `RunAsync<T>(Func<T>)` внутри просто
делегируют в `ExternalEventService.RunAsync(app => ...)`. Правила те же: только
`await`, не `.GetResult()`.

## Частые ошибки при переводе команд на AsyncRelayCommand

| Ошибка | Причина | Как правильно |
|---|---|---|
| `Cannot implicitly convert AsyncRelayCommand to RelayCommand` | поле/свойство команды объявлено `RelayCommand`, а присваивается `AsyncRelayCommand` | Тип поля → `ICommand` (или `AsyncRelayCommand`) |
| `((RelayCommand)SomeCommand).RaiseCanExecuteChanged()` бросает `InvalidCastException` | `SomeCommand` теперь `AsyncRelayCommand` | `(SomeCommand as AsyncRelayCommand)?.RaiseCanExecuteChanged()` |
| `LoadLevels()` в конструкторе → `Имя параметра: source` | async-метод стартовал fire-and-forget, а результат (`Levels`) нужен сразу | Конструктор на Revit-потоке — коллектор можно выполнить синхронно; async-вызов с `_ =` — только если зависимый код тоже async |
| `ExternalEvent.Raise() returned Pending` | общий `ExternalEvent` на все вызовы + быстрые повторные `RunAsync` | Использовать новую версию (своё событие на вызов) — уже исправлено в `ExternalEventService` |
| `outside of API context` | Revit API после `await RunAsync` (вне лямбды) | Весь Revit-код — внутри лямбды `RunAsync`; после `await` — только UI/чистые вычисления |
| async `Task` вызывается без `await`/`_ =` | невалидный вызов (CS4014) или молчаливый fire-and-forget | В конструкторе: `_ = SomeAsync()`; в async-методе: `await SomeAsync()` |

## Чек-лист: новая VM в немодальном окне

1. Команда дёргает Revit API (коллектор/транзакция/UIDocument) → `AsyncRelayCommand`
   + `await ExternalEventRunner.RunAsync(...)` (или `ExternalEventService.RunAsync` если нужен UI).
2. Revit-вызовы — ТОЛЬКО внутри лямбды `RunAsync`; после `await` — UI и чистый код.
3. Конструктор: синхронные коллекторы допустимы (Revit-поток), результат нужен сразу.
   Тяжёлая загрузка необязательная для конструктора — `_ = LoadXAsync()`.
4. `RaiseCanExecuteChanged` для async-команд — через `as AsyncRelayCommand` (не `(RelayCommand)`).
5. Нет `.GetAwaiter().GetResult()`, `.Result`, `.Wait()` в UI-слое.
