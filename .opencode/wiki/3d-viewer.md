# 3D Viewer Architecture

## Файл

`MepBimServer\ui\demo3D\Index.html` — standalone single-file Three.js вьювер.

## Технологии

- Three.js r170 (CDN importmap)
- OrbitControls
- Никаких bundler-ов, npm, build steps

## Архитектура

```
initScene()
  ├── Scene, Camera (Perspective), Renderer
  ├── AmbientLight + 2x DirectionalLight
  ├── GridHelper + AxesHelper
  ├── OrbitControls
  └── Animation loop

loadData(jsonUrl)
  ├── fetch + parse JSON
  ├── Фильтрация failed-элементов
  └── Для каждого элемента:
        ├── buildElement() — BoxGeometry из BoundingBox
        ├── buildFromLocationCurve() — Tube из LocationCurve
        └── buildFromLocationPoint() — куб-заглушка

fitCamera() — автоматическое позиционирование
createViewCube() — Top / Side / Isometric кнопки

UI (вкладки)
  ├── Buildings — по умолчанию выбрана
  ├── Systems
  └── Rooms
```

## Координатная система

- Revit: Z-up, футы → JSON: Z-up, мм
- Three.js: Y-up, мм
- Revit Z → Three.js Y, Revit Y → Three.js Z

## Известные проблемы

| Проблема | Статус |
|----------|--------|
| Не-стены не видны (нет BoundingBox) | Работает fallback на LocationPoint, но размеры маленькие |
| Криволинейные стены | Не реализовано — JSON не содержит curvePoints |
| Запятые в числах | Исправлено — `v.replace(',','.')` |
| Отступы между элементами | Нет — все стены вплотную |
| Orientation cube | Реализован как 3 кнопки (Top/Side/Isometric) |
