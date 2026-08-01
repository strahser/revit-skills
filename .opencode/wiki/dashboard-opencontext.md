# Dashboard и OpenContext

Локальные UI для просмотра состояния проекта и базы знаний.

## 1. Веб-дашборд проекта (`.opencode/dashboard.mjs`)

Локальный сервер на встроенных модулях Node (node:sqlite + node:http, без зависимостей). Показывает:

| Вкладка | Что показывает |
|---------|---------------|
| **Скилы** | 9 SKILL.md: имя, описание, путь, размер |
| **База данных** | таблицы `project.db`: missions, tasks, progress_log, problems, documents, review_rounds |
| **Миссия** | артефакты оркестратора: todo.md, context.md, summary.md, work-log.md, mission-ledger.jsonl, docs/brain/ |
| **Wiki** | страницы `.opencode/wiki/` |

### Запуск

```bash
node .opencode/dashboard.mjs
```

- Адрес: http://localhost:4317
- Порт: env `DASHBOARD_PORT` (по умолчанию 4317)
- Автообновление данных каждые 15 сек
- База читается в режиме `readOnly`, файлы только на чтение — дашборд ничего не меняет

## 2. OpenContext (`oc` CLI + Web UI)

Глобальная база знаний для AI-агентов. Хранилище: `~/.opencontext/contexts/`, БД: `~/.opencontext/opencontext.db`.

### Запуск UI

```bash
oc ui
```

- Адрес: http://127.0.0.1:4321

### Полезные команды

```bash
oc folder ls --all            # список папок-контекстов
oc doc create <folder> <name>.md -d "описание"
oc doc ls <folder>            # список документов
oc context manifest <folder>  # манифест для чтения агентом
oc search "<query>" --mode keyword   # поиск (требует EMBEDDING_API_KEY)
```

### Настройка поиска (опционально)

Семантический поиск требует ключ эмбеддингов:

```bash
oc config set EMBEDDING_API_KEY "<key>"
oc index build
```

### Интеграция с opencode

- `oc init` дописывает блок `OPENCONTEXT:START/END` в `AGENTS.md` проекта
- Инструкции для агента: `~/.opencontext/agents/AGENTS.md`
- Контекст проекта `revit-skills` создан в папке `revit-skills/`

## Примечания

- **Windows/PowerShell**: `.ps1` заблокирован политикой — вызывай `oc.cmd`, `npm.cmd`, `git`
- Keyword-поиск в `oc search` тоже требует `EMBEDDING_API_KEY` (особенность CLI)
- Дашборд и OpenContext — независимые; интеграцию (например, кнопка «открыть в OpenContext» из дашборда) можно добавить позже
