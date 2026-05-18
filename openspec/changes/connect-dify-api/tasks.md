## 1. Конфигурация и provider registry

- [x] 1.1 Добавить backend env/config для Dify: base URL, API key, app/workflow mode, response mode, timeout и конфигурируемые технические guardrails payload.
- [x] 1.2 Зарегистрировать provider `dify` в списке AI providers со статусами `configured`, `not_configured`, `failed` без раскрытия секретов.
- [x] 1.3 Обновить документацию локальной и production-настройки Dify env без сохранения секретов в git.

## 2. Dify client и analysis job lifecycle

- [x] 2.1 Добавить backend Dify client для workflow blocking call и нормализации Dify outputs в единый объект result.
- [x] 2.2 Добавить endpoint запуска `POST /api/analysis-jobs/:jobId/run-dify-adapter`.
- [x] 2.3 Реализовать переходы analysis job `queued/running/completed/failed` для Dify pass с безопасной metadata и controlled errors.
- [x] 2.4 Убедиться, что frontend вызывает только backend scoring API и не содержит Dify API key или Dify endpoint.

## 3. Payload builder

- [x] 3.1 Реализовать сбор Dify payload из scoring record: UI-поля карточки, текущие `selectionCriteriaRows`, `recordId`, contract version и язык `ru`.
- [x] 3.2 Исключить из payload document link fields, `href`, `path`, `sourcePath`, `markdownPath`, `runRoot`, absolute/local paths и machine-local URLs.
- [x] 3.3 Добавить чтение normalized Markdown и JSON artifacts через существующие безопасные resolver-правила document layer.
- [x] 3.4 Добавить высокие конфигурируемые технические guardrails на количество документов, размер документа и общий размер payload с warnings при truncation/omission.
- [x] 3.5 Добавить тесты sanitizer-а, подтверждающие, что ссылки, локальные пути и секреты не уходят в Dify payload.

## 4. Result validator и record patch

- [x] 4.1 Реализовать parser/validator Dify response contract: `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`.
- [x] 4.2 Ввести allowlist полей `recordPatch` и запретить document link fields, `workflow`, `documents`, `documentWiki`, `documentArtifacts` и unknown fields.
- [x] 4.3 Нормализовать `selectionCriteriaRows` через существующую модель с обязательным `coverageStatus`.
- [x] 4.4 Сохранять evidence/findings отдельно от patch, чтобы пользователь видел документ и выдержку, на которые опирается AI-pass.
- [x] 4.5 Обработать невалидный JSON/prose response как failed или invalid draft без применения patch к записи.
- [x] 4.6 Применять validated patch автоматически без отдельного human-review шага, сохранив возможность ручной правки полей в UI.
- [x] 4.7 Сохранять в `analysis-jobs` normalized result, metadata и compact safe diagnostics вместо полного request/response по умолчанию.

## 5. Frontend интеграция

- [x] 5.1 Показать Dify provider/status в существующем UI анализа без прямых вызовов Dify.
- [x] 5.2 Добавить запуск Dify pass из карточки или существующего analysis job UI.
- [x] 5.3 Отобразить warnings/errors Dify pass в текущем workflow/status блоке.
- [x] 5.4 Убедиться, что примененный результат обновляет карточку и блок критериев через существующие backend contract-и.

## 6. Проверка и деплой

- [x] 6.1 Добавить mocked success/failure тесты Dify client и run endpoint.
- [x] 6.2 Добавить smoke-сценарий с fixture Markdown/json payload и проверкой обновления карточки/критериев.
- [x] 6.3 Прогнать `npm run check:encoding`, `npm run build`, релевантные smoke-тесты и `npm run openspec:validate`.
- [ ] 6.4 Настроить Dify env в production-контуре Dokploy без вывода секретов в терминал или логи.
- [ ] 6.5 Выполнить production smoke: provider configured, Dify pass запускается, результат валидируется, document links не уходят в payload.
