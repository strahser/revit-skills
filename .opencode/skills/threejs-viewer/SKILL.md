# Three.js 3D Viewer

Архитектура и правила поддержки вьювера (`demo3D/Index.html`).

## Сборка

- Three.js через CDN: `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`
- Import map: `<script type="importmap">` в `<head>`
- Никаких npm/bundler — всё в одном HTML-файле

## Организация кода (разделы в Index.html)

1. **Import map** — CDN URL для three.module.js
2. **Глобальные переменные** — scene, camera, renderer, controls, elementsMap
3. **initScene()** — создание сцены, камеры, освещения, контролов
4. **loadData(jsonUrl)** — fetch + фильтрация failed-элементов
5. **buildElement(element, parent)** — создание BoxGeometry + Mesh для элемента
6. **buildFromLocationCurve(curve)** — экструзия вдоль кривой
7. **buildFromLocationPoint(point)** — куб-заглушка
8. **fitCamera()** — автоматическое позиционирование камеры по bounding box сцены
9. **createViewCube()** — кнопки: Top, Side, Isometric

## Обработка координат

```javascript
// Revit (Z-up mm) → Three.js (Y-up mm)
const position = new THREE.Vector3(
  parseFloat(pt.x.replace(',','.')),
  parseFloat(pt.z.replace(',','.')),   // Revit Z → Three.js Y
  parseFloat(pt.y.replace(',','.'))    // Revit Y → Three.js Z
);
```

## Правила

- Всегда парсить запятые в числах (`v.replace(',','.')`)
- Всегда проверять `element.geometry?.BoundingBox` перед построением
- Если `BoundingBox` дегенеративный (min == max или нулевой объем) → fallback
- Fallback chain: BoundingBox → LocationCurve (100мм box вокруг) → LocationPoint (200мм куб)
- Категории для фильтрации: Walls, Floors, Roofs, Ceilings, Columns, Beams, Windows, Doors, Structural Foundations, Ducts, Pipes, Cable Trays

## Тюнинг

- Fog: `scene.fog = null` (отключен — мешает обзору)
- Lights: `AmbientLight(0xffffff, 0.6)` + два `DirectionalLight(0xffffff, 1.0)` с разных сторон
- Controls: `OrbitControls` с `enableDamping: true`
- Floor grid: `GridHelper(20000, 20)` для ориентации
- Axes helper: `AxesHelper(5000)` для отладки
