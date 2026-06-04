## Why

В `scoring` уже есть backend Dify adapter, который умеет отправлять карточку и Markdown/json-документы в Dify, но сам Dify workflow/canvas не зафиксирован как часть проектного контракта. Без отдельной спецификации команда рискует собрать workflow с другими input/output именами, невалидным JSON или небезопасной логикой, которую backend не сможет стабильно проверить.

## What Changes

- Вводится отдельный контракт Dify document recognizer workflow для опубликованного Dify workflow.
- Workflow принимает единственную JSON-переменную `scoring_payload` и возвращает результат через output `result`.
- Workflow валидирует версию контракта, наличие `record` и распознанного Markdown/json содержимого документов до LLM-анализа.
- LLM-узел извлекает только значения, подтвержденные переданным Markdown/json, и не использует document links или локальные пути как источник истины.
- Финальный узел возвращает строгий JSON contract: `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`.
- Добавляется runbook для сборки canvas, публикации workflow, настройки env и live smoke без раскрытия секретов.

## Capabilities

### New Capabilities

- `dify-document-recognizer`: контракт Dify canvas/workflow для распознавания Markdown/json-документов и возврата структурированного результата в `scoring`.

### Modified Capabilities

- `dify-ai-pass`: уточняется, что live Dify provider должен вызываться опубликованным workflow с input `scoring_payload` и output `result`, совместимыми с backend adapter.

## Impact

- OpenSpec: новый change для Dify recognizer canvas и delta к существующему Dify AI-pass контракту.
- Docs: runbook настройки Dify canvas, публикации workflow, backend env и live smoke.
- Backend/tests: smoke-контракт должен проверять стандартный input/output shape и отсутствие ссылок, локальных путей, localhost URL и секретов в безопасном result.
- External systems: Dify UI/workflow и production secrets в Dokploy настраиваются вне git.
