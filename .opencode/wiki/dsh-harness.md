# DeepSeek Harness (DSH) — мост с opencode

DeepSeek Harness — оркестратор агентов с веб-UI. opencode (основной агент) общается
с харнессом **через API** на `http://127.0.0.1:3080`: ставит задачи, следит за
прогрессом, читает результаты. Вопрос-ответ виден в веб-UI харнесса **по умолчанию**:
любая сессия, созданная через API, появляется в списке сессий, промпт — как вопрос
пользователя, ответ стримится в чат.

## Запуск

```powershell
# 1) синхронизация скилов из git (agent-skills) + старт прокси (8787) + харнесса (3080)
powershell -ExecutionPolicy Bypass -File E:\ПлагиныРевит\DSH\start-harness.ps1

# 2) то же + автооткрытие веб-UI в браузере (ярлык «DeepSeek Harness» на рабочем столе)
powershell -ExecutionPolicy Bypass -File E:\ПлагиныРевит\DSH\open-harness.ps1

# 3) только синк скилов (харнесс live-watch'ит папку, рестарт не нужен)
powershell -ExecutionPolicy Bypass -File E:\ПлагиныРевит\DSH\sync-skills.ps1
```

- Скрипты идемпотентны: каждый сервис стартует только если его порт свободен.
- Прокси: `E:\ПлагиныРевит\DSH\opencode-proxy\opencode_proxy.py` (порт 8787, лог `proxy.log`).
  Промпт передаётся в opencode **через stdin**, не аргументом: длинный текст со
  спецсимволами (`{ } | ├── «»`) через `.cmd`-обёртку ломает cmd.exe
  (`rc=1 Недопустимый параметр командной строки`). Фикс: коммит `96ff86e`.
- Харнесс: `node E:\ПлагиныРевит\DSH\node_modules\@deepseek-ai\dsh\lib\bin.js --profile web` (порт 3080).
- Конфиг: `C:\Users\Strakhov\.dsh\settings.yaml` (провайдеры/модели), патчи профиля web — `C:\Users\Strakhov\.dsh\profiles\web\cordis.patch.yml`.

## Модели

| Провайдер (UI) | Модели |
|---|---|
| OpenCode Free | `opencode/deepseek-v4-flash-free`, `opencode/big-pickle` (**текущий дефолт**) |
| OpenCode GO | `opencode-go/deepseek-v4-flash` (платный шлюз) |

Все идут через прокси :8787, который вызывает `opencode run --model <model>`.
Известные проблемы:
- у opencode-go долгий первый токен (2–5 мин), харнесс таймаутит и ретраит —
  ретраи порождают дублирующиеся `opencode run`;
- flash-free может зависнуть: ход падает с `Request timed out (TIMEOUT)` после
  ретраев. Лечение: `session.selectModel` на big-pickle + повторный промпт в ту
  же сессию (история сохраняется).

## API (общение с харнессом)

POST `http://127.0.0.1:3080/api/<method>`, тело:
`{"type":"client-request","rpcId":"<id>","method":"<method>","payload":{...}}`

```python
import json, urllib.request

def api(method, payload):
    req = urllib.request.Request(
        "http://127.0.0.1:3080/api/" + method,
        data=json.dumps({"type": "client-request", "rpcId": "t1",
                         "method": method, "payload": payload}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

# создать сессию (появляется в UI)
s = api("session.create", {"cwd": r"E:\ПлагиныРевит\MepBimServer"})
sid = s["result"]["value"]["sessionId"]

# поставить задачу (асинхронно, режим queue)
api("session.prompt", {"sessionId": sid, "mode": "queue",
                       "content": [{"type": "text", "text": "задача"}]})

# читать историю (события: user/message, request/header, assistant/chunk, tool/*, turn/end)
h = api("session.history", {"sessionId": sid})
events = h["result"]["value"]["events"]

# список сессий и статусы
sessions = api("session.list")
```

Полезные методы: `session.create`, `session.prompt`, `session.history`,
`session.list`, `session.rename`, `session.selectModel`, `session.models`,
`llm.providers`. Сессии хранятся в `C:\Users\Strakhov\.dsh\sessions\`.

## Организация сессий

- «Папка» сессии в UI = её **рабочая директория (cwd)**, задаётся при создании
  (`session.create {"cwd": ...}`) и **не может быть изменена позже** (переноса
  сессии между папками нет — `session.rename` меняет только заголовок).
- Правило: каждая новая задача = `session.create` с cwd проекта + осмысленный
  заголовок через `session.rename`. Старые тестовые сессии в корне/DSH — мусор,
  их можно не использовать (удаления через API нет).
- `session.selectModel {sessionId, provider, model}` — выбор модели **на сессию**
  (именно это делает пикер модели в UI). Применяется сразу, к следующему ходу;
  рестарт и правка settings.yaml не нужны.
- Бесплатные модели: `opencode/deepseek-v4-flash-free` (дефолт), `opencode/big-pickle`
  (оба — OpenCode Free). `opencode-go/deepseek-v4-flash` — платный шлюз.

## Специализированные агенты (аналог агентов dev-pipeline)

DSH умеет создавать и управлять специализированными агентами (проверено live):

- **Прессеты агентов** = каталог с `agent.cordis.yml` (состав: tools, skills,
  persona, permissions). Встроенные: `standard` (дефолт), `code` (PTC),
  `minimal`, `cordis` (создание пресетов).
- **Создание = копирование** (copy-only): `agentPreset.copy {from, agentPreset, name}`
  → `C:\Users\Strakhov\.dsh\.agent-presets\<id>\` (agent.cordis.yml + preset.yml),
  дальше правка файлов. Управление: `agentPreset.list/read/remove/select`.
- **Выбор пресета — на сессию**: при `session.create {agentPreset}` или
  `agentPreset.select {sessionId, agentPreset}`; переключение только на пустой
  сессии (`agent-preset-locked`).
- **Субагенты**: провайдеры `spawn`/`fork` (in-process, уже установлены),
  child наследует пресет родителя; управление через API
  `subagent.list/prompt/history/interrupt` (list требует `parentSessionId`).
- Для ролей dev-pipeline (controller/planner/executor/reviewer) новых плагинов
  не нужно: пресет = копия standard + свой agent.cordis.yml со скилами
  (скилы уже подключены через skill-filesystem.customSkillDirs).

## Плагины и апстрим харнесса

- **Upstream на GitHub**: `deepseek-ai/deepseek-harness` (не «dsh» — поиск по
  короткому имени даёт 404). Официальные плагины ставятся из npm
  (scope `@deepseek-ai/dsh-*`); локально установлен rc.7, сверять релизы с
  upstream. Сообщество: Discord `discord.gg/Ycq5dCaS4`, GitHub Discussions.
- Все официальные плагины уже стоят локально; сторонние опции (npm, не GitHub):
  `ai-sdk-provider-claude-code`, `ai-sdk-provider-codex-cli`,
  `ai-sdk-provider-opencode-sdk` — подключение внешних агентов (Claude Code,
  codex, opencode) как субагентов через ACP-провайдер.
- **Десктоп-сборка** `RZX00/deepseek-harness-desktop` (Electron поверх того же
  web-профиля): делит `~/.dsh` (настройки/скилы/сессии подхватились бы как есть),
  НО закрытие окна убивает харнесс → ломает фоновый API-диспатч. **Решение:
  остались на headless-схеме** + ярлык «DeepSeek Harness» (`open-harness.ps1`).

## Скилы

Каталог харнесса строится из `agent-skills\.opencode\skills\` (22 скила, live-watch —
правки/добавления подхватываются без рестарта). Требования к frontmatter
`SKILL.md`: `name` (kebab-case) и `description` обязательны; **нельзя** писать
`description: <текст с ": ">` — yaml-парсер падает и скил отбрасывается. Описание
оборачивать в одинарные кавычки или использовать `description: >`.