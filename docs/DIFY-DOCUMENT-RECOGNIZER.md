# Dify Document Recognizer Runbook

## Назначение

Этот runbook описывает первый рабочий контур Dify-распознавания для `scoring`.

Контур намеренно backend-first:

1. `scoring` извлекает документы в Markdown/json.
2. Backend собирает безопасный payload без document links, локальных путей и секретов.
3. Dify получает один JSON input `scoring_payload`.
4. Dify возвращает output `result` со строгим JSON contract.
5. Backend валидирует result и применяет только разрешенный patch к карточке.

## Dify Workflow

Создать Workflow app в Dify и опубликовать его.

Минимальная схема canvas:

```text
User Input -> Validation / Prep
  ├─ LLM Tender Info
  └─ LLM Selection Criteria
       ↓
Final Merge JSON -> Output result
```

### 1. User Input

Добавить JSON input variable:

```text
scoring_payload
```

Ожидаемый верхний shape:

```json
{
  "context": {
    "contractVersion": "dify-ai-pass.v1",
    "language": "ru",
    "recordId": "record-id",
    "jobId": "job-id"
  },
  "record": {},
  "selectionCriteriaRows": [],
  "documents": [],
  "instructions": {}
}
```

### 2. Validation / Prep

Проверить до LLM-анализа:

- `context.contractVersion` равен `dify-ai-pass.v1`;
- `record` является объектом;
- `documents` является массивом;
- хотя бы один документ содержит `markdown` или непустой `jsonArtifacts`.

Если проверка не прошла, workflow все равно должен вернуть валидный `result`, например:

```json
{
  "recordPatch": {},
  "selectionCriteriaRows": [],
  "documentFindings": [],
  "warnings": ["dify_canvas_document_content_missing"],
  "metadata": {
    "canvas": "dify-document-recognizer",
    "validationStatus": "failed"
  }
}
```

### 3. LLM Extraction

На текущем этапе Dify workflow делится только на два блока:

- `tenderInfo` - общая информация по тендеру, возвращает только `recordPatch`;
- `selectionCriteria` - критерии выбора, возвращает только `selectionCriteriaRows`.

`preassessment`, `riskRows` и предварительная оценка сейчас не используются.

Оба LLM-узла должны требовать:

- отвечать только JSON contract;
- обязательно читать и выполнять `scoring_payload.instructions`;
- извлекать значения только из `scoring_payload.documents[].markdown` и `jsonArtifacts`;
- не использовать ссылки, пути, URLs или имена файлов как достаточное доказательство бизнес-значений;
- не добавлять значение, если нет подтверждения в документах;
- добавлять отдельный `documentFindings` для каждого значимого значения.

Для моделей семейства `gpt-5`/`gpt-5-nano` в LiteLLM выставить `temperature = 1`.
`temperature = 0.7` приводит к ошибке `UnsupportedParamsError` до выполнения workflow.

#### LLM Tender Info

```text
Ты извлекаешь общую информацию по тендеру из scoring_payload для проекта scoring.

Работай только с блоком tenderInfo.
Верни только JSON без markdown-блока и без пояснений.

Обязательно следуй scoring_payload.instructions:
- expectedOutput;
- allowedPatchFields;
- disabledPatchFields;
- extractionBlocks;
- strictRules;
- extractionTargets.recordPatch.

Используй только scoring_payload.documents[].markdown и scoring_payload.documents[].jsonArtifacts.
Не используй href, path, URL, локальные пути и имена файлов как доказательство бизнес-значений.
Если значение не найдено в документах, не добавляй его в recordPatch.

Ищи и заполняй максимум подтвержденных полей recordPatch:
customer, projectTitle, title, shortTitle, deadlineAt, nmc, stage, purchaseBy,
platformPayment, applicationSecurity, contractSecurity, overallExecutionTerm,
contractTerm, retrade, antiDumpingMeasures, creative, notes, summary.

Перед финальным ответом проверь каждое поле из instructions.extractionTargets.recordPatch.
Если поле подтверждено документом, включи его в recordPatch. Не ограничивайся 2-3 полями.

Для каждого включенного поля recordPatch добавь отдельный documentFindings:
field должен быть равен имени поля recordPatch, documentId должен указывать документ,
quote/excerpt должен содержать короткую цитату.

Не возвращай selectionCriteriaRows.
Не возвращай preassessment, riskRows, riskBaseUrl, summaryDecision, alexanderDecision или estimateFileUrl.

Форма ответа:
{
  "recordPatch": {},
  "documentFindings": [],
  "warnings": [],
  "metadata": {
    "block": "tenderInfo"
  }
}
```

#### LLM Selection Criteria

```text
Ты извлекаешь критерии выбора из scoring_payload для проекта scoring.

Работай только с блоком selectionCriteria.
Верни только JSON без markdown-блока и без пояснений.

Обязательно следуй scoring_payload.instructions:
- expectedOutput;
- strictRules;
- extractionBlocks;
- extractionTargets.selectionCriteriaRows;
- selectionCriteriaEnums.

Используй только scoring_payload.documents[].markdown и scoring_payload.documents[].jsonArtifacts.
Не используй href, path, URL, локальные пути и имена файлов как доказательство бизнес-значений.

Найди все критерии оценки, веса критериев и требования, влияющие на выбор победителя.
Каждая строка selectionCriteriaRows должна иметь:
- group: price | nonPrice | requirement;
- title;
- weightPercent или null;
- coverageStatus: full | partial | none;
- coverageNote;
- sourceExcerpt.

Для каждой строки selectionCriteriaRows добавь отдельный documentFindings:
field='selectionCriteriaRows', target='selectionCriteriaRows', documentId и quote/excerpt по этой строке.

Не возвращай recordPatch.
Не возвращай preassessment, riskRows, riskBaseUrl, summaryDecision, alexanderDecision или estimateFileUrl.

Форма ответа:
{
  "selectionCriteriaRows": [],
  "documentFindings": [],
  "warnings": [],
  "metadata": {
    "block": "selectionCriteria"
  }
}
```

#### Final Merge JSON

Финальный code/template node объединяет два ответа:

- `tenderInfo.recordPatch` -> `result.recordPatch`;
- `selectionCriteria.selectionCriteriaRows` -> `result.selectionCriteriaRows`;
- оба массива `documentFindings` объединяются;
- warnings объединяются;
- metadata получает `blocks: ["tenderInfo", "selectionCriteria"]`.

Держи evidence компактным: короткая цитата, короткий note, без длинных абзацев.

Разрешенный result shape:

```json
{
  "recordPatch": {
    "customer": "ООО Пример",
    "nmc": "1000000"
  },
  "selectionCriteriaRows": [
    {
      "group": "price",
      "title": "Цена договора",
      "weightPercent": 60,
      "coverageStatus": "full",
      "coverageNote": "Критерий цены найден в документации",
      "sourceExcerpt": "Цена договора - 60%"
    }
  ],
  "documentFindings": [
    {
      "field": "customer",
      "documentId": "doc-001",
      "quote": "Заказчик: ООО Пример",
      "note": "Найдено в шапке документа"
    }
  ],
  "warnings": [],
  "metadata": {
    "canvas": "dify-document-recognizer",
    "model": "dify-workflow"
  }
}
```

### 4. Final JSON

Финальный output variable должен называться:

```text
result
```

`result` может быть JSON object или JSON string. Prose вокруг JSON не нужен.

В двухблочном canvas `result` должен ссылаться на output финального merge node.
Если временно используется один LLM node без merge, выбирай `LLM.text`.
Не выбирай `reasoning_content`, `usage` или другие служебные поля модели как значение `result`.

## Backend Env

Настраивать только на backend/server side:

```text
SCORING_DIFY_API_BASE_URL=https://<dify-host>/v1
SCORING_DIFY_API_KEY=<secret>
SCORING_DIFY_API_PATH=/workflows/run
SCORING_DIFY_PAYLOAD_INPUT_KEY=scoring_payload
SCORING_DIFY_RESPONSE_MODE=streaming
SCORING_DIFY_TIMEOUT_MS=240000
```

Для широкого распознавания с большим Markdown и evidence рекомендуется `streaming`: backend читает SSE до финального `workflow_finished` и забирает `data.outputs.result`.
`blocking` допустим для коротких smoke/workflow, но может обрываться внешним proxy на долгих LLM-запусках.

Локально backend автоматически читает корневой `.env.local` при запуске через `npm run dev:backend`, `npm run dev` или `launch-local.ps1`. В репозитории есть только безопасный шаблон `.env.local.example`; реальные значения должны оставаться в `.env.local`, который игнорируется git.

Для production/Dokploy секреты вводятся через secret/env UI. Не сохранять реальные значения в git, Markdown, screenshots или terminal logs.

## Local Mocked Checks

Перед live-проверкой:

```powershell
npm run test:dify
npm run smoke:dify
npm run build
npm run openspec:validate
```

`smoke:dify` поднимает mock Dify server и проверяет:

- provider `dify` отображается как `configured`;
- backend отправляет запрос на `/workflows/run`;
- `Authorization` уходит только к Dify mock;
- input variable называется `scoring_payload`;
- Dify output `result` применяется к карточке;
- job result не содержит API key, полный Markdown, localhost URL или локальные paths.

## Live Dify Workflow Check

После заполнения `.env.local` или production env можно проверить сам опубликованный Dify workflow без запуска карточки:

```powershell
npm run check:dify-live
```

Проверка отправляет небольшой безопасный `scoring_payload` напрямую в Dify `/workflows/run`, ожидает output `result`, валидирует backend contract и печатает только безопасную сводку:

- `workflowRunId`;
- список полей `recordPatch`;
- количество `selectionCriteriaRows`;
- количество `documentFindings`;
- warnings.

Скрипт не печатает API key и не сохраняет полный request/response.

Если `check:dify-live` падает с сообщением `Dify result should include expected smoke recordPatch fields`,
значит опубликованный canvas принимает payload, но LLM/final output не извлекает поля карточки. Проверь в Dify UI:

- Start input называется ровно `scoring_payload` и имеет тип JSON object;
- User message в LLM содержит переменную `scoring_payload`;
- оба LLM node содержат соответствующий prompt из раздела `LLM Extraction` и явно требуют следовать `scoring_payload.instructions`;
- Output node `result` ссылается на финальный merge output, а не на `reasoning_content`;
- workflow опубликован после изменений.

## Live Smoke

После публикации workflow и настройки env:

1. Запустить backend с Dify env.
2. Открыть запись, где уже есть normalized Markdown/json документы.
3. Создать или выбрать analysis job с `providerId: "dify"`.
4. Запустить `POST /api/analysis-jobs/:jobId/run-dify-adapter` через UI или backend API.
5. Проверить:
   - job стал `completed`;
   - карточка или `selectionCriteriaRows` обновились;
   - `documentFindings` содержит `documentId` и цитату;
   - warnings понятны и не скрывают invalid output;
   - safe diagnostics не содержат `SCORING_DIFY_API_KEY`, `href`, `path`, `localhost`, `127.0.0.1` или Windows absolute paths.

Если live smoke падает из-за output shape, сначала исправить Dify final node. Backend normalizer менять только если новый shape действительно совместим с OpenSpec contract.

## Rollback

Удалить или отключить `SCORING_DIFY_API_BASE_URL` и `SCORING_DIFY_API_KEY` в backend env. Provider вернется в `not_configured`, а существующий extractor/local adapter останется доступен.
