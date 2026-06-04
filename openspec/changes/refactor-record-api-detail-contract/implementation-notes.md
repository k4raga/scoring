# Implementation Notes

## Baseline

- `npm run check:encoding`: passed.
- `npm run check:selection-criteria`: passed.
- `npm run check:preassessment`: passed.
- `npm run openspec:validate`: passed.

## Endpoint Inventory

### Core/system

- `GET /api/health`
- `GET /api/ai/providers`
- `POST /api/ai/analyze-archive`

### Registry/read-only records

- `GET /api/dashboard`
- `GET /api/years`
- `GET /api/years/:year`
- `GET /api/years/:year/months/:month`
- `GET /api/years/:year/months/:month/days/:day`
- `GET /api/years/:year/months/:month/days/:day/export`
- `GET /api/records/:recordId`

### Record mutation/upload

- `POST /api/records`
- `POST /api/ingest/archive`
- `PUT /api/records/:recordId`
- `DELETE /api/records/:recordId`

### Analysis jobs

- `GET /api/analysis-jobs/statuses`
- `POST /api/analysis-jobs`
- `GET /api/analysis-jobs/:jobId`
- `GET /api/records/:recordId/analysis-jobs`
- `PATCH /api/analysis-jobs/:jobId/field-patch`
- `POST /api/analysis-jobs/:jobId/result`
- `POST /api/analysis-jobs/:jobId/run-local-adapter` when local adapter is enabled
- `POST /api/analysis-jobs/:jobId/run-dify-adapter`

### Document layer

- `GET /api/document-records`
- `GET /api/records/:recordId/documents/:documentId/markdown`
- `GET /api/records/:recordId/source-archive`
- `GET /api/records/:recordId/source-folder`
- `GET /api/records/:recordId/source-documents/:documentId`
- `GET /api/records/:recordId/extraction-artifacts/:artifactKey`

### Static/Spa setup

- `/assets/docs`
- `/assets/tmp`
- `/assets/storage`
- SPA fallback from `SCORING_FRONTEND_DIST` stays in `server.js` for this change.

## Detail Behavior Baseline

- Opening `/records/:recordId` loads `fetchRecord(recordId)`, builds form state, stores `savedForm`, and sets success/error state.
- The detail page loads AI providers and record analysis jobs separately from the record load.
- Dirty-state is computed by comparing `serializeForm(form)` and `serializeForm(savedForm)`.
- Save validates meaningful `selectionCriteriaRows` require `coverageStatus`, sends `saveRecord(recordId, buildSavePayload(form))`, then rebuilds form from the returned record.
- Reset restores `savedForm`.
- Selection criteria rows support add, edit, remove and order recalculation.
- Preassessment supports risk row add, edit, remove, criticality, summary decision, Alexander decision and estimate file URL.
- Document wiki supports generated/manual block title override, visibility toggle, manual block add/remove and order swaps.
- Dify action requires a clean form, creates a Dify analysis job, calls scoring backend `run-dify-adapter`, refreshes record and analysis context.

## Final Verification

- `npm run check:encoding`: passed.
- `npm run check:selection-criteria`: passed.
- `npm run check:preassessment`: passed.
- `npm run check:record-form`: passed.
- `npm run check:documents`: passed.
- `npm run test:dify`: passed.
- `npm run build`: passed.
- Full isolated backend QA on temp data: passed for health, AI archive analysis, read endpoints, record save validation, document endpoints, analysis job lifecycle, local adapter route and delete flow.
- Frontend route QA on temp data: passed for `/`, `/years/2026/months/4`, `/records`, `/records/qa-record`, `/records/qa-record/documents`, `/records/qa-record/documents/doc-1`, `/records/qa-record/source-folder`.
- `npm run smoke:preassessment`: passed; screenshots written to `tmp/preassessment-desktop.png` and `tmp/preassessment-mobile.png`.
- `npm run smoke:dify`: passed against mocked Dify backend.
- `npm run openspec:validate`: passed, 6 items.

## QA Findings

- Found and fixed a Windows-only document resolver regression: extractor artifact hrefs like `/artifacts/...` were treated as absolute filesystem paths before artifact resolution, causing source document endpoints to return `403`. `resolveExtractorArtifactPath` now resolves artifact hrefs before absolute-path guardrails. Covered by `npm run check:documents`.
