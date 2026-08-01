# MCP Servers — Актуальное состояние (2026-08-01)

Все серверы установлены глобально через npm и настроены в `opencode.json`.

## ✅ Работающие серверы (протестированы handshake)

### 1. storage (SQLite project.db)
- **Тип**: local
- **Команда**: `node .opencode/storage-mcp.mjs`
- **Статус**: ✅ Работает — миссии, задачи, проблемы, ревью записываются в `.opencode/project.db`
- **Инструменты**: `storage_init`, `storage_query`, `storage_execute`, `storage_state`, `storage_mission`, `storage_task`, `storage_problem`, `storage_document`, `storage_review`

### 2. context7 (Remote)
- **Тип**: remote
- **URL**: `https://mcp.context7.com/mcp`
- **Статус**: ✅ Работает — документация библиотек
- **Требует**: `CONTEXT7_API_KEY` в env

### 3. memory (@modelcontextprotocol/server-memory)
- **Тип**: local
- **Пакет**: `@modelcontextprotocol/server-memory`
- **Команда**: `node ...\server-memory\dist\index.js`
- **Статус**: ✅ Работает (9 инструментов)
- **Инструменты**: `create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`, `read_graph`, `search_nodes`, `open_nodes`

### 4. sequential-thinking (@modelcontextprotocol/server-sequential-thinking)
- **Тип**: local
- **Пакет**: `@modelcontextprotocol/server-sequential-thinking`
- **Команда**: `node ...\server-sequential-thinking\dist\index.js`
- **Статус**: ✅ Работает (1 инструмент)
- **Инструмент**: `sequentialthinking` — пошаговое рассуждение

### 5. pdf (@modelcontextprotocol/server-pdf)
- **Тип**: local
- **Пакет**: `@modelcontextprotocol/server-pdf`
- **Команда**: `node ...\server-pdf\dist\index.js --stdio`
- **Статус**: ✅ Работает с флагом `--stdio` (9 инструментов)
- **Важно**: По умолчанию сервер работает в HTTP режиме (порт 3001), для stdio **обязателен** флаг `--stdio`
- **Инструменты**: `list_pdfs`, `read_pdf_bytes`, `display_pdf`, `interact`, `submit_page_data`, `submit_save_data`, `submit_viewer_state`, `poll_pdf_commands`

### 6. filesystem (@modelcontextprotocol/server-filesystem)
- **Тип**: local
- **Пакет**: `@modelcontextprotocol/server-filesystem`
- **Команда**: `node ...\server-filesystem\dist\index.js "C:\Users\Strakhov\OneDrive\Документы\Default Project"`
- **Статус**: ✅ Работает (14 инструментов)
- **Важно**: Путь должен быть доступным и существовать (кириллица в "Документы" — норм)
- **Инструменты**: `read_file`, `read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `move_file`, `search_files`, `get_file_info`, `list_directory_with_sizes`, `read_file_stream`, `write_file_stream`

### 7. playwright (@playwright/mcp)
- **Тип**: local
- **Пакет**: `@playwright/mcp@0.0.78`
- **Команда**: `node ...\@playwright\mcp\cli.js`
- **Env**: `PLAYWRIGHT_BROWSERS_PATH=C:\Users\Strakhov\AppData\Local\ms-playwright`
- **Статус**: ✅ Работает (24 инструмента)
- **Браузер**: Chromium 1232 установлен в `C:\Users\Strakhov\AppData\Local\ms-playwright\chromium-1232`
- **Инструменты**: `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_snapshot`, `browser_evaluate`, `browser_console_messages`, `browser_network_requests`, `browser_file_upload`, `browser_drag`, `browser_hover`, `browser_select_option`, `browser_press_key`, `browser_wait_for`, `browser_take_snapshot`, `browser_generate_playwright_test`, `browser_install`, `browser_close`, `browser_pdf_save`, `browser_handle_dialog`, `browser_authenticate`, `browser_download`, `browser_upload_file`, `browser_execute_script`

### 8. revit-mcp (@shuotao/revit-mcp-server)
- **Тип**: local
- **Пакет**: `@shuotao/revit-mcp-server@1.6.0`
- **Команда**: `node ...\@shuotao\revit-mcp-server\build\index.js`
- **Env**: `REVIT_MCP_PORT=8964`, `MCP_PROFILE=structural`
- **Статус**: ✅ Работает (71 инструмент)
- **Профиль**: `structural` (есть `architectural`, `mep`, `structural`)
- **C# Add-in**: ✅ Собран и задеплоен для **Revit 2024** (`Release.R24`)
  - DLL: `%APPDATA%\Autodesk\Revit\Addins\2024\RevitMCP\RevitMCP.dll`
  - Manifest: `%APPDATA%\Autodesk\Revit\Addins\2024\RevitMCP.addin`
  - Зависимости: все DLL в той же папке `RevitMCP\`
- **Architecture**: Node stdio bridge → WebSocket `ws://localhost:8964` → C# Add-in (Revit API)
- **Для работы**: Запустить Revit 2024, включить "MCP Service" на ленте, порт 8964 слушается аддином
- **Инструменты (71)**: `create_wall`, `create_floor`, `create_column`, `create_beam`, `create_duct`, `create_pipe`, `create_cable_tray`, `create_conduit`, `get_elements`, `get_element_parameters`, `set_element_parameters`, `delete_elements`, `create_view`, `create_sheet`, `dimension_elements`, `tag_elements`, `create_schedule`, `export_ifc`, `export_dwg`, `run_clash_detection`, `analyze_structural`, `calculate_quantities`, ... (полный список через `tools/list`)

---

## ❌ Не работающие / Отключенные

### mcp-server-for-revit (отказался устанавливаться)
- **Причина**: `better-sqlite3` требует MSVC/node-gyp, **нет prebuilt для Node 24**
- **Заменён на**: `@shuotao/revit-mcp-server` (чистый JS, работает)

### opencode-browser (Python)
- **Причина**: Python не установлен (алиас Microsoft Store)
- **Не нужен**: `@playwright/mcp` покрывает браузерную автоматизацию

### git (@liangshanli/mcp-server-git)
- **Статус**: disabled в конфиге, не тестировался

### threejs-devtools, r3f-mcp (planned)
- **Статус**: пакеты недоступны в npm

---

## Конфигурация (opencode.json)

```json
{
  "mcp": {
    "storage": { "type": "local", "command": ["node", ".opencode/storage-mcp.mjs"], "enabled": true },
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp", "enabled": true, "headers": { "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}" } },
    "memory": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-memory\\dist\\index.js"], "enabled": true },
    "sequential-thinking": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-sequential-thinking\\dist\\index.js"], "enabled": true },
    "pdf": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-pdf\\dist\\index.js", "--stdio"], "enabled": true },
    "filesystem": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-filesystem\\dist\\index.js", "C:\\Users\\Strakhov\\OneDrive\\Документы\\Default Project"], "enabled": true },
    "playwright": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@playwright\\mcp\\cli.js"], "enabled": true, "environment": { "PLAYWRIGHT_BROWSERS_PATH": "C:\\Users\\Strakhov\\AppData\\Local\\ms-playwright" } },
    "revit-mcp": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@shuotao\\revit-mcp-server\\build\\index.js"], "enabled": true, "environment": { "REVIT_MCP_PORT": "8964", "MCP_PROFILE": "structural" } },
    "git": { "type": "local", "command": ["node", "C:\\Users\\Strakhov\\AppData\\Roaming\\npm\\node_modules\\@liangshanli\\mcp-server-git\\start-server.js", "D:\\Плагины Ревит\\HeatEnergyCalculator"], "enabled": false }
  }
}
```

---

## Тестирование (handshake)

Все серверы протестированы через stdio JSON-RPC:
```javascript
// Инициализация
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}
// Уведомление initialized (БЕЗ id!)
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
// Список инструментов
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

**Важно**: `notifications/initialized` отправлять **без id** (notify=true), иначе клиент зависает.

---

## Revit MCP — полный цикл

1. **Сервер npm** (`@shuotao/revit-mcp-server`) — Node.js bridge, stdio MCP
2. **C# Add-in** (`MCP/RevitMCP.csproj` → `Release.R24`) — Revit API executor
3. **WebSocket** `ws://localhost:8964` — связь между ними
4. **В Revit**: Включить "MCP Service" на ленте → порт 8964 слушается
5. **AI клиент** вызывает инструменты → сервер → WebSocket → аддин → Revit API → результат обратно

Только **один** AI клиент может держать соединение (эксклюзивная блокировка). Переключение — кнопка "切換/釋放連線" на ленте.