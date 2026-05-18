---
id: TASK-2
title: Подключить дефай
status: In Progress
assignee: []
created_date: '2026-05-12 10:22'
updated_date: '2026-05-18 07:08'
labels:
  - sprint-2026-05-12 scoring defai
milestone: Sprint 2026-05-12
dependencies: []
documentation:
  - .codex-workflow/sprint-2026-05-12.md
modified_files:
  - backend/src/dify-analysis.js
  - backend/src/ai-analysis.js
  - backend/src/server.js
  - frontend/src/api.js
  - frontend/src/pages/DetailPage.jsx
  - frontend/src/styles.css
  - scripts/test-dify-analysis.mjs
  - scripts/smoke-dify-analysis.mjs
  - docs/AI-API.md
  - README.md
  - package.json
  - openspec/changes/connect-dify-api/proposal.md
  - openspec/changes/connect-dify-api/design.md
  - openspec/changes/connect-dify-api/specs/dify-ai-pass/spec.md
  - openspec/changes/connect-dify-api/specs/selection-criteria-block/spec.md
  - openspec/changes/connect-dify-api/tasks.md
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подключить дефай к текущему scoring-контуру. Детали интеграции нужно уточнить перед реализацией.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Понятно, что именно означает дефай в контексте проекта.
- [x] #2 Есть согласованный контракт подключения или явный OpenSpec change.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-18: Уточнено, что дефай в этой задаче означает Dify API. Начат OpenSpec change connect-dify-api: backend должен отправлять Dify все UI-данные записи кроме document links, а содержимое документов передавать как markdown/json artifacts; Dify должен возвращать структурированные данные, подходящие для применения к карточке и документации.

2026-05-18: OpenSpec change connect-dify-api создан и проходит strict validation. Зафиксировано: дефай = Dify API; интеграция backend-only; scoring передает Dify UI-данные без document links и содержимое документации как Markdown/json; Dify возвращает валидируемый structured result для карточки, criteria rows, findings/warnings/metadata. Реализация Dify-интеграции в коде еще не начата и должна идти через apply этого change.

2026-05-18: Open questions по connect-dify-api закрыты: имя Dify workflow/app не считается runtime-контрактом; canvas настраиваем совместно; отдельный human-review не нужен, validated patch применяется автоматически; payload-лимиты не являются продуктовым ограничением для сотрудников, остаются только технические guardrails; полный request/response с текстами документов не хранится в analysis-jobs по умолчанию, сохраняются normalized result, metadata и compact safe diagnostics.

2026-05-18: Начат implementation pass по OpenSpec change connect-dify-api. Локально реализованы backend Dify provider/client/payload/validator/run endpoint, UI запуск/status, docs и mock/smoke checks. OpenSpec apply progress: 26/28; production env и production smoke не завершены, потому что нужны реальные Dify base URL/API key и опубликованный workflow.
<!-- SECTION:NOTES:END -->
