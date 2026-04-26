# scoring-analysis

Тестовая подсистема анализа документов для проекта `scoring`.

Этот каталог хранится в `scoring.git` как artifact snapshot, чтобы тестовая подсистема не потерялась. Runtime-граница остается прежней: основной `scoring` не импортирует этот код, а обращается к analysis-сервису только через HTTP API.

Граница ответственности:

- принимает ссылку или локальный путь на архив;
- распаковывает архив в свой `runs/` контур;
- нормализует документы в `normalized/*.md`;
- извлекает текст из `.docx`, текстовых файлов и базовых `.xlsx` без внешних зависимостей;
- собирает `normalized/document-index.json`;
- возвращает staged result для `scoring` через HTTP API.

`scoring-analysis` не является частью runtime `scoring` и может быть заменен другой системой при сохранении API-контракта.

## API

`GET /api/health`

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
  "stages": [],
  "result": {
    "analysisMetadata": {},
    "fields": {},
    "recordPatch": {}
  }
}
```

## Local Run

```powershell
python server.py
```

Default port: `4200`.
