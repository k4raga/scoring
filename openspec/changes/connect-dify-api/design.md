## Context

В scoring уже есть несколько частей, на которые можно опереться:

- карточка проекта и нормализация patch через `backend/src/record-patch.js`;
- модель строк критериев выбора через `selectionCriteriaRows`;
- `analysis-jobs` как backend-контур для запуска анализа, хранения статуса, результата, ошибок и истории;
- extractor-адаптер, который уже возвращает `result`, `recordPatch`, `documents`, `artifacts`, `warnings`;
- document wiki/MD layer, где исходные документы, normalized Markdown и json-артефакты разделены по смыслу.

Dify должен встать в этот контур как внешний `AI-pass`: backend собирает входной пакет из карточки и документации, вызывает Dify API, валидирует структурированный ответ и сохраняет результат через `analysis-jobs`. Frontend остается потребителем backend API и не знает Dify secret.

По текущей документации Dify workflow API поддерживает запуск опубликованного workflow через backend HTTP API, `Authorization: Bearer ...`, input variables, `response_mode: blocking|streaming`, а outputs workflow возвращаются в `outputs`/`data.outputs`. Для первого implementation pass выбираем blocking mode, чтобы закрепить контракт проще и не вводить SSE/streaming lifecycle.

## Goals / Non-Goals

**Goals:**

- Подключить Dify как backend-only provider для `AI-pass`.
- Передавать в Dify все данные карточки, которые видны в UI и нужны для анализа, кроме document links, href и локальных путей.
- Передавать содержимое документации как Markdown/json payload, а не как ссылки на файлы.
- Получать от Dify структурированный JSON с patch карточки, строками критериев, evidence/findings, warnings и metadata.
- Валидировать Dify response до применения к записи.
- Использовать существующий `analysis-jobs` lifecycle для статуса, результата, ошибок и истории.
- Сохранить тестовый extractor как источник Markdown/json артефактов до полной замены.

**Non-Goals:**

- Не строить сам Dify workflow canvas внутри этого change.
- Не отдавать Dify прямой доступ к базе данных, файловой системе или frontend runtime.
- Не позволять Dify напрямую мутировать scoring-записи без backend-валидации.
- Не отправлять в Dify локальные пути, machine-local URLs, document href и frontend routes как основной источник данных.
- Не заменять документный wiki/MD layer и не переделывать storage-модель документов.
- Не внедрять streaming/SSE в первом pass, если blocking mode покрывает сценарий.
- Не вводить обязательный human-review экран перед применением validated patch в первом pass.

## Decisions

### Decision 1: Dify вызывается только из backend

Backend хранит Dify base URL, API key, app/workflow режим, timeout и response mode в env/secrets. Frontend получает только статус `analysis-jobs` и результат, уже нормализованный backend.

Alternative considered: вызвать Dify из frontend. Это проще для прототипа, но раскрывает API key, усложняет audit/logging и обходит backend-валидацию.

### Decision 2: Dify provider живет в `analysis-jobs`, а не отдельным параллельным контуром

Новый adapter должен быть близок по форме к текущим `external-analysis-client` и `local-analysis-adapter`: run endpoint переводит job в `running`, вызывает внешний сервис, затем сохраняет `completed` или `failed`.

Минимальный API shape:

- создать/использовать `analysisJob` с `providerId: "dify"`;
- запустить `POST /api/analysis-jobs/:jobId/run-dify-adapter`;
- вернуть `{ executed, job, record, adapter }`;
- сохранить raw-safe metadata в job result, но не сохранять секреты и полный request body с чувствительными данными в публичный ответ.

Alternative considered: добавить `POST /api/records/:recordId/dify-analysis`. Это проще для UI, но хуже ложится на существующую историю анализа и повторные запуски.

### Decision 3: Payload строится из данных, а не из ссылок

Dify input получает:

- `record`: все текущие UI-поля карточки, кроме ссылок на документы и внутренних href/path;
- `selectionCriteriaRows`: текущие строки критериев, если они уже есть;
- `documents`: массив нормализованных документов с `documentId`, `title`, `kind`, `sourceFileName`, `markdown`, `jsonArtifacts`, `extractionStatus`;
- `instructions`: краткое описание ожидаемого JSON output и допустимых enum-значений;
- `context`: `recordId`, версия контракта, язык ответа `ru`.

Из payload исключаются:

- `documentsFolderHref`, `googleDocumentsFolderHref`, `requirementsDocumentUrl`, `criteriaDocumentUrl`, `technicalSpecificationUrl` как ссылки;
- `href`, `path`, `sourcePath`, `markdownPath`, `runRoot`, absolute/local paths;
- Dify API key, deployment secrets, Dokploy token.

Alternative considered: отправлять Dify ссылки на документы. Это ломается на закрытых локальных путях, хуже контролируется и не отвечает пользовательскому требованию отдавать md/json в Dify.

### Decision 4: Markdown/json artifacts читаются backend resolver-ами

Backend должен переиспользовать текущие resolver-правила document layer:

- брать normalized Markdown из разрешенных artifact locations;
- брать json artifacts только из разрешенных artifact keys;
- проверять, что path остается внутри storage/project artifact roots;
- ограничивать размер payload и количество документов;
- явно помечать truncated/omitted documents в warnings.

Если Markdown/json отсутствуют, Dify pass должен завершаться controlled failure или warning, а не пытаться передать ссылку вместо содержимого.

Alternative considered: дать Dify доступ к оригинальному архиву. Это переносит extraction responsibility в Dify и делает контракт менее проверяемым.

### Decision 5: Ответ Dify валидируется как строгий contract

Ожидаемый normalized output:

```json
{
  "recordPatch": {},
  "selectionCriteriaRows": [],
  "documentFindings": [],
  "warnings": [],
  "metadata": {}
}
```

`recordPatch` должен проходить allowlist полей, совместимых с `applyRecordPatch`: `customer`, `projectTitle`, `title`, `shortTitle`, `deadlineAt`, `nmc`, `stage`, `purchaseBy`, `platformPayment`, `applicationSecurity`, `contractSecurity`, `overallExecutionTerm`, `contractTerm`, `retrade`, `antiDumpingMeasures`, `creative`, `notes`, `summary`, `selectionCriteriaRows`.

`projectTitle` используется как короткий hero-заголовок карточки: заказчик + 2-3 слова о проекте. Полный предмет закупки остается в `title`, а длинное описание/цель — в `summary`.

Запрещенные patch-поля:

- document link fields;
- `workflow`, `documents`, `documentWiki`, `documentArtifacts`;
- любые неизвестные поля.

`selectionCriteriaRows` нормализуются через существующую модель: `group`, `title`, `weightPercent`, `blockFactor`, `coverageStatus`, `coverageAmount`, `coverageNote`, `sourceExcerpt`, `order`. Dify заполняет документные поля (`group`, `title`, `weightPercent` для ценовых и неценовых критериев с весом, `blockFactor` только для требований без веса, `coverageNote`, `sourceExcerpt`), где `coverageNote` является задачей для тендерного специалиста из документа. `coverageStatus` и `coverageAmount` остаются экспертными полями тендерного специалиста.

Validated patch применяется автоматически через backend contract, как сейчас работает analysis contract. Отдельный human-review шаг не нужен: если результат пользователю не подходит, он может вручную поправить поля карточки и строки критериев в UI.

Alternative considered: сохранить raw Dify output и применять позднее вручную. Это полезно для диагностики, но замедляет основной сценарий и дублирует ручное редактирование, которое уже есть в карточке.

### Decision 6: Evidence обязательно отделяется от patch

Dify может предлагать значения, но каждое значимое значение должно иметь доказательную привязку:

- `field` или `target`;
- `documentId`;
- `quote`/`excerpt`;
- `reason`/`note`;
- optional confidence.

Evidence не заменяет `recordPatch`, а объясняет происхождение результата. Если evidence нет, backend может принять результат как draft только с warning.

Alternative considered: хранить только итоговые поля. Это быстрее, но менеджеру по тендерам важно видеть, из какой части документации взяты выводы.

### Decision 7: Dify integration должна быть заменяемой

Новый adapter не должен знать детали UI-компонентов. Он работает с contract-versioned payload/result, а UI читает уже существующую карточку, criteria block и analysis job.

На уровне providers добавить `dify` в список AI providers с состоянием `configured|not_configured|failed`, чтобы UI мог показать доступность без раскрытия секретов.

Alternative considered: захардкодить Dify как единственный analyzer. Это ускоряет первый запуск, но ломает текущий extractor fallback и усложняет тесты.

### Decision 8: Название Dify app/workflow не является частью продуктового контракта

Имя опубликованного Dify workflow/app в Dify UI не важно для scoring. Backend должен опираться на env/config Dify app/workflow endpoint/key, а не на человекочитаемое название.

Dify canvas будет настраиваться совместно в процессе подключения. OpenSpec фиксирует контракт входа/выхода и безопасность интеграции, но не описывает внутреннюю схему Dify canvas как часть scoring-кода.

Alternative considered: закрепить точное название app/workflow в OpenSpec. Это создало бы хрупкую зависимость от UI-названия в Dify без пользы для runtime.

### Decision 9: В первом pass нет бизнес-лимитов payload, но остаются технические guardrails

Так как сервисом будут пользоваться только сотрудники, отдельные продуктовые лимиты вроде "не больше N документов" не являются требованием первого production pass. При этом backend все равно должен иметь конфигурируемые технические guardrails, чтобы не получить отказ Dify API, таймаут, чрезмерный memory usage или слишком большой persisted diagnostic объект.

Если guardrail сработал, система сохраняет warning о truncation/omission. Значения лимитов должны быть конфигурационными и достаточно высокими для внутреннего сценария, а не UX-ограничением.

Alternative considered: вообще не вводить лимиты. Это проще, но делает production behavior зависимым от внешних лимитов Dify и размера тендерной документации.

### Decision 10: В analysis-jobs не храним полный request/response по умолчанию

По умолчанию `analysis-jobs` хранит:

- normalized result: `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`;
- Dify run metadata: provider, workflow/app id или endpoint alias, response mode, duration, status, token/usage metadata без секретов;
- compact safe payload summary: число документов, размеры, список `documentId`/title/kind, факты truncation/omission;
- compact response diagnostics: raw output type/keys, validation status, error code/message.

Полный sanitized request/response с текстами документов не сохраняется в `analysis-jobs` по умолчанию, потому что это дублирует документацию, раздувает data file и повышает риск хранения чувствительного содержания вне document layer. Для локальной диагностики можно добавить отдельный debug flag, который сохраняет sanitized payload только в контролируемом dev/runtime каталоге и не включается в production.

Alternative considered: хранить полный sanitized request/response всегда. Это удобно для отладки, но плохо масштабируется и делает `analysis-jobs` вторичным хранилищем документов.

## Risks / Trade-offs

- [Risk] Dify вернет prose или невалидный JSON -> Mitigation: strict parser, schema validation, job status `failed`, raw-safe diagnostic metadata без применения patch.
- [Risk] Payload с Markdown будет слишком большим -> Mitigation: конфигурируемые технические guardrails, truncation summary и warning без продуктового UX-лимита для сотрудников.
- [Risk] В Dify случайно уйдут document links/local paths -> Mitigation: отдельный sanitizer для Dify payload и тесты на запрещенные ключи/паттерны.
- [Risk] Dify output изменит поля, которые UI не ожидал -> Mitigation: allowlist patch-полей и запрет unknown fields.
- [Risk] Evidence будет неполным -> Mitigation: принимать как draft с warning, но не скрывать отсутствие evidence.
- [Risk] Production env будет без Dify secrets -> Mitigation: provider status `not_configured`, endpoint возвращает controlled 503/400 без падения приложения.

## Migration Plan

1. Добавить env/config слой для Dify: base URL, API key, app/workflow mode, response mode, timeout.
2. Добавить Dify client с поддержкой workflow blocking call и нормализацией `outputs`.
3. Добавить builder Dify payload из record + Markdown/json artifacts с sanitizer-ом ссылок и путей.
4. Добавить validator/normalizer Dify output.
5. Добавить `providerId: "dify"` и run endpoint через `analysis-jobs`.
6. Сохранять результат через существующий `applyAnalysisJobContractUpdate`, но только после Dify validation; validated patch применять автоматически.
7. Обновить frontend provider/status слой минимально, без прямых Dify вызовов.
8. Добавить tests/smoke: payload sanitizer, response validator, mocked Dify success/failure, criteria normalization, no-secret/no-link checks.
9. Добавить хранение normalized result + compact safe diagnostics без полного request/response по умолчанию.
10. Для production: добавить env в Dokploy, выполнить smoke без вывода секретов в логи.

Rollback: отключить Dify env/provider и оставить текущий extractor/local adapter. Так как Dify не меняет storage напрямую и не заменяет document layer, rollback не требует миграции данных.

## Open Questions

Нет открытых вопросов после уточнения 2026-05-18:

- название Dify workflow/app не является runtime-контрактом, canvas настраивается совместно;
- отдельный human-review шаг не нужен, validated patch применяется автоматически;
- продуктовые payload-лимиты для сотрудников не задаются, остаются только конфигурируемые технические guardrails;
- полный sanitized request/response не хранится в `analysis-jobs` по умолчанию, сохраняются normalized result, metadata и compact safe diagnostics.
