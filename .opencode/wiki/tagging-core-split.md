# Разделение ядра маркировки: Ядро 1 (отопление) vs Ядро 2 (воздуховоды/3D/кластеризация)

Ветка: `feature/tagging-core-split` (репозиторий `MepTaggingSolution`)

## Проблема

Ветка `feature/tagging-extension-tests` добавляла обработку воздуховодов, 3D-видов, планов и
DuctTerminals. Задача НЕ должна была затрагивать стратегии установки и разрешения коллизий для
трубопроводов отопления и отопительных приборов — эта часть долго настраивалась и проверена.

Однако feature-ветка изменила и общие файлы ядра, из-за чего маркировка труб и отопительных
приборов изменила поведение (обнаружено по результатам тестов).

## Карта вторжений feature → ядро 1 (v5CBR)

Сравнение `v5CBR..feature/tagging-extension-tests`:

| Файл | Что добавила feature | Влияние на ядро 1 |
|---|---|---|
| `Core/Placement/Pipes/PipePlacementService.cs` | `CalculateBasePoint` — лидер крепится на край трубы (центр + нормаль×Ø/2) | Сдвиг **всех** марок труб |
| `Core/Collisions/PipeCollisionResolver.cs` | Кластерный режим, RBush-индексы, Leader-Tag фаза, авто-GradientDescentOptimizer | Новая система расстановки труб |
| `Core/Rules/PipeRule.cs` | Сегментация через новый `ISegmentMerger`, инлайн-фильтры | Меняет фильтрацию труб |
| `Core/Collisions/Equipment/EquipmentCollisionResolver.cs` | `TryResolveByRoomTagShift` — при коллизии с маркой помещения сдвигается **марка помещения** | Прямое влияние на марки отопительных приборов |
| `Core/Collisions/Strategies/ShiftRoomTagAlongLeaderStrategy.cs` | `CascadeRoomTagShifter` (лимит 2, глубина 2, откат) | Меняет сдвиги марок помещений |
| `Core/Placement/CorePlacementProcessor.cs` | `IsDenseBasementView`, `ResolveCrossCategoryTagTag`, `tagReductionService` | Новая глобальная фаза сдвига марок всех категорий |
| `Models/TagRule.cs` | **`EnableCbr=true` по умолчанию**, `DirectionStrategy=Cluster`, `MaxRoomTagShifts` | CBR-кейсы вмешиваются в расстановку труб |
| `RevitExport/Collectors/ExistingTagCollector.cs` | Высоты марок 900/1800 мм вместо 500 мм | Изменяет препятствия для труб |
| `Core/Collisions/CollisionContext.cs`, `CollisionOrchestrator.cs`, `StrategySelector.cs`, `PositionValidator.cs` | RBush, `isDenseCluster`, смена приоритетов стратегий | Меняют общую логику коллизий |

## Решение: два независимых ядра

Создана ветка **`feature/tagging-core-split`** (от `v5CBR`):

- **Ядро 1 (проверенное, отопление)** — файлы труб/приборов и общих стратегий полностью как в v5CBR.
  Позиции марок труб и отопительных приборов идентичны v5CBR (подтверждено golden-тестом).
- **Ядро 2 (экспериментальное, непроверенное)** — воздуховоды, 3D-виды, DuctTerminals,
  кластеризация (ClusterPlacementService + FreeSpaceGridSearch), DenseTagPlacementService,
  TaggingOrchestrator, ThreeDViewTaggingService, AxonometricViewService, ViewNamingService,
  AirTerminalRule, DuctRule.

### Ядро 1 — список «священных» файлов (запрещено менять без отдельного решения)

```
Core/Placement/Pipes/PipePlacementService.cs      (лидер крепится к ЦЕНТРУ трубы — обосновано)
Core/Collisions/PipeCollisionResolver.cs
Core/Rules/PipeRule.cs
Core/Collisions/Equipment/EquipmentCollisionResolver.cs
Core/Rules/EquipmentFloorPlanRule.cs
Core/Collisions/Strategies/ShiftRoomTagAlongLeaderStrategy.cs
Core/Collisions/CollisionOrchestrator.cs
Core/Collisions/Analysis/StrategySelector.cs
Core/Collisions/Analysis/IStrategySelector.cs
Core/Collisions/CollisionContext.cs
Core/Collisions/PositionValidator.cs
Core/Placement/CorePlacementProcessor.cs
Models/TagRule.cs                                  (трубные поля: EnableCbr=false по умолчанию)
RevitExport/Collectors/ExistingTagCollector.cs     (высоты марок 500 мм)
```

### Ядро 2 — файлы (новые/аддитивные, можно развивать свободно)

```
Core/Rules/DuctRule.cs
Core/Rules/AirTerminalRule.cs
Core/Placement/Ducts/          (DuctCollisionResolver, DuctPlacementService, DuctDirectionCalculator)
Core/Placement/Clustering/     (ClusterFactory, ClusterPlacementService)
Core/Placement/Dense/          (DenseTagPlacementService, FreeSpaceGridSearch)
Core/Placement/ThreeD/         (ThreeDProjectionService)
Core/Collisions/BoundingBox2DEnvelope.cs
MepTagging/Placement/TaggingOrchestrator.cs
MepTagging/Placement/ThreeDViewTaggingService.cs
MepTagging/Placement/TaggingDiag.cs
MepTagging/Placement/TaggingFailuresPreprocessor.cs
MepTagging/Services/AxonometricViewService.cs
MepTagging/Services/ViewNamingService.cs
Models/AirTerminalElementData.cs
Models/Point3D.cs
Models/BuiltInCategoryHelper.cs  (русские ID категорий duct для русской Revit)
```

### Адаптации при переносе ядра 2 на v5CBR-контекст

- `DuctCollisionResolver` — убрана зависимость от RBush-полей `CollisionContext.ObstacleTree/OccupiedTree`
  (в v5CBR-контексте их нет; кластерный режим работает через `ClusterPlacementService`).
- `Models/TagRule.cs` — duct-поля (`DirectionStrategy`, `ClusterModeThreshold`, `ClusterRadiusFeet`,
  `FreeSpaceGridStepFeet`, `MaxRoomTagShifts`, `DuctLocalization`, `UseDoubleLeaderForDucts`,
  `AutoEnableGradientDescentOptimizer`) добавлены АДДИТИВНО, дефолты трубных полей не тронуты.
- `Models/ElementGeometryData.cs` — добавлено `Depth` (3D), `ConnectorCount` сохранён.
- `RevitExport/Factories/ElementDataFactory.cs` — добавлена ветка DuctTerminal → `AirTerminalElementData`.
- `Core/Core.csproj` — добавлен пакет RBush (нужен `BoundingBox2DEnvelope` ядра 2).
- `Core/DependencyInjection/CoreServiceCollection.cs` — добавлены регистрации ядра 2,
  существующие (трубные) не тронуты.
- `MepTagging/DependencyInjection/ServiceCollectionDI.cs` — добавлены регистрации ядра 2.

## Верификация

1. **Golden-тест идентичности** (`Core.Tests/GoldenIdentityTests.cs`):
   - на `v5CBR` сгенерирован эталон `golden_v5cbr.json` (позиции марок труб/оборудования на 5 ключевых
     фикстурах: `1 этаж_Р`, `3 этаж_П`, `8 этаж_П`, `Подвал_П`, `План Кровли_П`);
   - на `feature/tagging-core-split` позиции сравниваются — **совпадение 100%**.
   - Запуск: `dotnet test Core.Tests --filter FullyQualifiedName~GoldenIdentityTests`
     с переменной окружения `GOLDEN_PATH` (сравнение) или `GOLDEN_OUT` (генерация).
2. `DuctPlacementTests` — 8/8 (ядро 2).
3. `CategoryMappingTests` — 6/6 (русские ID категорий).
4. Тесты `No_TagTag_Overlaps` / `No_LeaderLeader_Intersections` / `No_LeaderTag_Intersections` /
   `Baseline_No_TagTag_OnKeyFixtures` помечены `[Ignore]`: они требуют фич ядра 2
   (`ResolveCrossCategoryTagTag`, Leader-Tag фаз), которых в ядре 1 нет по решению:
   «для маркировки труб допускаются смежные пересечения».

## Правила для агентов

- Трубы отопления всегда маркируются внутрь помещения; магистральные пучки вдоль коридоров —
  по свободному месту. Это поведение ядра 1, НЕ менять.
- Duct/3D-фичи добавлять только в файлы ядра 2, не трогая священные файлы ядра 1.
- Любое изменение священных файлов — только через отдельное согласование + golden-сравнение с v5CBR.

---

## Структура проектов (рефакторинг в фичи, чистая архитектура)

Коммит `5de7ca1`: специфические алгоритмы вынесены в отдельные проекты.
Core остаётся тонким базовым слоем. Фичи: отопление, вентиляция, кластеризация, 3D.

### Целевая структура

| Проект | Содержимое | Namespace | Зависит от |
|---|---|---|---|
| `Models` | DTO, геометрия, RoomHelper, IPlacementContext, **CorePlacementContext**, ISpaceValidator | Models | — |
| `CoreCBR` | CBR-кейсы, Hungarian | CoreCBR | Models |
| `Core` | CorePlacementProcessor, SuggestionCollector/PostProcessor, CollisionContext, PositionValidator, CollisionOrchestrator, CollisionAnalyzer, IStrategySelector, ICollisionStrategy, LeaderCollisionResolverBase, PipesLeaderCollisionResolver, Optimization, Exporters, Rules/Abstractions+Base, DI-каркас | Core | Models, CoreCBR, CoreClustering, Core3D |
| `CoreClustering` | ClusterFactory, ClusterPlacementService, DenseTagPlacementService, FreeSpaceGridSearch, BoundingBox2DEnvelope | Core.Clustering | Models, RBush |
| `CoreHeating` | Pipes/**, Equipment/**, PipeRule, EquipmentFloorPlanRule, фильтры, PipeCollisionResolver, EquipmentCollisionResolver, EquipmentLeaderCollisionResolver, **9 стратегий**, StrategySelector, Segmentation/**, Reduction/**, SegmentCsvExporter | Core.Heating | Models, Core |
| `CoreVentilation` | Ducts/**, DuctRule, AirTerminalRule, DuctCollisionResolver, **AirTerminalCollisionResolver** | Core.Ventilation | Models, Core, CoreClustering |
| `Core3D` | ThreeDProjectionService | Core.ThreeD | Models |
| `RevitExport` | сбор данных Revit + **массовый снимок видов** (ViewSelectionWindow, Helper, ExportDataCommand) | RevitExport | Models |
| `MepTagging` | UI, TaggingOrchestrator, ThreeDViewTaggingService, AxonometricViewService, ViewNamingService, CoreTagPlacementService, DI-композиция | MepTagging | Core, CoreHeating, CoreVentilation, CoreClustering, Core3D, RevitExport |

### Ключевые разрывы зависимостей

- `AirTerminalRule` использует **собственный** `AirTerminalCollisionResolver` (на базе общего
  CollisionOrchestrator) — вентиляция НЕ зависит от отопления.
- `LeaderCollisionResolverBase`/`PipesLeaderCollisionResolver` переведены на интерфейс
  `ISpaceValidator` (Models) — остаются в Core как общие механизмы лидеров.
- `CorePlacementContext` перенесён в `Models/Abstractions` — фичи не зависят от Core.
- `CoreServiceCollection` (Core) вызывает только AddClusteringServices/AddThreeDServices.
  AddHeatingServices/AddVentilationServices вызываются в MepTagging.ServiceCollectionDI
  (избегаем цикла CoreHeating/CoreVentilation → Core).

### DI-регистрация фич

| Расширение | Проект | Где вызывается |
|---|---|---|
| `AddCoreTaggingServices` | Core | MepTagging, Core.Tests Harness |
| `AddHeatingServices` | CoreHeating | MepTagging, Harness |
| `AddVentilationServices` | CoreVentilation | MepTagging, Harness |
| `AddClusteringServices` | CoreClustering | Core (AddCoreTaggingServices) |
| `AddThreeDServices` | Core3D | Core (AddCoreTaggingServices) |
| `AddCbrServices` | CoreCBR | MepTagging, Harness |

### Массовый снимок видовых экранов

Кнопка «Снимки видов» в Revit → ExportDataCommand:
- ViewSelectionWindow (WPF-диалог, латиница) — выбор видов (этажи/разрезы/3D);
- экспорт по каждому виду: `viewSnapshot.json`, `rooms.json`, `occupiedAreas.json`,
  `profile.json`, `existingAnnotations.json` → `TestRevitData\CoreFixtures\<ViewName>\`;
- пути: GetCoreFixturesRoot (E:\ПлагиныРевит\MepTaggingSolution\TestRevitData\CoreFixtures).

### Правила для агентов

- Священные файлы ядра 1 (см. список выше) — НЕ менять; любые изменения — через
  отдельное согласование + golden-сравнение с v5CBR.
- Новые специфические алгоритмы — в свой проект-фичу (CoreHeating/CoreVentilation/
  CoreClustering/Core3D), а не в Core.
- Общие механизмы (коллизии, оркестратор, оптимизация, контекст) — в Core/Models.

---

## Обновления (коммит 586517f)

### 1. TemplateManager — отдельная команда
- Кнопка «Шаблоны» на панели MepTagging → `OpenTemplateManagerCommand`.
- Модуль живёт в `MepTagging/UI/TemplateManagement/` (команда + ViewModel + окно + RoomSelector).
- Основной поток маркировки от него не зависит.

### 2. Удалена мёртвая 3D-цепочка
- Удалены: `TaggingOrchestrator`, `ThreeDViewTaggingService`, `AxonometricViewService`,
  `ViewNamingService`, `TaggingDiag`, `TaggingFailuresPreprocessor`, проект `Core3D`.
- Причина: 3D-виды строились для тестирования; из UI (TaggingViewModel) оркестратор
  не вызывался — плановый путь использует `CoreTagPlacementService` напрямую.
- Бизнес-логика не потеряна: реальная 3D-обработка (если понадобится) использует
  собственный `ViewBasis` внутри `ThreeDViewTaggingService`, а не `ThreeDProjectionService`.

### 3. Маркировка арматуры (кластеризация)
- `Core.Rules.AccessoryRule` — базовое правило: кластерное размещение
  (`ClusterPlacementService.PlaceClusteredElements`) + коллизии через `CollisionOrchestrator`.
- `PipeAccessoryRule` (OST_PipeAccessory = -2008055, CoreHeating) —
  арматура трубопроводов.
- `DuctAccessoryRule` (OST_DuctAccessory = -2008016, CoreVentilation) —
  арматура воздуховодов.
- `ClusterFactory.BuildClusters(ElementGeometryData)` + `ElementCluster` —
  обобщённая кластеризация точечных элементов.
- Включение: `DirectionStrategy = Cluster` в профиле (как у труб/воздуховодов).
