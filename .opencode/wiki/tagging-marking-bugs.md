# MepTagging: баги размещения марок приборов и труб

Найдено и исправлено (2026-08-12). Касается раздела ОВ, планы: марки отопительных приборов
и труб должны стоять ВНЕ помещений (внутри — только в исключительных случаях).

## Баг 1: марки приборов ставились ВНУТРИ помещения

Симптом: на планах отопления марки «Отопительный прибор» (категория Оборудование) размещались
внутри комнат, практически на элементе; пользователь вручную выносил их наружу.

### Причины (две, накладывались)

1. **Профиль без архитектурной ссылки → 0 комнат.**
   `RoomPolygonCollector` берёт комнаты из связанного файла архитектуры. Если в профиле
   `selectedArchitectureLinkName` пустой (или ссылка не найдена), комнаты пустые →
   `CoreSpaceValidator.ValidatePoint` возвращает `(true, true)` для любой точки →
   алгоритм размещает марки БЕЗ учёта границ помещений.
   Профиль «Отопление» не имел ссылки (в `rooms.json` снимка было **0 комнат**).
   Профиль «Default» ссылку имел — поэтому там комнаты были.

2. **`CoreDefaultDirectionProvider.FindFreePoint` возвращал ПЕРВУЮ валидную точку.**
   С `allowInsideRoomsIfNeeded=true` точка внутри комнаты валидна, поэтому `FindFreePoint`
   сразу возвращал точку у элемента (короткий лидер), не пытаясь выйти наружу.
   «Предпочтение наружу» в `TryGetBestDefaultCandidate` (`OrderBy(IsOutside).ThenBy(leader)`)
   не помогало — все направления давали внутренние точки.

### Исправления

- `CoreDefaultDirectionProvider.FindFreePoint`: теперь **шагает наружу** и предпочитает точку
  вне помещений (`validation.isOutside`); точка внутри принимается ТОЛЬКО как исключение,
  если наружу вынести нельзя (лидер пересекал бы несколько комнат).
- `ArchitectureLinkManager.SetActiveLinkFromProfile`: если ссылка в профиле не задана/не найдена —
  берётся **первая доступная** из модели (комнаты всегда загружаются) + предупреждение в лог.
- `TaggingViewModel.OnProfileChanged`: при загрузке профиля без ссылки **авто-выбирается первая**
  доступная и сохраняется в профиль.
- `RoomPolygonCollector`: **кэш полигонов комнат на сессию** (ключ «ссылка|уровень») — раньше
  каждый вид из 70+ перестраивал кэш из связанного файла заново (медленно); плюс явное
  предупреждение «ВНИМАНИЕ: не найдены комнаты» при пустых комнатах.
- `ProfileLastUsedStore` (`%AppData%\MepTagging\last_profile.json`): команды снимков/фикстур и
  окно маркировки используют **последний использованный профиль**, а не жёстко «Default» —
  чтобы снимок соответствовал профилю маркировки (и в `viewSnapshot` попадали элементы приборов).

Проверка после фикса: 23/23 марки приборов **вне комнат** (по point-in-polygon относительно rooms.json).

## Баг 2: трубы — не удалялись старые марки и строилась двойная выноска

Симптом: при тесте труб с включённым «Заменять существующие марки» старые марки не удалялись;
при «одинарной выноске» строилось с двумя.

### Причина

Профиль «Отопление» для категории Трубы (`-2008044`) имел:
- `replaceExistingTags = false` → удаление не выполнялось (`CoreTagPlacementService` удаляет только
  категории с `ReplaceExistingTags=true` и логирует пропущенные);
- `useDoubleLeaderForPipes = true` → `PipePlacementService` искал парную трубу и создавал марку
  с двумя references → `TagFactory` строил двойную выноску.

Настройки, выставленные пользователем в UI, не были применены к этому профилю.

### Исправления

- Профиль «Отопление»: Трубы → `replaceExistingTags=true`, `useDoubleLeaderForPipes=false`.
- `TagRule.UseDoubleLeaderForPipes` — дефолт изменён `true` → `false` (одинарная выноска по умолчанию).
- `CoreTagPlacementService`: логирование удаления — выводится список категорий `ReplaceExistingTags`,
  число удалённых марок и категории, пропущенные (не в списке удаления). Теперь видно, почему
  марки не удалены.

## Тип маркировки (MarkingType) и эргономичный UI

### MarkingType вместо MepSection

`MepSection` (ОВ/ВК) заменён на **`MarkingType`** (профиль `Models/MarkingType.cs`):

- `WaterSupply` — ВК (водоснабжение и канализация);
- `Heating` — ОВ: отопление (трубы отопления, отопительные приборы, арматура трубопроводов);
- `Ventilation` — ОВ: вентиляция (воздуховоды, воздухораспределители, арматура воздуховодов);
- `PipeBridges` — ОВ: трубопроводные мосты (пучки труб).

Поле профиля: `TaggingProfile.MarkingType` (по умолчанию `Heating`).
Профили переведены: `"markingType": "Heating"` (было `"section"`).

### Гейтинг стратегий по типу

`MarkingVariantResolver.IsVariantAllowed(MarkingType, ViewTypeCore, MarkingVariant)`:
- планы → разрешаются правила, соответствующие типу: `Heating` → только `MarkingVariant.Heating`
  (PipeRule, EquipmentFloorPlanRule, PipeAccessoryRule); `Ventilation` → только `Ventilation`
  (DuctRule, AirTerminalRule, DuctAccessoryRule); `PipeBridges` → `PipeBridges`;
- ВК — заглушка: разрешает `Heating`;
- 3D — только `ThreeD`.

Проверяется в `SuggestionCollector` / `SuggestionPostProcessor` (правило пропускается,
если его стратегия не разрешена для типа) и в CBR/кластеризации.

### Эргономичный UI с вертикальным меню

`TaggingWindow.xaml` переработан: слева **вертикальное меню** (радио-элементы) с разделами,
справа — контент одного раздела (меньше информации одновременно):

- **Профиль и раздел** — выбор профиля, **тип маркировки (радио-группа из 4)**, архитектурная ссылка;
- **Виды** — выбор видов для маркировки;
- **Правила категорий** — список категорий + вкладки «Основные»/«Детальные» + выбор марки;
- **Запуск** — кнопка запуска + результат.

Переключение панелей и обработка радио-типа — в `TaggingWindow.xaml.cs`
(`Menu_Checked`, `Type_Checked`, `SyncTypeRadioFromViewModel`).

## Связанные файлы

- `CoreHeating/Placement/Equipment/CoreDefaultDirectionProvider.cs`
- `CoreHeating/Placement/Equipment/CoreEquipmentPlacementResolver.cs`
- `RevitExport/Providers/ArchitectureLinkManager.cs`
- `RevitExport/Collectors/RoomPolygonCollector.cs`
- `MepTagging.UI/UI/ViewModels/TaggingViewModel.cs`
- `MepTagging.UI/UI/Views/TaggingWindow.xaml` (+ `.xaml.cs`)
- `MepTagging/Placement/CoreTagPlacementService.cs`
- `Models/TagRule.cs`
- `Models/MarkingType.cs`, `Models/MarkingVariant.cs`, `Models/MarkingVariantResolver.cs`
- `Models/TaggingProfile.cs`, `Models/Abstractions/CorePlacementContext.cs`
- `Models/ProfileLastUsedStore.cs`
- `RevitExport/Services/SnapshotProfile.cs`
