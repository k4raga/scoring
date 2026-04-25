# Sprint 2 Launch

## Title

FS-001 Extension as API-first archive analysis

## Architecture Rule

- backend `scoring/` должен оставаться API-first контуром анализа архивов;
- backend должен:
  - принимать запуск анализа;
  - отдавать status и result;
  - принимать field patch или final analysis result от execution-layer;
- локальный Codex в текущем цикле используется только как временный execution-adapter для тестирования;
- последующий перенос на `DeFi` должен менять executor, а не backend-контракт, не shape данных detail и не пользовательский flow.

## Active Decomposition

1. `SP2-C1` Archive analysis API contract
   Scope: analysis-job model, pipeline statuses, result payload, field patch, backend endpoints для submit/status/result.
   Status: accepted on manager/QA pass.

2. `SP2-C2` Local Codex execution adapter
   Scope: распаковка архива, инвентаризация файлов, локальный pass и возврат result в backend через тот же API-контракт.
   Status: accepted on manager/QA pass.

3. `SP2-C3` Analysis result presentation in detail
   Scope: найденные значения заполняются, missing/unreliable значения остаются в unresolved-state, пользователь видит result анализа документов, а не пустую оболочку.
   Status: next active cycle.

## Current Rule For Implementation

- сначала строим API;
- затем поднимаем локальный sync с локальным Codex поверх этого API;
- после этого доводим presentation layer detail;
- прямую продуктовую зависимость backend от локального Codex не закладываем.

## Acceptance Notes

- `SP2-C1` считается принятым, когда backend умеет принять запуск анализа, отдать status/result и принять field patch или final result без знания о конкретном executor.
- `SP2-C2` считается принятым, когда локальный Codex реально выполняет analysis-pass через тот же backend-контракт, который потом можно заменить на `DeFi`.
- `SP2-C3` считается принятым, когда detail показывает состояния `анализ идет / значение найдено / значение не найдено / значение найдено ненадежно` и остается совместимым с API-first backend.

## Manager QA Notes

- `SP2-C1` проверен на реальном HTTP в изолированном temp-контуре:
  - `GET /api/analysis-jobs/statuses`
  - `POST /api/records`
  - `GET /api/records/:recordId/analysis-jobs`
  - `PATCH /api/analysis-jobs/:jobId/field-patch`
  - `POST /api/analysis-jobs/:jobId/result`
  - `GET /api/analysis-jobs/:jobId`
  - `POST /api/analysis-jobs`
- create-flow остался совместимым и теперь дополнительно возвращает `analysisJob`.
- Остаточный риск `SP2-C1`: в create-flow одновременно есть legacy `analysis` и новый queued `analysisJob`; это не блокер контракта, но семантику стоит позднее унифицировать.
- `SP2-C2` проверен в изолированном temp-контуре:
  - при `SCORING_ENABLE_LOCAL_ANALYSIS_ADAPTER=1` endpoint `POST /api/analysis-jobs/:jobId/run-local-adapter` реально выполняет локальный adapter-pass;
  - job проходит `queued -> running -> completed`;
  - result сохраняется в тот же analysis-job контракт;
  - при выключенном флаге backend-контракт продолжает жить без local adapter.
- Остаточный риск `SP2-C2`: полноценная распаковка сейчас есть только для `.zip`; для остальных архивов работает безопасный fallback `workspace_prepared_only`.
