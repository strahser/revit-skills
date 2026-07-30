# Revit JSON Export Specification

## Формат файла

```json
{
  "elements": [
    {
      "id": int,
      "name": "string",
      "category": "string",
      "level": "string",
      "layer": "string",
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
  ],
  "exportTime": "2025-07-29T13:02:48",
  "units": "mm"
}
```

## Поля geometry

| Поле | Обязательность | Описание |
|------|---------------|----------|
| `BoundingBox` | Всегда | Полный bounding box элемента, сконвертированный в мм |
| `LocationCurve` | Для линейных | Start/End точки кривой |
| `LocationPoint` | Fallback | Центральная точка, если нет BoundingBox |

## Правила сериализации

1. Единицы: все размеры в миллиметрах
2. Разделитель: точка (не запятая) — `InvariantCulture`
3. Null поля: не включать в JSON (`NullValueHandling.Ignore`)
4. Имена ключей: camelCase
5. Id элементов: сериализовать как `int`, не как `ElementId`

## Дебаг-поля

- `"debug": "degenerate bbox"` — если BoundingBox.Min == BoundingBox.Max
- `"debug": "fallback location point"` — если используется LocationPoint
- `"debug": "skipped"` — элемент не имеет геометрии

## Известные проблемы

1. **BoundingBox == null для не-стен**: Floors, Roofs, Windows, Doors, Columns часто не имеют BoundingBox в экспорте.
   - **Решение**: Использовать `LocationPoint` с размером по умолчанию.
2. **Криволинейные стены**: LocationCurve для дуг/окружностей.
   - **Решение**: Добавить `curvePoints[]` с аппроксимированными точками.
3. **Десятичная запятая**: Revit может выдавать числа с запятой.
   - **Решение**: g—C# форматирование с `InvariantCulture`.
4. **Стены без LocationCurve**: Некоторые стены не дают LocationCurve.
   - **Решение**: Fallback на BoundingBox → вычислить ось по длинной стороне.
