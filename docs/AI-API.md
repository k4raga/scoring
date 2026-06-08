# AI API

## Назначение

AI-слой в `scoring/` должен быть отдельным API-контуром, а не жёстко вшитой логикой UI.

Цель слоя:

- принимать архив с документами;
- вызывать выбранного AI-провайдера анализа;
- возвращать структурированные поля карточки;
- возвращать provenance по каждому полю: из какого источника, какого документа и с какой страницы взято значение;
- позволять позже переключить execution-provider с `codex-local` на `TFI` без перелома основного backend API.

## Принцип разделения

Нужно различать два API:

1. Product API
   Отвечает за проекты, реестр, деталки, сохранение и удаление.

2. AI API
   Отвечает только за анализ входящего пакета документов и возврат структуры данных с evidence.

UI не должен знать, как именно работает `Codex`, `TFI` или `Dify`.
UI должен работать только с результатом AI API.

## Текущие endpoint'ы

### `GET /api/ai/providers`

Возвращает список доступных и планируемых провайдеров анализа.

Провайдер `dify` возвращается со статусом:

- `configured` — backend видит Dify base URL и API key;
- `not_configured` — Dify env не задан;
- `failed` — зарезервировано для будущей диагностики конфигурации.

Ответ не содержит API key, полный Dify URL с секретами или другие credentials.

### `POST /api/ai/analyze-archive`

`multipart/form-data`

Поля:

- `archive` — обязательный архив;
- `providerId` — опциональный id провайдера, сейчас по умолчанию `codex-local`;
- `title` — опциональный hint;
- `sourceUrl` — опциональный hint;
- `etpUrl` — опциональный hint.

## Целевой response schema

```json
{
  "analysisId": "uuid",
  "status": "completed",
  "provider": {
    "id": "codex-local",
    "label": "Codex Local",
    "status": "active",
    "transport": "local",
    "supportsPageEvidence": false,
    "supportsDocumentExtraction": false
  },
  "archive": {
    "name": "91648071_2026-04-16_Razrabotka-mnogostranichnogo-sajta.zip",
    "sizeBytes": 123456
  },
  "documents": [
    {
      "id": "archive",
      "name": "91648071_2026-04-16_Razrabotka-mnogostranichnogo-sajta.zip",
      "kind": "zip",
      "pageCount": null
    }
  ],
  "fields": {
    "title": {
      "value": "Разработка многостраничного сайта",
      "status": "filled",
      "confidence": 0.55,
      "evidence": [
        {
          "sourceType": "archive_filename",
          "documentId": "archive",
          "documentName": "91648071_2026-04-16_Razrabotka-mnogostranichnogo-sajta.zip",
          "page": null,
          "quote": "91648071_2026-04-16_Razrabotka-mnogostranichnogo-sajta.zip",
          "note": "Название извлечено из имени архива."
        }
      ]
    }
  },
  "recordPatch": {
    "title": "Разработка многостраничного сайта",
    "shortTitle": "Разработка многостраничного сайта",
    "publishedAt": "2026-04-16",
    "sourceUrl": "",
    "etpUrl": ""
  },
  "warnings": [
    "content_extraction_not_enabled",
    "page_level_provenance_not_available_for_codex_local_yet"
  ]
}
```

### `POST /api/analysis-jobs/:jobId/run-dify-adapter`

Запускает Dify `AI-pass` для существующего analysis job, привязанного к записи.

Требования:

- `job.providerId` должен быть `dify`;
- запись должна существовать;
- backend должен иметь Dify env;
- frontend вызывает только этот scoring endpoint, а не Dify API напрямую.

Backend формирует Dify payload из:

- UI-полей карточки, кроме ссылок на документы;
- текущих `selectionCriteriaRows`;
- содержимого normalized Markdown;
- полезных JSON-артефактов extractor/document layer.

Backend не отправляет в Dify как primary input:

- `documentsFolderHref`;
- `googleDocumentsFolderHref`;
- `requirementsDocumentUrl`;
- `criteriaDocumentUrl`;
- `technicalSpecificationUrl`;
- artifact `href`, `path`, `sourcePath`, `markdownPath`, `runRoot`;
- secrets, tokens и deployment credentials.

Ожидаемый Dify result:

```json
{
  "recordPatch": {
    "customer": "ООО Пример",
    "projectTitle": "Пример техподдержка",
    "title": "Полный предмет закупки из документации"
  },
  "selectionCriteriaRows": [
    {
      "group": "price",
      "title": "Цена договора",
      "weightPercent": 60,
      "blockFactor": "",
      "coverageNote": "Подготовить ценовое предложение по критерию цены договора",
      "sourceExcerpt": "Цена - 60%"
    },
    {
      "group": "requirement",
      "title": "Опыт",
      "weightPercent": null,
      "blockFactor": "blockFactor",
      "coverageNote": "Подтвердить опыт выполнения сопоставимых работ",
      "sourceExcerpt": "Наличие не менее 2 лет опыта..."
    }
  ],
  "documentFindings": [
    {
      "field": "customer",
      "documentId": "doc-1",
      "quote": "ООО Пример",
      "note": "Найдено в документации"
    }
  ],
  "warnings": [],
  "metadata": {
    "model": "dify-workflow"
  }
}
```

Validated patch применяется автоматически через backend record patch contract. Отдельный human-review шаг не нужен: пользователь может вручную поправить поля карточки после AI-pass.

В `analysis-jobs` по умолчанию сохраняются normalized result, metadata, warnings и компактная безопасная диагностика. Полный sanitized request/response с текстами документов не сохраняется, чтобы не превращать jobs file во вторичное хранилище документов.

## Что считается provenance

Для каждого поля нужен массив `evidence[]`.

Минимальный состав evidence:

- `sourceType`
- `documentId`
- `documentName`
- `page`
- `quote`
- `note`

Допустимые `sourceType`:

- `request_payload`
- `archive_filename`
- `document_text`
- `ocr`
- `manual_override`

## Текущее ограничение

Текущий провайдер `codex-local` пока не делает реальное извлечение содержимого документов.

Сейчас он умеет только:

- взять метаданные из имени архива;
- принять hint-поля из запроса;
- вернуть их в едином AI response schema.

Он пока не умеет:

- распаковать архив;
- прочитать `pdf/docx/xlsx`;
- вернуть page-level evidence;
- собрать quote из текста документа.

## Следующий обязательный шаг

Чтобы AI-слой стал реально полезным, следующий цикл должен добавить pipeline:

1. archive inventory
2. extract text / OCR
3. normalize document chunks
4. field extraction
5. provenance with document + page + quote
6. mapping в `recordPatch`

## Переключение провайдера

Product API не должен зависеть от конкретного провайдера анализа.

Нужна модель:

- `providerId=codex-local` для локального контура;
- `providerId=tfi` для будущего remote execution;
- `providerId=dify` для backend-only Dify `AI-pass`;
- одинаковый response schema сверху;
- отличаться должны только runtime и полнота extraction/provenance.

## Dify env

Локально и в production Dify настраивается только на backend:

```text
SCORING_DIFY_API_BASE_URL=https://<dify-host>/v1
SCORING_DIFY_API_KEY=<secret>
SCORING_DIFY_API_PATH=/workflows/run
SCORING_DIFY_PAYLOAD_INPUT_KEY=scoring_payload
SCORING_DIFY_RESPONSE_MODE=blocking
SCORING_DIFY_TIMEOUT_MS=95000
SCORING_DIFY_MAX_DOCUMENTS=40
SCORING_DIFY_MAX_DOCUMENT_CHARS=30000
SCORING_DIFY_MAX_JSON_ARTIFACT_CHARS=10000
SCORING_DIFY_MAX_PAYLOAD_CHARS=220000
```

`SCORING_DIFY_DEBUG_PAYLOAD=1` разрешен только для локальной диагностики. Он сохраняет sanitized payload в runtime/debug каталог и не должен включаться в production по умолчанию.
