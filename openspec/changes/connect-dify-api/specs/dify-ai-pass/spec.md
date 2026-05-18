## ADDED Requirements

### Requirement: Backend-only Dify integration
Система SHALL вызывать Dify API только из backend-контура scoring и SHALL NOT раскрывать Dify API key во frontend, клиентских bundles, публичных API-ответах или логах.

#### Scenario: Пользователь запускает AI-pass из UI
- **WHEN** пользователь инициирует анализ через Dify из scoring UI
- **THEN** frontend SHALL обратиться только к backend scoring API, а не к Dify API напрямую

#### Scenario: Backend вызывает Dify
- **WHEN** backend выполняет Dify pass
- **THEN** backend SHALL использовать серверную конфигурацию Dify и Authorization secret без передачи секрета в ответ клиенту

#### Scenario: Dify не настроен
- **WHEN** Dify API key или base URL отсутствует
- **THEN** система SHALL вернуть контролируемый статус недоступности provider, не выполняя внешний запрос

### Requirement: Dify payload without document links
Система SHALL формировать Dify input из данных карточки и содержимого документации, исключая document links, href, локальные пути и machine-local URLs как primary input.

#### Scenario: Backend собирает payload по карточке проекта
- **WHEN** backend формирует Dify payload для scoring-записи
- **THEN** payload SHALL содержать все релевантные UI-поля карточки, кроме ссылок на документы и внутренних путей

#### Scenario: Запись содержит ссылки на документы
- **WHEN** карточка содержит `documentsFolderHref`, `googleDocumentsFolderHref`, `requirementsDocumentUrl`, `criteriaDocumentUrl` или `technicalSpecificationUrl`
- **THEN** Dify payload SHALL NOT передавать эти значения как входные данные анализа

#### Scenario: Document artifact содержит технические пути
- **WHEN** artifact содержит `href`, `path`, `sourcePath`, `markdownPath`, `runRoot` или absolute path
- **THEN** Dify payload SHALL удалить эти поля или заменить их безопасной metadata без пути

### Requirement: Document content as Markdown or JSON
Система SHALL передавать Dify содержимое документации в виде Markdown и/или JSON artifacts, а не ссылок на документы.

#### Scenario: У документа есть normalized Markdown
- **WHEN** scoring-запись содержит normalized Markdown для документа
- **THEN** Dify payload SHALL включить текст Markdown вместе с `documentId`, title, type/kind и source metadata

#### Scenario: У документа есть JSON artifact
- **WHEN** scoring-запись содержит JSON artifact, полезный для анализа
- **THEN** Dify payload SHALL включить этот artifact как структурированный JSON или JSON string с привязкой к `documentId`

#### Scenario: У документа нет извлеченного содержимого
- **WHEN** для документа нет доступного Markdown или JSON содержимого
- **THEN** Dify pass SHALL зафиксировать warning или controlled failure, а не отправлять только ссылку на документ

### Requirement: Dify response contract
Система SHALL принимать от Dify только структурированный JSON-результат с явными секциями результата.

#### Scenario: Dify возвращает успешный результат
- **WHEN** Dify workflow завершился успешно
- **THEN** backend SHALL нормализовать ответ в структуру `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`

#### Scenario: Dify возвращает workflow outputs
- **WHEN** Dify API возвращает результат внутри workflow outputs
- **THEN** backend SHALL извлечь из outputs согласованную JSON-структуру, а не применять весь raw response как patch

#### Scenario: Dify возвращает prose вместо JSON
- **WHEN** Dify response не содержит валидного JSON contract
- **THEN** система SHALL пометить analysis job как failed или draft-invalid и SHALL NOT применять изменения к записи

### Requirement: Validated record patch
Система SHALL применять к scoring-записи только те поля Dify `recordPatch`, которые входят в разрешенный backend allowlist и проходят нормализацию.

#### Scenario: Dify предлагает разрешенное поле
- **WHEN** Dify `recordPatch` содержит разрешенное поле карточки
- **THEN** backend SHALL нормализовать значение и применить его через существующий record patch contract

#### Scenario: Dify предлагает запрещенное поле
- **WHEN** Dify `recordPatch` содержит document link field, `workflow`, `documents`, `documentWiki`, `documentArtifacts` или неизвестное поле
- **THEN** backend SHALL отклонить это поле и SHALL NOT применять его к записи

#### Scenario: Dify предлагает строки критериев
- **WHEN** Dify result содержит `selectionCriteriaRows`
- **THEN** backend SHALL нормализовать строки через модель selection criteria и SHALL требовать обязательный `coverageStatus`

#### Scenario: Dify patch прошел валидацию
- **WHEN** Dify result прошел backend validation
- **THEN** система SHALL автоматически применить validated patch к записи без отдельного обязательного human-review шага

#### Scenario: Пользователю не нравится примененный результат
- **WHEN** validated patch уже применен к записи
- **THEN** пользователь SHALL иметь возможность вручную исправить поля карточки и строки критериев в UI

### Requirement: Evidence for extracted values
Система SHALL сохранять доказательную привязку Dify findings к документам отдельно от применяемого patch.

#### Scenario: Dify заполняет поле карточки
- **WHEN** Dify предлагает значение для поля карточки
- **THEN** result SHALL содержать evidence или finding с field/target, `documentId`, excerpt/quote и пояснением источника

#### Scenario: Evidence отсутствует
- **WHEN** Dify result содержит значение без evidence
- **THEN** система SHALL сохранить warning о неподтвержденном значении и SHALL NOT скрывать это состояние от analysis result

#### Scenario: Пользователь проверяет результат
- **WHEN** пользователь смотрит результат AI-pass
- **THEN** система SHALL позволять понять, из какого документа и какой выдержки взято предложенное значение

### Requirement: Analysis job lifecycle for Dify pass
Система SHALL выполнять Dify pass через существующий lifecycle `analysis-jobs`.

#### Scenario: Dify pass запускается
- **WHEN** backend начинает Dify pass для scoring-записи
- **THEN** соответствующий analysis job SHALL перейти в `running` и сохранить metadata запуска без секретов

#### Scenario: Dify pass завершился успешно
- **WHEN** Dify pass вернул валидный результат
- **THEN** analysis job SHALL перейти в `completed` и сохранить normalized result, warnings и metadata

#### Scenario: Dify pass завершился ошибкой
- **WHEN** Dify API недоступен, вернул ошибку или response не прошел validation
- **THEN** analysis job SHALL перейти в `failed` с контролируемым error code/message

### Requirement: Replaceable AI provider
Система SHALL регистрировать Dify как заменяемый AI provider, не удаляя текущий тестовый extractor/local adapter на первом этапе.

#### Scenario: Backend перечисляет AI providers
- **WHEN** frontend запрашивает доступные AI providers
- **THEN** backend SHALL возвращать Dify provider со статусом доступности без раскрытия секретов

#### Scenario: Тестовый extractor остается доступен
- **WHEN** Dify provider не настроен или временно недоступен
- **THEN** текущий extractor/local adapter SHALL оставаться доступным в рамках своего существующего сценария

#### Scenario: Dify заменяет тестовый extractor позже
- **WHEN** команда решит отключить тестовый extractor
- **THEN** scoring SHALL использовать тот же normalized analysis/record patch contract без изменения frontend-модели карточки

### Requirement: Dify payload and result safety
Система SHALL защищать Dify payload и result от утечек секретов, локальных путей и чрезмерно больших данных, не вводя отдельные продуктовые payload-лимиты для внутреннего сотруднического сценария первого pass.

#### Scenario: Payload содержит потенциальные секреты
- **WHEN** backend строит Dify payload
- **THEN** sanitizer SHALL удалить secrets, tokens, API keys и deployment credentials до отправки и сохранения diagnostic data

#### Scenario: Документация слишком большая
- **WHEN** Markdown/json содержимое превышает настроенные технические guardrails
- **THEN** backend SHALL усечь или исключить часть содержимого и SHALL добавить warning с описанием truncation

#### Scenario: Analysis result сохраняется
- **WHEN** backend сохраняет Dify result в analysis job
- **THEN** сохраненный result SHALL NOT содержать Dify API key, локальные absolute paths или raw request с чувствительными данными

#### Scenario: Analysis job хранит результат Dify
- **WHEN** Dify pass завершился успешно или с ошибкой валидации
- **THEN** analysis job SHALL хранить normalized result, metadata и compact safe diagnostics вместо полного request/response с текстами документов по умолчанию

#### Scenario: Нужна локальная диагностика полного payload
- **WHEN** разработчик включает явный debug режим в локальном окружении
- **THEN** система MAY сохранить sanitized payload в контролируемом runtime/debug каталоге, не включая этот режим в production по умолчанию
