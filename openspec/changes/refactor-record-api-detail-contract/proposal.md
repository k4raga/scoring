## Why

В `scoring` накопилась критическая концентрация логики в нескольких файлах: `backend/src/server.js`, `frontend/src/pages/DetailPage.jsx` и дублирующей frontend/backend модели record-полей. Это уже замедляет развитие карточки scoring-записи, Dify AI-pass и новых блоков вроде критериев выбора и предоценки.

Рефакторинг нужен сейчас, пока свежие контракты `selectionCriteriaRows`, `preassessment` и `documentWiki` еще обозримы и их можно закрепить как стабильный record editing contract без изменения пользовательского поведения.

## What Changes

- Разделить backend API composition: оставить `server.js` точкой сборки Express-приложения, а маршруты/сервисы записей, analysis jobs и document endpoints вынести в bounded modules.
- Разделить `DetailPage.jsx` на page shell, data hooks, form model helpers и feature-компоненты карточки записи.
- Убрать или резко сократить дублирование record defaults/options/normalizers между backend и frontend.
- Зафиксировать стабильный контракт редактирования scoring-записи: загрузка, отображение, dirty-state, сохранение, повторное открытие и совместимость с существующими structured-блоками.
- Сохранить внешнее поведение API и UI без intentional breaking changes.

## Capabilities

### New Capabilities

- `record-editing-contract`: стабильный контракт API/UI для открытия, редактирования, сохранения и повторного открытия scoring-записи после внутреннего refactor split.

### Modified Capabilities

Нет. Требования существующего `selection-criteria-block` не меняются; блок должен продолжить работать через тот же `selectionCriteriaRows` contract после разборки формы и shared model.

## Impact

- Backend:
  - `backend/src/server.js`
  - будущие route/service modules вокруг records, analysis jobs, documents и adapter runs
  - `backend/src/record-schema.js`
  - `backend/src/record-patch.js`
- Frontend:
  - `frontend/src/pages/DetailPage.jsx`
  - будущие `frontend/src/features/record-detail/*` или близкая структура
  - возможный shared/client-side record contract module
- Проверки:
  - `npm run check:encoding`
  - `npm run check:selection-criteria`
  - `npm run check:preassessment`
  - `npm run build`
  - релевантные smoke-сценарии карточки записи и Dify/status UI, если затронуты.
- Внешние API endpoints, payload shape и пользовательские маршруты не должны измениться в рамках этого change.
