# scoring-extractor

Тестовый extractor-сервис для проекта `scoring`.

Этот каталог хранится в `scoring.git` как artifact snapshot, чтобы тестовый контур извлечения документов не потерялся. Runtime-граница остается прежней: основной `scoring` не импортирует этот код, а обращается к extractor-сервису только через HTTP API.

Граница ответственности:

- принимает ссылку или локальный путь на архив;
- распаковывает архив в свой `runs/` контур;
- строит inventory исходных файлов;
- извлекает доступный текст из `.docx`, текстовых файлов, PDF с текстовым слоем и базовых `.xlsx`;
- нормализует извлеченный текст в `normalized/*.md`;
- собирает `manifest.json`, `documents.json` и `extraction-report.json`;
- собирает легкий производный static HTML слой в `knowledge/`;
- явно возвращает fallback descriptors для файлов, которые требуют OCR, vision или ручной проверки.

`scoring-extractor` не является бизнес-анализатором и не должен принимать решения по карточке проекта. `recordPatch` пока возвращается только как legacy compatibility output для текущего upload-сценария `scoring`.

## API

`GET /api/health`

`POST /api/extract`

Legacy alias на переходный период:

`POST /api/analyze`

Payload:

```json
{
  "recordId": "2026-04-25-тест",
  "archivePath": "C:/path/to/archive.zip",
  "archiveHref": "/assets/storage/...",
  "hints": {
    "title": "тест"
  }
}
```

Response:

```json
{
  "ok": true,
  "runId": "...",
  "input": {
    "recordId": "2026-04-25-тест",
    "archiveName": "archive.zip"
  },
  "stages": [
    { "id": "unpack", "status": "completed" },
    { "id": "inventory", "status": "completed" },
    { "id": "extract", "status": "completed" },
    { "id": "normalize", "status": "completed" }
  ],
  "artifacts": {
    "inventoryJson": "http://127.0.0.1:4200/artifacts/.../inventory.json",
    "documentsJson": "http://127.0.0.1:4200/artifacts/.../documents.json",
    "manifestJson": "http://127.0.0.1:4200/artifacts/.../manifest.json",
    "extractionReportJson": "http://127.0.0.1:4200/artifacts/.../extraction-report.json",
    "knowledgeIndexHtml": "http://127.0.0.1:4200/artifacts/.../knowledge/index.html"
  },
  "documents": [],
  "extraction": {},
  "knowledge": {
    "renderer": "static_html_fallback",
    "futureRendererCandidate": "Quartz",
    "indexHtmlUrl": "http://127.0.0.1:4200/artifacts/.../knowledge/index.html"
  },
  "result": {
    "extraction": {},
    "recordPatch": {}
  }
}
```

## Static Knowledge HTML

Каждый run дополнительно получает производный HTML-слой:

```text
runs/<runId>/knowledge/index.html
runs/<runId>/knowledge/doc-001.html
runs/<runId>/knowledge/doc-002.html
```

Текущая реализация — минимальный `static_html_fallback` renderer без Quartz runtime и без vendor-файлов. Он нужен как foundation: страницы можно открыть как обычные static artifacts, а источник истины остается в original files, `normalized/*.md`, `manifest.json` и `documents.json`.

На странице документа показываются:

- source file name/type/size/status;
- link для открытия оригинала из `runs/extracted`;
- download link для оригинала;
- download link на normalized Markdown, если он был создан;
- fallback state и suggested pipeline для документов без надежного text extraction.

В `artifacts`, `manifest`, `extraction`, `result` и каждом document descriptor добавляются ссылки:

```json
{
  "artifacts": {
    "knowledgeIndexHtml": "http://127.0.0.1:4200/artifacts/<runId>/knowledge/index.html"
  },
  "documents": [
    {
      "documentId": "doc-001",
      "sourceFileName": "TZ.docx",
      "sourceFileUrl": "http://127.0.0.1:4200/artifacts/<runId>/extracted/TZ.docx",
      "sourceMimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "sourceSizeBytes": 123456,
      "normalizedMarkdownUrl": "http://127.0.0.1:4200/artifacts/<runId>/normalized/doc-001.md",
      "generatedHtmlUrl": "http://127.0.0.1:4200/artifacts/<runId>/knowledge/doc-001.html"
    }
  ]
}
```

Quartz остается future renderer candidate для полноценной knowledge base с поиском, backlinks и graph view. Этот слой намеренно не называется Quartz build, потому что сейчас он не запускает Quartz и не добавляет тяжелый runtime в основной проект.

## Local Run

```powershell
python server.py
```

Default port: `4200`.

Primary env:

```text
SCORING_EXTRACTOR_HOST
SCORING_EXTRACTOR_PORT
```

Legacy env fallback:

```text
SCORING_ANALYSIS_HOST
SCORING_ANALYSIS_PORT
```
