# MCP Server Setup

Настройка Model Context Protocol (MCP) серверов для Revit + 3D разработки.

## Активные MCP серверы

| Сервер | Назначение | Команда |
|--------|------------|---------|
| `opencode-browser` | Браузерная автоматизация (Playwright) | `python browser_mcp.py` |
| `playwright` | Запуск Playwright тестов | `python -m playwright` |
| `threejs-devtools` | Дебаг Three.js сцены (planned) | `npx threejs-devtools` |
| `r3f-mcp` | React Three Fiber компоненты (planned) | `npx r3f-mcp` |

## Где конфиг

- **Глобальный**: `~/.config/opencode/opencode.jsonc` — автостарт при любой сессии
- **Проектный**: `{project}/.opencode/opencode.json` — только при открытом проекте

Все серверы конфигурируются в блоке `"mcp"` с форматом:
```json
{
  "mcp": {
    "server-name": {
      "type": "local",
      "command": ["executable", "arg1", "arg2"],
      "enabled": true,
      "environment": {
        "KEY": "value"
      }
    }
  }
}
```

## Принцип работы

- opencode запускает MCP-серверы при старте сессии (автостарт)
- Серверы предоставляют инструменты (tools), которые агент может вызывать
- Каждый сервер работает как отдельный процесс (stdio)

## Когда использовать

- **opencode-browser**: для навигации по сайтам, заполнения форм, скриншотов, парсинга
- **playwright**: для запуска E2E тестов в браузере
- **threejs-devtools**: для инспекции Three.js сцены — просмотр mesh, материалов, текстур
- **r3f-mcp**: для генерации React Three Fiber компонентов

## Установка зависимостей

```bash
# opencode-browser
pip install playwright
python -m playwright install chromium

# planned
npm install -g threejs-devtools r3f-mcp
```

## Устранение проблем

- Если навыки не подгружаются: проверь `"skills"` → `"paths"` в конфиге (не `"skills"` → `"import"`)
- Если MCP не стартует: проверь `"mcp"` (не `"mcpServers"`) и `"type": "local"` (не `"transport"`)
- Если сервер стартует но не даёт tools: перезапустить opencode
- Если ошибка `command not found`: установить глобально или указать полный путь
