## Context

Текущий MVP уже имеет рабочие API и UI-потоки, но несколько модулей стали слишком широкими:

- `backend/src/server.js` совмещает Express setup, route handlers, orchestration analysis jobs, Dify/local adapter run, document artifact resolving и file-serving guardrails.
- `frontend/src/pages/DetailPage.jsx` совмещает page shell, загрузку данных, form state, dirty-state, save payload, custom controls, Dify action, document wiki, критерии выбора и предоценку.
- `backend/src/record-schema.js` уже является фактическим источником нормализации record-модели, но frontend дублирует часть defaults/options/normalizers локально.

Цель change — internal refactor без смены пользовательского сценария и без изменения public scoring API.

## Goals / Non-Goals

**Goals:**

- Сократить ответственность `server.js` до сборки приложения, middleware/static setup и подключения route modules.
- Вынести backend record, analysis-job и document операции в bounded route/service modules.
- Разделить `DetailPage.jsx` на контейнер страницы, data hooks, form model helpers и feature-компоненты.
- Закрепить backend record schema/editor schema как главный источник persistent record contract.
- Сохранить текущие URL, endpoint payloads, response shape и пользовательское поведение карточки.
- Сохранить работу `selectionCriteriaRows`, `preassessment`, `documentWiki` и Dify AI-pass после разборки модулей.

**Non-Goals:**

- Не менять storage backend с JSON на БД.
- Не менять маршруты frontend-приложения.
- Не менять Dify response contract и production env-настройку.
- Не переписывать дизайн карточки записи.
- Не архивировать существующие OpenSpec changes в рамках этого refactor change.

## Decisions

### 1. Backend route split без смены HTTP contract

Решение: использовать `express.Router()` и вынести группы маршрутов в модули, подключаемые из `server.js`.

Ориентировочная структура:

```text
backend/src/
├── server.js
├── routes/
│   ├── records-routes.js
│   ├── analysis-jobs-routes.js
│   └── documents-routes.js
└── services/
    ├── record-service.js
    ├── analysis-job-service.js
    └── document-service.js
```

`server.js` остается владельцем Express app, global middleware, static assets, multer setup и `app.listen`. Route modules получают зависимости явно через factory-функции, чтобы не создавать скрытые циклические импорты.

Альтернатива: сразу ввести `createApp()` и полноценный dependency container. Это чище для тестов, но шире по blast radius. Для текущего MVP достаточно route factories.

### 2. Сервисы отделяют orchestration от HTTP handlers

Решение: сложные операции, которые сейчас живут в HTTP handlers, вынести в service-функции с plain JS input/output:

- создание/обновление/удаление записи;
- запуск Dify/local adapter job;
- применение analysis result к record;
- построение document index и resolving artifacts.

Route handlers должны заниматься только чтением request, выбором status code и JSON/file response.

Альтернатива: оставить все в routers. Это уменьшает число файлов, но сохраняет проблему широких модулей и усложняет будущие tests.

### 3. Backend schema как источник persistent contract

Решение: `backend/src/record-schema.js` остается владельцем persistent normalization и editor schema. Frontend не должен вводить независимые enum-значения, которые могут конфликтовать с backend.

Практический первый шаг: `DetailPage` и вынесенные компоненты получают options/schema из `record.editorSchema`, где это уже доступно, а frontend form model отвечает только за UI-state, temporary row ids и serialization перед save.

Альтернатива: создать отдельный root `shared` workspace. Это может стать следующим шагом, но сейчас добавит package/build wiring и риск отвлечься от refactor-а.

### 4. Frontend split по feature boundary, не по визуальным мелочам

Решение: выносить из `DetailPage.jsx` крупные связные блоки:

- `recordFormModel.js`: `createEmptyForm`, `buildFormState`, `serializeForm`, `buildSavePayload`, row factories и lightweight UI normalizers;
- `useRecordDetail.js`: загрузка записи, сохранение, reset, dirty-state;
- `useAnalysisContext.js`: AI providers, analysis jobs, Dify run/refresh;
- `SelectionCriteriaSection.jsx`;
- `PreassessmentSection.jsx`;
- `DocumentWikiEditor.jsx`;
- `DetailModals.jsx` или отдельные modal components.

`DetailPage.jsx` должен остаться orchestration shell: route params, navigation, layout order и wire-up handlers.

Альтернатива: разбить файл только на мелкие components. Это уменьшит строку файла, но оставит смешанную state/model логику.

### 5. Refactor идет маленькими проверяемыми срезами

Решение: каждый срез должен сохранять работоспособность build/checks. Порядок:

1. backend route/service split с теми же endpoint-ами;
2. form model extraction;
3. feature components/hooks extraction;
4. schema/options cleanup.

Альтернатива: сделать один большой rewrite. Это быстрее на бумаге, но рискованно для живого MVP и свежих structured-блоков.

## Risks / Trade-offs

- Route split может случайно изменить status codes или error payloads -> смягчение: после каждого backend среза прогнать focused endpoint checks и существующие smoke/scripts.
- Frontend extraction может сломать dirty-state или save payload -> смягчение: сначала вынести pure helpers без изменения JSX, затем компоненты.
- Использование `editorSchema` во frontend может быть неполным для всех текущих controls -> смягчение: оставить временные local fallbacks, но сделать backend schema primary там, где она уже покрывает options.
- Dify run зависит от analysis job lifecycle и record patch -> смягчение: не менять Dify contract; после backend split прогнать `smoke:dify` или mocked Dify check, если затронуты adapter modules.
- Большое число новых файлов может усложнить навигацию -> смягчение: держать feature/module names прямыми и не вводить абстрактный framework слой.

## Migration Plan

1. Зафиксировать текущий behavior baseline командами `check:encoding`, `check:selection-criteria`, `check:preassessment`, `build` и OpenSpec validate.
2. Вынести backend routes/services без изменения endpoint paths.
3. Вынести frontend form model helpers и убедиться, что save payload не изменился по смыслу.
4. Вынести feature-компоненты и hooks из `DetailPage.jsx`.
5. Переключить доступные options/schema на backend-provided `editorSchema` с fallback-ами.
6. Прогнать финальный verification pack.

Rollback: revert refactor commit(s), так как persistent data migrations и external API changes не предполагаются.

## Open Questions

Нет открытых вопросов для старта implementation pass.

Принятые уточнения:

- Отдельный root `shared` workspace в этом change не создается. Backend-provided `editorSchema` используется как source of truth для record editing contract; frontend fallbacks допустимы только как compatibility layer.
- Static asset setup остается в `server.js` в рамках этого change. Refactor касается API routes/services и detail contract; вынос static/document serving можно рассмотреть отдельным document-layer refactor.
