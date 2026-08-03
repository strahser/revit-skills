# Django Task App (планировщик задач)

Текущее состояние приложения, цель — максимально повторить [ToDoList](https://www.abstractspoon.com/) (менеджер задач с иерархией, фильтрами и настройкой вида).

## Расположение

| Что | Где |
|-----|-----|
| Проект | `e:\Автоматизация\djangoProject` (перенесён с Яндекс.Диска 31.07.2026) |
| Базы | `e:\Автоматизация\djangoProjectDB\db.sqlite3` (рабочая), `personal_db.sqlite3` (личная) |
| Венв | `e:\Venvs\djangoProject` |
| Запуск | `django.bat` → `python manage.py runserver 0.0.0.0:8000` |

## Архитектура

- **Приложения**: `ProjectTDL` (задачи, mptt-дерево TaskNode), `StaticData` (справочники: проект/статус/категория/здания/разделы), `ProjectContract` (подрядчики/договоры), `PersonalData` (личные проекты: «квартира Волгоград»), `Emails`/`email_ui` (почта, правила, SavedFilter), `TelegramParser`.
- **Переключение БД** (`djangoProject\db_switch\`): роутер `DbRouter.py` (SWITCHABLE_APPS → текущая БД, PersonalData → personal_db), middleware из сессии `db_mode`, `thread_local`. Раздел меню админки «Проекты» называется «Личные»/«Рабочие/Симрус» по активной БД (middleware синхронизирует `verbose_name` ProjectTDL + переопределённый блок sidebar в `templates/admin/base_site.html`).
- **AdminLTE**: v4.0.0-rc3 + патчи `.control-sidebar` в `static/vendor/adminlte/` (панель Customize починена).

## Страница задач (`/`)

- Фильтры: **Проект, Статус, Категория, Ответственный, Срок** — мгновенный AJAX (`filter_tasks_ajax`, debounce 250 мс), GET-параметры.
- Закреплённые проекты (`ProjectPin`) — вкладки «Все проекты / Проекты».
- Таблица `django_tables2` + DataTables, дерево задач (mptt), быстрое создание, массовое редактирование, префилы полей из контекста родителя.

## Фильтры и настройки — серверное состояние (с 31.07.2026)

**Отказ от «Площадки» и «Подпроекта»** (решение пользователя):
- Сущность одна — `StaticData.ProjectSite` (verbose_name «Проект», поле «Наименование Проекта»). «Площадка» была только ярлыком в UI — переименована в «Проект» везде (фильтры, ProjectPin, админка).
- «Подпроект» (`StaticData.SubProject`, КЖ/ВК/ОВ) **удалён полностью**: поле `TaskNode.sub_project`, `Contract.sub_project`, `ProjectSite.default_sub_project`, фильтры, формы, шаблоны. Миграции: `ProjectTDL 0011`, `ProjectContract 0002`, `StaticData 0003`. Таблица `StaticData_subproject` удалена из обеих БД.

**Модели:**
- `ProjectTDL.UserSettings` — настройки пользователя (таблица `ProjectTDL_usersettings` существовала и была осиротевшей; модель возвращена, миграция `0013` — `--fake` в обеих БД). Поля: inherit_props, new_task_position, default_tree_view, default_* (префилы), column_visibility (JSON), **auto_save** (чекбокс «Сохранять состояние»), **active_project** (FK на проект — активная вкладка). Колонка `default_sub_project` дропнута вручную из обеих БД, добавлены `auto_save` и `active_project_id`.
- `ProjectTDL.TaskFilterState` — сохранённое состояние фильтров (миграция `0012`): user, project_site (FK, NULL = общее), params (JSON: project_site/status/category/contractor/due_date), updated_at. unique (user, project_site). Таблица в обеих БД (ProjectTDL — SWITCHABLE), поэтому id проектов не пересекаются между БД.

**Логика (ToDoList-подобная):**
- Чекбокс «Сохранять состояние» в панели фильтров (по умолчанию включён, хранится в UserSettings.auto_save). Включён → каждый debounce-сохранённый фильтр пишется в БД; выключен → запись состояния удаляется (фильтры живут «сессией»).
- Восстановление при загрузке `GET /`: состояние по **активному проекту** (active_project, сохраняется при клике на вкладку/пин), иначе — **общее** (project=NULL), иначе — дефолт «все».
- Endpoints: `POST /save_filter_state/` (upsert/delete состояния + auto_save), `POST /save_settings/` (save_user_settings реализован: префилы, new_task_position, column_visibility, active_project_id).
- localStorage на странице задач **полностью убран** (фильтры, активный проект, видимость колонок, префилы, вид «дерево»). Хак `task_last_db_mode` не нужен — настройки разделяются по БД сами.
- Починено: `data_filter_qs` читал только POST, поэтому фильтр «Срок» не работал в AJAX (GET) — теперь принимает source.

**URL:** кодируются фильтры в GET (`filter_ajax`), состояние страницы — серверное.

## Что уже есть из ToDoList-фич

- Иерархические задачи с детьми/родителями (mptt) ✓
- Массовое редактирование выделенного ✓
- Быстрое создание задачи из строки ✓
- Кастомные колонки/видимость ✓ (в БД, UserSettings.column_visibility)
- Восстановление последнего состояния фильтров ✓ (TaskFilterState, по проектам + общее)

## Чего не хватает (план)

1. **Именованные пресеты вида** — модель `TaskSavedView`: user, name, params (JSON), is_default, ordering (аналог `email_ui.SavedFilter`). Сейчас сохраняется только последнее состояние, без имён.
2. Панель на странице: «Сохранить вид», список видов, «По умолчанию».
3. Deep-link: фильтры в URL основной страницы (сейчас GET только в AJAX).
4. localStorage из других страниц (base.html dark-mode и т.п.) — не трогать, это не фильтры.
5. Дальше (по ToDoList): приоритеты, контексты/теги, зависимости задач, повторяемость, напоминания.

## Как применяли миграции (важно)

`DbRouter.allow_migrate` для SWITCHABLE_APPS проверяет `db == get_current_db()` → для личной БД нужен `DB_MODE=personal_db`:
```
$env:DB_MODE='default'; python manage.py migrate
$env:DB_MODE='personal_db'; python manage.py migrate --database=personal_db
```
Миграцию, создающую уже существующую таблицу, — `--fake` (пример: `ProjectTDL 0013_usersettings`).
