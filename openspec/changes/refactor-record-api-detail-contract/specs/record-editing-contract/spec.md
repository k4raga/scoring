## ADDED Requirements

### Requirement: Стабильный API чтения scoring-записи
Система SHALL сохранять существующий HTTP contract чтения scoring-записи во время внутреннего refactor split.

#### Scenario: Пользователь открывает карточку записи
- **WHEN** frontend запрашивает `GET /api/records/:recordId` для существующей записи
- **THEN** backend SHALL вернуть ту же scoring-запись с persistent-полями, structured-блоками, `editorSchema`, `documentBlocks` и вычисляемыми view fields, которые были доступны до рефакторинга

#### Scenario: Пользователь открывает отсутствующую запись
- **WHEN** frontend запрашивает `GET /api/records/:recordId` для несуществующей записи
- **THEN** backend SHALL вернуть HTTP 404 с ошибкой `record_not_found`

### Requirement: Стабильный API сохранения scoring-записи
Система SHALL сохранять существующий HTTP contract сохранения scoring-записи во время внутреннего refactor split.

#### Scenario: Пользователь сохраняет валидную карточку
- **WHEN** frontend отправляет `PUT /api/records/:recordId` с валидным payload карточки
- **THEN** backend SHALL применить patch через единый record patch contract и вернуть `{ updated: true, record }`

#### Scenario: Пользователь сохраняет критерии без экспертного закрытия
- **WHEN** frontend отправляет строку `selectionCriteriaRows` с содержанием, но без `coverageStatus`
- **THEN** backend SHALL сохранить строку, потому что `coverageStatus` и `coverageAmount` заполняет тендерный специалист отдельно

#### Scenario: Пользователь сохраняет карточку с блоком предоценки
- **WHEN** frontend отправляет `preassessment` с risk rows и итоговыми решениями
- **THEN** backend SHALL нормализовать и сохранить `preassessment` без потери существующих полей записи

### Requirement: Backend schema является источником persistent record contract
Система SHALL считать backend record schema и editor schema главным источником persistent record fields, options и structured block shapes.

#### Scenario: Frontend отображает select/options карточки
- **WHEN** запись содержит `editorSchema` с options для редактируемого блока
- **THEN** frontend SHALL использовать эти options как primary source и SHALL NOT вводить конфликтующий независимый набор значений

#### Scenario: Frontend готовит payload сохранения
- **WHEN** пользователь сохраняет карточку после редактирования
- **THEN** frontend SHALL отправить payload, совместимый с backend `applyRecordPatch`, без frontend-only служебных идентификаторов строк

### Requirement: Поведение detail-страницы сохраняется после разборки модулей
Система SHALL сохранить пользовательский сценарий detail-страницы после выделения hooks, form model helpers и feature-компонентов.

#### Scenario: Пользователь открывает detail-страницу
- **WHEN** пользователь открывает `/records/:recordId`
- **THEN** frontend SHALL загрузить запись, построить форму и показать те же основные секции карточки, что и до рефакторинга

#### Scenario: Пользователь меняет поле карточки
- **WHEN** пользователь меняет редактируемое поле карточки
- **THEN** frontend SHALL показать dirty-state и позволить сохранить или сбросить изменения

#### Scenario: Пользователь сохраняет и перезагружает карточку
- **WHEN** пользователь сохраняет изменения, а затем повторно открывает ту же карточку
- **THEN** frontend SHALL показать сохраненные значения из backend, а не локальный fallback state

### Requirement: Structured-блоки записи сохраняют совместимость
Система SHALL сохранить совместимость structured-блоков `selectionCriteriaRows`, `preassessment` и `documentWiki` после внутреннего refactor split.

#### Scenario: Карточка содержит критерии выбора
- **WHEN** запись содержит `selectionCriteriaRows`
- **THEN** frontend SHALL показать строки критериев, позволить редактировать их и сохранить через тот же `selectionCriteriaRows` contract

#### Scenario: Карточка содержит предоценку
- **WHEN** запись содержит `preassessment`
- **THEN** frontend SHALL показать блок предоценки, позволить редактировать строки риска и сохранить блок через тот же `preassessment` contract

#### Scenario: Карточка содержит document wiki config
- **WHEN** запись содержит `documentWiki`
- **THEN** frontend SHALL сохранить ручные override-ы, порядок и видимость document blocks при редактировании других полей карточки

### Requirement: Analysis job и Dify UI остаются backend-only integration
Система SHALL сохранить текущую модель, где frontend работает только со scoring backend API, а не с Dify API напрямую.

#### Scenario: Пользователь запускает Dify AI-pass из карточки
- **WHEN** пользователь запускает Dify AI-pass на detail-странице
- **THEN** frontend SHALL создать analysis job и вызвать только scoring endpoint `POST /api/analysis-jobs/:jobId/run-dify-adapter`

#### Scenario: Dify AI-pass завершился
- **WHEN** backend возвращает результат Dify run
- **THEN** frontend SHALL обновить запись и analysis job context без прямого доступа к Dify credentials или Dify endpoint
