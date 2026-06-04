## Context

Текущий `connect-dify-api` уже добавил backend-only Dify provider, endpoint `POST /api/analysis-jobs/:jobId/run-dify-adapter`, sanitizer payload и validator результата. Этот change закрывает недостающий внешний слой: каким должен быть опубликованный Dify workflow, чтобы существующий adapter мог стабильно запускать распознавание документов.

`scoring` остается владельцем извлечения исходных архивов в Markdown/json. Dify не получает прямой доступ к исходным файлам, локальным путям, frontend routes или storage links. Его задача в первом рабочем контуре: проанализировать уже подготовленные Markdown/json-документы, заполнить карточку и критерии выбора, вернуть evidence.

## Goals / Non-Goals

**Goals:**

- Зафиксировать canvas contract `scoring_payload -> result`.
- Описать минимальный набор Dify nodes: User Input, validation/prep, LLM extraction, final JSON output.
- Дать runbook, по которому workflow можно собрать и проверить без изменения backend UI.
- Усилить smoke-проверку backend adapter под согласованный canvas shape.

**Non-Goals:**

- Не переносить extraction/OCR исходных pdf/docx/xlsx внутрь Dify в первом цикле.
- Не добавлять file upload API Dify как основной вход.
- Не хранить Dify API key, production URL с секретами или полный request/response в git.
- Не менять frontend contract карточки и criteria block.

## Decisions

### Decision 1: Один JSON input `scoring_payload`

Dify workflow должен принимать одну JSON-переменную `scoring_payload`, потому что backend уже строит цельный versioned payload из карточки, критериев и Markdown/json документов.

Alternative considered: отдельные переменные `record`, `documents`, `criteria`. Это удобнее визуально в Dify UI, но повышает риск расхождения с backend sanitizer и усложняет smoke.

### Decision 2: Output только через `result`

Финальный Dify node должен отдавать `result` как JSON object или JSON string. Backend уже умеет читать `outputs.result` и нормализовать его в `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`.

Alternative considered: несколько output variables. Это допустимо для Dify, но ломает простой live smoke и увеличивает вероятность, что backend применит неполный контракт.

### Decision 3: Validation/prep node до LLM

Workflow должен проверить `context.contractVersion = dify-ai-pass.v1`, наличие `record`, наличие массива `documents` и хотя бы одного документа с `markdown` или `jsonArtifacts`. При ошибке workflow возвращает валидный JSON с warning/error metadata, а не свободный текст.

Alternative considered: доверять backend payload без validation node. Это быстрее, но в Dify UI сложнее диагностировать неправильные публикации workflow или ручные изменения input schema.

### Decision 4: Dify не придумывает отсутствующие значения

LLM prompt должен требовать evidence для значимых значений. Если значение не найдено в Markdown/json, поле не включается в `recordPatch`; вместо этого добавляется warning или finding с объяснением отсутствия.

Alternative considered: заполнять best-effort поля без evidence. Это ускоряет демо, но ухудшает доверие к карточке и противоречит текущему AI API provenance rule.

### Decision 5: Live smoke идет через существующий backend

Проверка реального workflow должна идти через `GET /api/ai/providers`, создание `analysis-jobs` и `run-dify-adapter`, а не прямой ручной `curl` в Dify как единственный критерий.

Alternative considered: проверить только Dify workflow в Dify UI. Это не подтверждает, что backend env, sanitizer, validator и record patch реально работают вместе.

## Risks / Trade-offs

- [Risk] Dify canvas возвращает prose вместо JSON -> Mitigation: final/code node сериализует ровно JSON; backend smoke и validator ловят invalid contract.
- [Risk] Input variable названа иначе -> Mitigation: runbook фиксирует `scoring_payload`; env `SCORING_DIFY_PAYLOAD_INPUT_KEY` оставлен как контролируемый override.
- [Risk] Workflow опубликован не той версией -> Mitigation: live smoke проверяет `workflowRunId`, completed job и примененный patch.
- [Risk] Evidence неполное -> Mitigation: prompt требует `documentFindings`; backend добавляет warning `dify_evidence_missing`, если patch есть без evidence.
- [Risk] Production secrets попадут в диагностику -> Mitigation: secrets задаются только env/secrets, smoke проверяет отсутствие API key в result.

## Migration Plan

1. Собрать Dify workflow по runbook и опубликовать его.
2. Настроить backend env/secrets локально или в Dokploy без вывода ключей в терминал.
3. Запустить локальные mocked checks.
4. Выполнить live smoke через scoring backend.
5. При mismatch output shape править Dify final node или backend normalizer, но не frontend.
6. Rollback: убрать Dify env/secrets или вернуть provider в `not_configured`; текущий extractor/local adapter остается доступным.

## Open Questions

Нет открытых вопросов для repo-side реализации. Реальные значения Dify host/API key и публикация canvas остаются внешними операционными шагами.
