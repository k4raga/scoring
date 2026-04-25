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

UI не должен знать, как именно работает `Codex` или `TFI`.
UI должен работать только с результатом AI API.

## Текущие endpoint'ы

### `GET /api/ai/providers`

Возвращает список доступных и планируемых провайдеров анализа.

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
- одинаковый response schema сверху;
- отличаться должны только runtime и полнота extraction/provenance.
