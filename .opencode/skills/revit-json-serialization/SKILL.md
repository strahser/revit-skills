---
name: revit-json-serialization
description: Serialize Revit objects to JSON for the 3D viewer. Use when defining JSON keys, handling invariant-culture decimals, trimming null fields, or serializing ElementId in C# (camelCase keys, ElementId as int).
---

# Revit JSON Serialization

Правила сериализации объектов Revit в JSON для 3D-вьювера.

## Формат ключей

- camelCase для всех ключей JSON
- Без лишних вложений — плоская структура где возможно

## Проблемы и решения

| Проблема | Решение |
|----------|---------|
| Десятичный разделитель — запятая | JS `parseFloat` кидает NaN. В C#: при сериализации `double` → замена `,` на `.` через `InvariantCulture` |
| `BoundingBox` == null для не-стен | Fallback на `LocationPoint` с дефолтным размером |
| `null` поля в JSON | Trim null-полей (`NullValueHandling.Ignore`) |
| Имена свойств на русском | Не использовать; только латиница / английские имена |
| `ElementId` как `ElementId(IntegerValue)` | Сериализовать как `id: int` |

## Пример структуры JSON

```json
{
  "elements": [
    {
      "id": 123456,
      "name": "Basic Wall",
      "category": "Walls",
      "level": "Level 1",
      "layer": "",
      "geometry": {
        "BoundingBox": {
          "Min": { "x": -1234.5, "y": 0.0, "z": 0.0 },
          "Max": { "x": 5678.9, "y": 200.0, "z": 3000.0 }
        },
        "LocationCurve": {
          "Start": { "x": -1234.5, "y": 0.0, "z": 0.0 },
          "End": { "x": 5678.9, "y": 0.0, "z": 0.0 }
        }
      },
      "parameters": {
        "Width": 200,
        "Height": 3000,
        "Comments": ""
      }
    }
  ]
}
```

## C# boilerplate

```csharp
var settings = new JsonSerializerSettings
{
    Culture = CultureInfo.InvariantCulture,
    NullValueHandling = NullValueHandling.Ignore,
    Formatting = Formatting.Indented,
    ContractResolver = new CamelCasePropertyNamesContractResolver()
};
```

## Дебаг лога

- При `Min == Max` в BoundingBox → писать `debug: "degenerate bbox"`
- При fallback на LocationPoint → писать `debug: "fallback location point"`
- При невозможности определить положение → писать `debug: "skipped"` и не включать в массив
