# Создание стен: исправление багов (HeatLossRevit2, 2026-08-11)

Замечание пользователя (Docs/Замечания 2026_08_11.md, п.3):
1. «Создание всех стен пространства» — радио «Пользовательская» не активируется,
   предыдущий радиобокс остаётся выбранным, параметр высоты не меняется.
2. «Создание наружных стен из граней помещения» — при создании по функции
   («Наружная стена») и по типам стен выходит ошибка «Ошибка создания стен по функции».

## Диагноз и фиксы

### 1. Радио «Пользовательская» не переключается (WallsAllSpacesCreatorDS)

Файлы: `WallsAllSpacesCreatorDSUserControl.xaml` → `WallsAllSpacesCreatorDsViewModel`.

**Причина.** XAML биндит `IsChecked="{Binding IsByUserMethod}"`, но у
`WallsAllSpacesCreatorDsViewModel` (и его баз) **нет свойства `IsByUserMethod`**
(оно было только у `BaseWallsCreationViewModel`/`FacesDirectShapesSettingsViewModel`).
Биндинг молча не резолвился → нажатие не меняло `SelectedHeightMethod` (оставался `ByLevels`),
а «предыдущий радиобокс» (По уровням) оставался активным. Текстбокс мм был
задизейблен (`IsEnabled="{Binding IsByUserMethod}"`).

**Фикс** (`WallsAllSpacesCreatorDSViewModel.cs`): добавлено свойство
`IsByUserMethod`; все три сеттера (`IsByLevelsMethod`/`IsByParameterMethod`/`IsByUserMethod`)
теперь нотифицируют друг друга (`OnPropertyChanged` по всем трём) и обновляют
`SelectedHeightMethodDisplay`.

### 2. «Ошибка создания стен по функции» / по типам (WallsFromFacesCreatorDS)

Файлы: `DrawDirectShapesFromFaces.cs`, `WallHeightCalculate.cs`,
`RoomSpaceLinker.cs`, `WallCreationService.cs`.

**Причины (цепочка необработанных исключений):**

- `WallHeightCalculate.GetWallHeight()` вызывал
  `space.get_Parameter(BuiltInParameter.ROOM_HEIGHT).AsDouble()` **без проверки null**
  → если параметр недоступен у Space — `NullReferenceException`.
- В пути «из граней» `LevelHash` создавался **без списка пространств**
  (`new LevelHash(validLevels, _selectedGroundLevel)`), поэтому
  `GetNextLevelForSpace` всегда возвращал null (`HasSpacesOnLevel` требовал non-empty `allSpaces`)
  и `GetLevelHeight()` всегда падал в `GetWallHeight()` → высота по уровням не работала,
  а для верхних/всех пространств высота бралась из параметра (или NRE).
- `RoomSpaceLinker.FindLinkedRoom` — `r.IsPointInRoom(...)` мог бросить исключение
  на комнате без вычисленной геометрии, роняя конструктор Drawer.
- `CreateDirectShapesForSpaces` — при исключении внутри транзакции `transactionGroup.Assimilate()`
  вызывался вслепую; `ExecuteCreation` проглатывал исключение и возвращал false
  с общим сообщением без деталей.

**Фиксы:**
- `WallHeightCalculate.GetWallHeight()` — null-безопасно: параметр ROOM_HEIGHT с проверкой
  `HasValue`/`StorageType.Double`; фолбэк — разница до следующего уровня; иначе 0.
- `DrawDirectShapesFromFaces` — `new LevelHash(validLevels, _selectedGroundLevel, CachedSpaces)`
  (высота по уровням теперь реально считается).
- `ProcessSpace` — guard `wallHeight <= 0.01` → пропуск + регистрация в FailedSpaces.
- `RoomSpaceLinker.FindLinkedRoom` — `IsPointInRoom` обёрнут в try/catch (фолбэк по номеру).
- `DrawDirectShapesFromFaces` — транзакция: RollBack в try/catch; `Assimilate()` только после
  коммита, при сбое не роняет весь процесс; реальное исключение пробрасывается вверх.
- `WallCreationService` — сохранение текста исключения в `_lastError` + `GetLastError()`;
  лог с полным стеком. В UI (`CreateByFunctionViewModel`/`CreateBySelectionViewModel`)
  в сообщении ошибки теперь выводится реальный текст исключения.

## Проверка

- Сборка MSBuild `HeatLossRevit.sln` /p:Configuration=Debug: **0 ошибок компиляции (CS)**.
  (Публикация в Addins падает MSB3027, пока открыт Revit — это только копирование .dll.)
- Ручной прогон в Revit не выполнялся (Revit занят); надо перезагрузить плагин
  (закрыть/открыть окно) и проверить:
  1. «Создание всех стен пространства» → переключение По уровням/По параметрам/Пользовательская.
  2. «Создание наружных стен из граней помещения» → Создать по функции / по типам.

## Связанные файлы

- `MainAppHeatLoss/DirectShapeStructureDraw/WallsAllSpacesCreatorDS/ViewModels/WallsAllSpacesCreatorDSViewModel.cs`
- `RevitServices/DirectShapeStructureDraw/WallsFromFacesCreatorDS/Services/DrawDirectShapesFromFaces.cs`
- `RevitServices/DirectShapeStructureDraw/Common/WallHeightCalculate.cs`
- `RevitServices/DirectShapeStructureDraw/BaseConstructions/WallsFromFacesCreator/Services/RoomSpaceLinker.cs`
- `MainAppHeatLoss/DirectShapeStructureDraw/WallsFromFacesCreatorDS/Services/WallCreationService.cs` (+ интерфейс)
- `MainAppHeatLoss/DirectShapeStructureDraw/WallsFromFacesCreatorDS/Features/CreateByFunction/CreateByFunctionViewModel.cs`
- `MainAppHeatLoss/DirectShapeStructureDraw/WallsFromFacesCreatorDS/Features/CreateBySelection/CreateBySelectionViewModel.cs`
