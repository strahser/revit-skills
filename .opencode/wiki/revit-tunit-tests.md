# Revit-тесты с подключением к процессу (TUnit в Revit)

Запуск и отладка unit-тестов Revit-плагинов, когда **тестовый раннер подключается к реальному процессу Autodesk Revit** и выполняет тесты на Revit'овском потоке. Стек: `Nice3point.TUnit.Revit` + `TUnit` + Microsoft.Testing.Platform.

В HeatLossRevit2 это проект **`SnapshotTool\`** (`Nice3point.TUnit.Revit` 2024.1.1, TUnit 1.44.0). Он же генерирует JSON-фикстуру `SnapshotTool\TestData\Snapshot_TestBuildingHvac.json` для Core.Tests.

## Два мира тестов — не путать

| | Core-тесты без Revit | Revit-тесты с подключением к процессу |
|---|---|---|
| Проект | `Core.Tests\` (xunit, net48) | `SnapshotTool\` (TUnit, net48, OutputType=Exe) |
| Нужен Revit | Нет, чистый C# | Да, установленный и лицензированный, версия = конфигурация |
| Запуск | `vstest.console.exe Core.Tests\bin\Debug\net48\Core.Tests.dll` | `dotnet run -c Release.R24` |
| Поток | Любой | Только поток Revit (`RevitThreadExecutor`) |
| Скорость | Секунды | Десятки секунд (старт Revit) |
| Для чего | Логика расчёта, модели, сериализация | Всё, что вызывает Revit API |

Правило выбора: тест трогает Revit API → пишем в TUnit-проект. Не трогает → обычный тест без исполнителя Revit.

## Как это работает

`dotnet run` запускает раннер (Microsoft.Testing.Platform). Раннер:
1. Находит установленный Revit нужной версии (по конфигурации `Release.R24` → Revit 2024) и путь установки.
2. Запускает `Revit.exe`.
3. Через отладочный мост подключается к процессу и выполняет каждый тест **на единственном потоке, инициализировавшем Revit**.
4. Возвращает результаты, закрывает Revit.

Поэтому весь код теста выглядит как обычный API-код — вызовы Revit API маршалируются автоматически. Это и есть «тесты с подключением к процессу».

## Структура проекта (шаблон `revit-tunit`)

### 1. `ProjectName.csproj`

```xml
<Project Sdk="Nice3point.Revit.Sdk/6.2.1">
    <PropertyGroup>
        <OutputType>Exe</OutputType>
        <EnableTUnitPolyfills>false</EnableTUnitPolyfills>
        <Configurations>Debug.R24;Release.R24</Configurations>
        <RootNamespace>SnapshotTool</RootNamespace>
        <AssemblyName>SnapshotTool</AssemblyName>
    </PropertyGroup>

    <!-- язык Revit для тестового запуска -->
    <PropertyGroup>
        <RevitLanguage Condition="'$(RevitLanguage)' == ''">Russian_RU</RevitLanguage>
    </PropertyGroup>
    <ItemGroup>
        <AssemblyAttribute Include="Nice3point.Revit.Injector.Attributes.RevitLanguageAttribute">
            <_Parameter1>$(RevitLanguage)</_Parameter1>
        </AssemblyAttribute>
    </ItemGroup>

    <ItemGroup>
        <PackageReference Include="Nice3point.Revit.Api.RevitAPI" Version="2024.3.40"/>
        <PackageReference Include="Nice3point.TUnit.Revit" Version="2024.1.1"/>
        <PackageReference Include="TUnit" Version="1.44.0"/>
        <PackageReference Include="Polyfill" Version="11.0.1"/>
    </ItemGroup>

    <ItemGroup>
        <ProjectReference Include="..\MainAppHeatLoss\MainAppHeatLoss.csproj"/>
    </ItemGroup>
</Project>
```

Ключевые точки:
- `OutputType=Exe` — раннер запускается как приложение, `dotnet run`.
- `Nice3point.TUnit.Revit` — версия **привязана к версии Revit** (2024.x). Для других лет — свой пакет.
- Язык Revit по умолчанию — `English - United States`; переопределяется атрибутом `RevitLanguage` (код `Russian_RU`, `ENU` и т.п.). Путь установки — атрибутом `RevitInstallationPath`.

### 2. `TestsConfiguration.cs` — глобальный исполнитель

```csharp
using Nice3point.TUnit.Revit.Executors;
using TUnit.Core.Executors;

[assembly: TestExecutor<RevitThreadExecutor>]
```

Атрибут на сборку: **каждый тест и хук** по умолчанию выполняются на Revit-потоке. Отдельные `[TestExecutor<RevitThreadExecutor>]` на тестах тогда не нужны.

### 3. Тестовый класс

```csharp
using Nice3point.TUnit.Revit;

public sealed class SnapshotCreationTests : RevitApiTest
{
    // RevitApiTest даёт свойство Application (инициализировано на Revit-потоке)
    [Test]
    public async Task CreateSnapshot_FromTestBuilding_JsonSaved()
    {
        var app = Application;                    // Autodesk.Revit.ApplicationServices.Application
        // ... тест на Revit-потоке
        await Assert.That(snapshot.Spaces).IsNotEmpty();
    }
}
```

Есть два базовых класса: `RevitApiTest` (доступен `Application`) и `RevitApplicationTest`.

## Потоковая модель — главное правило

- **Discovery, конструкторы, data sources, DI-резолв происходят ДО инициализации Revit и вне его потока.** Запрещено трогать Revit API на этом этапе: `new ElementId(...)`, чтение свойств `Application`, любые обращения к сборкам `Autodesk.Revit` → исключение `InvalidOperationException: Attempted to write protected memory`.
- **Инициализация поля в конструкторе класса тоже выполняется на discovery.** Нельзя: `private readonly ElementId _id = new(123);`. Можно: лениво, при первом обращении в теле теста.
- Тело теста и `[Before]`/`[After]`-хуки — на Revit-потоке.
- Data source (например, `[MethodDataSource(nameof(Paths))]`) возвращает только примитивы/пути к файлам, а Revit-объекты создаются в теле теста.

Хуки, работающие с Revit, помечаются явно:

```csharp
[Before(Test)]
[HookExecutor<RevitThreadExecutor>]
public void OpenModel()
{
    _document = Application.OpenDocumentFile(path, new OpenOptions());
}

[After(Test)]
[HookExecutor<RevitThreadExecutor>]
public void CloseModel()
{
    _document?.Close(false);
}
```

Документ создаётся в `[Before(Test)]`, закрывается в `[After(Test)]` — каждый тест получает изолированное состояние (иначе «по отдельности проходят, вместе падают»).

## Запуск

```shell
# весь проект (предпочтительный способ; подходит и для передачи флагов раннеру)
dotnet run -c Release.R24 --project SnapshotTool

# конкретный тест по полному имени
dotnet run -c Release.R24 --project SnapshotTool -- --filter "FullyQualifiedName~SnapshotCreationTests"

# список тестов
dotnet run -c Release.R24 --project SnapshotTool -- --list-tests
```

`R24` = год Revit (2024). Revit нужной версии должен быть установлен и лицензирован.

> **На .NET 10 SDK `dotnet test` с Microsoft.Testing.Platform не поддерживается — используйте `dotnet run`.** На более старых SDK можно и `dotnet test -c Release.R24`.

При каждом запуске проект **пересобирается** (TUnit-тесты генерируются из исходников). После каждого прогона **закрывайте Revit**, иначе DLL заблокированы и следующая сборка упадёт с `MSB3021 / MSB3027` («файл используется другим процессом»). Если Revit нужен открытым — переопределите папку вывода (например `-p:OutputPath=bin\Debug2\`).

## Отладка: подключение к процессу (Attach to Process)

Тесты выполняются внутри процесса Revit, поэтому отладка — это **подключение отладчика к `Revit.exe`**:

1. Поставьте брейкпоинты в тестах (Visual Studio / Rider).
2. Запустите тесты: `dotnet run -c Release.R24 --project SnapshotTool`. Revit начнёт стартовать.
3. Пока Revit грузится, в Visual Studio: **Отладка → Присоединиться к процессу…** (Debug → Attach to Process…).
   - Тип кода: **Управляемый код** (Managed).
   - Процесс: **Revit.exe** (поставьте галку «Показать процессы всех пользователей», если нужно).
   - **Присоединить**.
4. Дождитесь попадания в брейкпоинт. Далее — обычная отладка: шаг, инспекция переменных, Immediate Window.

Нюансы:
- Присоединяться нужно быстро — раннер начинает выполнять тесты вскоре после старта Revit. Альтернатива: поставить `Debugger.Launch()` в начале теста или брейкпоинт на первом `[Before(Test)]`.
- **Визуально подтверждать прохождение — через `TaskDialog.Show(...)` или `Trace.WriteLine(...)`** (вывод виден в Output раннера / окне вывода Visual Studio).
- В **JetBrains Rider** включите поддержку платформы тестирования: *Settings → Build, Execution, Deployment → Unit Testing → Enable Testing Platform support*, тогда кнопка Run сама стартует Revit и подхватит результаты; отладка — кнопкой Debug (Rider сам подключится к процессу).

## Уже запущенный Revit (легаси-способ)

Классический подход без раннера — внешняя команда-запускатель тестов через AddinManager:

```csharp
[Transaction(TransactionMode.Manual)]
public class TestRunner : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        // ручной прогон "тестов" внутри уже открытого Revit,
        // результат — в TaskDialog
        return Result.Succeeded;
    }
}
```

1. Соберите проект (например `dotnet build -o bin\Debug2`) и скопируйте DLL + `.addin` в `%APPDATA%\Autodesk\Revit\Addins\<год>\`.
2. Откройте Revit → AddinManager (Ctrl+D / External Tools) → выберите команду `TestRunner` → Run.

Этот способ не даёт TUnit-ассертов, отчётов и фильтров — для новых тестов используйте TUnit-раннер; легаси-подход подходит для быстрых ручных проверок внутри рабочего файла.

## Типовые ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| `Attempted to write protected memory` при discovery | Revit API тронут в конструкторе/поля/data source до инициализации Revit | Вынести в тело теста или ленивое `field ??= …` |
| Потоковый сбой вызова Revit API | Вызов вне `RevitThreadExecutor` | Проверить `TestsConfiguration.cs` и `[HookExecutor<RevitThreadExecutor>]` на хуках |
| `RevitApiTest`/`RevitThreadExecutor` не найден | Нет пакета `Nice3point.TUnit.Revit` | Добавить PackageReference |
| `MSB3021/MSB3027 DLL locked by Revit` | Предыдущий прогон не закрыл Revit | Закрыть Revit или сменить OutputPath |
| Revit не стартует / не та версия | Не установлен Revit, не совпадает конфигурация | Проверить `Release.RNN` и установку Revit |
| Тесты проходят по отдельности, падают вместе | Общее состояние между тестами | Свой документ на тест (Before/After), закрывать документы |
| Параллельные тесты «мешают» друг другу | TUnit параллелит тесты, Revit однопоточный | Ограничить `RevitCountParallelLimit` или настроить параллелизм TUnit |

## Практический рецепт (как в SnapshotTool)

1. Требуется модель Revit → откройте её в `[Before(Test)]` через `Application.OpenDocumentFile(путь, new OpenOptions())`. Путь из «видимого» вида в модель — через `ModelPathUtils.ConvertUserVisiblePathToModelPath(...)`.
2. Вызовите тестируемый сервис с реальным `Document` (в SnapshotTool — `new RevitSnapshotBuilder(new TestLogger()).BuildSnapshot(_document)`).
3. Проверьте результаты `Assert.That(...)` и, при необходимости, запишите артефакт (JSON-фикстуру) в репозиторий — его потом читают Core.Tests без Revit.
4. Вывод для отладки — `Trace.WriteLine(...)`.

Ссылки: [Nice3point.TUnit.Revit](https://www.nuget.org/packages/Nice3point.TUnit.Revit), [RevitUnit](https://github.com/Nice3point/RevitUnit), [TUnit](https://thomhurst.github.io/TUnit/). Скилы: [revit-testing](../skills/revit-testing/SKILL.md), [revit-test-fixtures](../skills/revit-test-fixtures/SKILL.md), [revit-test-runner](../skills/revit-test-runner/SKILL.md).
