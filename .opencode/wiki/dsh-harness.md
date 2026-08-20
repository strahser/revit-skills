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

# 2) только синк скилов (харнесс live-watch'ит папку, рестарт не нужен)
powershell -ExecutionPolicy Bypass -File E:\ПлагиныРевит\DSH\sync-skills.ps1
```

- Скрипты идемпотентны: каждый сервис стартует только если его порт свободен.
- Прокси: `E:\ПлагиныРевит\DSH\opencode-proxy\opencode_proxy.py` (порт 8787, лог `proxy.log`).
- Харнесс: `node E:\ПлагиныРевит\DSH\node_modules\@deepseek-ai\dsh\lib\bin.js --profile web` (порт 3080).
- Конфиг: `C:\Users\Strakhov\.dsh\settings.yaml` (провайдеры/модели), патчи профиля web — `C:\Users\Strakhov\.dsh\profiles\web\cordis.patch.yml`.

## Модели

| Провайдер (UI) | Модели |
|---|---|
| OpenCode Free | `opencode/deepseek-v4-flash-free`, `opencode/big-pickle` |
| OpenCode GO | `opencode-go/deepseek-v4-flash` (платный шлюз) |

Все идут через прокси :8787, который вызывает `opencode run --model <model>`.
Известная проблема: у opencode-go долгий первый токен (2–5 мин), харнесс таймаутит
и ретраит — ретраи порождают дублирующиеся `opencode run`.

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
`session.list`, `llm.providers`. Сессии хранятся в `C:\Users\Strakhov\.dsh\sessions\`.

## Скилы

Каталог харнесса строится из `agent-skills\.opencode\skills\` (22 скила, live-watch —
правки/добавления подхватываются без рестарта). Требования к frontmatter
`SKILL.md`: `name` (kebab-case) и `description` обязательны; **нельзя** писать
`description: <текст с ": ">` — yaml-парсер падает и скил отбрасывается. Описание
оборачивать в одинарные кавычки или использовать `description: >`.