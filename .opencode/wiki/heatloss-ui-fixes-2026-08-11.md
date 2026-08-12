# Окно теплопотерь и панель свойств: исправления (HeatLossRevit2, 2026-08-11)

Замечания пользователя (Docs/Замечания 2026_08_11.md, п.1–2, 4–5):
1. Не пересчитывается опция сравнения инфильтрации окна и клапаны.
2. Не работает валидация обобщённых моделей: удалил стену — предупреждения нет.
3. UI: дубль таблицы «по уровням» во вкладке «Сводная по типам»; нет «Общ. инфильтрации» в «По уровням».
4. «Детализация»: нет данных по инфильтрации.
5. Панель свойств (PropertyPalette) не отображает данные.

## 1. Метод инфильтрации Sum/Max не применялся в конвейере

Окно расчёта теплопотерь считает через `HeatLossPipeline` (снимок → конвейер → маппинг),
а статический флаг `ConstructionSurfaceModel.GlobalInfiltrationCalculationMethod` выставлялся
только в легаси-`HeatLossCalculationService` и в настройках инфильтрации. Конвейер всегда
суммировал окна+клапаны.

Фикс (файлы):
- `HeatLossRevit.UI/HeatLossTableViewModel.cs` — перед маппингом выставляется
  `GlobalInfiltrationCalculationMethod = settings.InfiltrationCalculationMethod`.
- `Core/Calculation/InfiltrationEngine.cs` — `spaceResult.TotalHeatLoss` и `result.TotalInfiltration`
  считаются с учётом метода (`Max` = максимум окна/клапаны на помещение, `Sum` = сумма).
- `Core/HeatLossResult/Services/Mapping/HeatLossResultSurfaceMapper.cs` — `SpaceInfiltrationLoad`
  маппится по методу (Max окна/клапаны, иначе сумма).

## 2. Валидация удалённых обобщённых моделей при пересчёте

Ribbon-команда `CalculateHeatLossCommand` валидировала реестр, а «Пересчитать» в окне — нет.

Фикс:
- `HeatLossTableViewModel.ValidateDeletedGenericModelsAsync()` — вызывается в начале
  `CalculateModelsAsync`: `PreCalculationValidator.SyncRegistryWithModel` через ExternalEvent,
  при удалённых элементах — предупреждение «связанные поверхности не найдены» (Да/Нет),
  при «Да» — `MarkMissingAsDeleted`.
- Регистрируется `IDirectShapeRegistry` (синглтон Core) в VM.
- Кейс «удаление через интерфейс (пересоздание)»: `DrawDirectShapesFromFaces.DeleteExistingDirectShapesForSpaces`
  теперь возвращает удалённые id; `WallCreationService` (`ExecuteCreation`/`RetryFailed`)
  снимает их с регистрации (`DirectShapeRegistryService.UnregisterMany`) — новые стены получают
  свежие id без ложных предупреждений.
- Удаление внутренних стен панелями WallGeometryEditor/WallsMarkerExternal покрывается тем же
  валидатором (если элемент был в реестре).

## 3. UI: дубль «по уровням» и колонка «Общ. инфильтр.»

- `SummaryByTypeView.xaml` — удалена таблица «Теплопотери по уровням» (осталась только
  по типам ограждений + итог здания). Данные `SummaryByTypeVm.Levels` сохранены (нужны для экспорта).
- `SummaryByLevelsViewModel.cs` — в `LevelSummaryRow` добавлено `TotalInfiltration`
  (= `summary.InfiltrationLoad`, метод-зависимое).
- `SummaryByLevelsView.xaml` — добавлена колонка «Общ. инфильтр., Вт».

## 4. «Детализация»: инфильтрация не отображалась

- Причина: в режиме «Максимум» `ConstructionSurfaceRow.GetDisplayInfiltrationLoad` возвращал 0
  для всех строк, кроме «победителя» → колонка выглядела пустой.
- Фикс: в Max-режиме на каждой строке показывается `SpaceInfiltrationLoad` помещения
  (агрегат уровня помещения); в Sum-режиме поведение прежнее.
- Вместе с п.1 данные инфильтрации теперь реально пересчитываются.

## 5. Панель свойств (PropertyPalette) не показывала данные

Файлы: `MainAppHeatLoss.Projects/PropertyPalette`.

Причина: `PropertiesPanelViewModel.UpdateFromElements` всегда звал `ParameterGroupBuilder.BuildFromModels`,
а `BuildFromModels` брал `models.First()` **без проверки null**. Если модель первого/любого
выбранного элемента не строилась (категория вне списка, ошибка `MapElementToModel`) — NRE →
весь блок параметров не выводился.

Фикс:
- `ParameterGroupBuilder.BuildFromModels` — `FirstOrDefault(m => m != null)`, при отсутствии моделей — пустые группы.
- `PropertiesPanelViewModel.UpdateFromElements` — модель используется только если она построена
  для ВСЕХ выбранных элементов; иначе `BuildFromElements`.

## Проверка

- MSBuild `HeatLossRevit.sln` Debug: 0 ошибок компиляции (публикация в Addins падает, пока открыт Revit).
- Core.Tests: 175/181 (6 падений — предсуществующие SnapshotModel JSON round-trip, не связаны с этими правками).
- Ручной прогон в Revit: перезагрузить плагин, проверить «Пересчитать» при разных методах инфильтрации,
  удаление стены → предупреждение, вкладки сводок, «Детализация», панель свойств на выборе элемента.
