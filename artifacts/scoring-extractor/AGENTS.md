# AGENTS.md

Отвечай по-русски, если пользователь явно не просит другой язык.

## Граница проекта

`C:\Users\illki\Desktop\projects\scoring\artifacts\scoring-extractor` — artifact snapshot тестового extractor-сервиса внутри проекта `scoring`.

Не смешивать его runtime, storage и доменную логику с основным backend `scoring/`.

`scoring-extractor` является заменяемым downstream-сервисом:

- владеет распаковкой архивов;
- владеет inventory исходных файлов;
- владеет извлечением доступного текста;
- владеет нормализацией документов в MD;
- владеет manifest/report/fallback artifacts;
- возвращает результат через HTTP API.

`scoring-extractor` не является бизнес-анализатором, не заполняет карточку как primary responsibility и не принимает решений. Legacy `recordPatch` допустим только как временный compatibility layer для текущего upload-сценария.

`scoring/` должен обращаться сюда только через API-контракт.
