---
name: revit-3d-export
description: Export Revit geometry for the Three.js 3D viewer. Use when converting Revit coordinates (Z-up feet) to Three.js (Y-up mm), writing export JSON, or applying the BoundingBox/LocationCurve/LocationPoint fallback chain.
---

# Revit 3D Geometry Export

Правила экспорта геометрии из Revit для отображения в Three.js 3D-вьювере.

## Координатная система

- Revit: Z-up, внутренние футы
- Three.js viewer: Y-up, миллиметры
- При экспорте в JSON: конвертировать футы в мм (умножить на 304.8)
- При загрузке во вьювер: Z (Revit) → Y (Three.js), Y (Revit) → Z (Three.js)

## Обязательные поля JSON

### Для всех элементов

| Поле | Тип | Источник |
|------|-----|----------|
| `id` | int | `ElementId.IntegerValue` |
| `name` | string | `Name` |
| `category` | string | `Category.Name` |
| `level` | string | `Level.Name` |
| `layer` | string | `DesignOption.Name` или `""` |

### Geometry

| Поле | Когда заполнять | Источник |
|------|----------------|----------|
| `BoundingBox` | Всегда | `get_BoundingBox(null)` → конвертировать `Min`/`Max` в мм |
| `LocationPoint` | Если нет BoundingBox (или он нулевой) | `(Location as LocationPoint)?.Point` |
| `LocationCurve` | Если элемент линейный (стены/балки/трубы) | `(Location as LocationCurve)?.Curve` → `GetEndPoint(0)`/`GetEndPoint(1)` |
| `BoundingBoxCenter` | Вычисляется | Средняя точка между Min и Max |

### Типы конструкций

- **Walls**: `BoundingBox` вычисляется по всей стене (включая толщину)
- **Floors, Roofs, Ceilings**: обязателен `BoundingBox`
- **Windows, Doors**: обязателен `BoundingBox` (рамка целиком)
- **Columns, Beams, Braces**: `LocationCurve` + `BoundingBox`
- **Ducts, Pipes, Cables**: `LocationCurve` + диаметр (`ConnectorInfo`)

## Алгоритм fallback

Если `BoundingBox` == null или min==max:
1. Проверить `LocationCurve` → построить box из кривой + 100мм запас
2. Проверить `LocationPoint` → построить куб 200×200×200 вокруг точки
3. Иначе → пропустить элемент с warning

## Работа с криволинейными стенами

- Для `CurtainWall` / `Wall with arc`: экспортировать `LocationCurve` как массив точек (аппроксимация)
- Поле `isCurved: true` + `curvePoints: [{x,y,z},...]`
- Во вьювере строить TubeGeometry или ExtrudeGeometry по точкам
