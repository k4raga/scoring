## 1. Baseline и границы

- [x] 1.1 Зафиксировать текущий baseline: `npm run check:encoding`, `npm run check:selection-criteria`, `npm run check:preassessment`, `npm run openspec:validate`.
- [x] 1.2 Снять текущий endpoint inventory из `backend/src/server.js` и отметить, какие маршруты относятся к records, analysis jobs и document endpoints.
- [x] 1.3 Зафиксировать текущий frontend detail behavior: открытие карточки, dirty-state, save/reset, критерии выбора, предоценка, document wiki, Dify action.

## 2. Backend route/service split

- [x] 2.1 Создать route module для read-only registry/record endpoints без изменения URL и response shape.
- [x] 2.2 Создать route module для create/update/delete record endpoints и оставить upload middleware wiring совместимым с текущим `multer` setup.
- [x] 2.3 Создать route module для analysis job endpoints: create, read, list by record, field patch/result, Dify/local adapter run.
- [x] 2.4 Создать route module для document endpoints: document index, markdown read, source archive/folder/source documents, extraction artifacts.
- [x] 2.5 Вынести orchestration операций из route handlers в service-функции там, где handler сейчас делает больше чтения request и отправки response.
- [x] 2.6 Сократить `server.js` до Express setup, middleware/static setup, route mounting, SPA fallback и `app.listen`.
- [x] 2.7 Проверить, что error codes/status для `record_not_found`, `analysis_job_not_found`, invalid payload и document resolver failures не изменились.

## 3. Frontend form model extraction

- [x] 3.1 Вынести `createEmptyForm`, `buildFormState`, `serializeForm`, `buildSavePayload` и связанные row factories из `DetailPage.jsx` в отдельный form model module.
- [x] 3.2 Вынести frontend normalizers для `purchaseBy`, `creative`, `selectionCriteriaRows`, `preassessment`, `documentWiki` в тот же bounded form model слой или рядом с ним.
- [x] 3.3 Заменить imports в `DetailPage.jsx` без изменения JSX-поведения карточки.
- [x] 3.4 Проверить, что dirty-state использует тот же serialized form contract и не реагирует на frontend-only `rowId`.

## 4. Frontend hooks и feature components

- [x] 4.1 Вынести загрузку, сохранение, reset и status/error state записи в `useRecordDetail`.
- [x] 4.2 Вынести загрузку providers/jobs, refresh и Dify run flow в `useAnalysisContext` или близкий bounded hook.
- [x] 4.3 Вынести `SelectionCriteriaSection` и связанные row components в отдельный feature module.
- [x] 4.4 Вынести `PreassessmentSection` и связанные row components в отдельный feature module.
- [x] 4.5 Вынести document wiki editor/list helpers из `DetailPage.jsx` в отдельный feature module без изменения `documentWiki` payload.
- [x] 4.6 Оставить `DetailPage.jsx` page shell: route params, navigation, layout, high-level wiring.

## 5. Record contract cleanup

- [x] 5.1 Использовать `record.editorSchema` как primary source для доступных options/schema там, где backend уже возвращает нужные поля.
- [x] 5.2 Оставить frontend fallback-значения только как compatibility fallback, без конфликта с backend schema.
- [x] 5.3 Убедиться, что `selectionCriteriaRows`, `preassessment` и `documentWiki` сохраняются через backend `applyRecordPatch` без потерь.
- [x] 5.4 Обновить или добавить focused checks для record form model serialization, если чистая проверка возможна без запуска browser smoke.

## 6. Verification

- [x] 6.1 Прогнать `npm run check:encoding`.
- [x] 6.2 Прогнать `npm run check:selection-criteria`.
- [x] 6.3 Прогнать `npm run check:preassessment`.
- [x] 6.4 Прогнать `npm run build`.
- [x] 6.5 Прогнать релевантный smoke для detail/save flow; если полный browser smoke недоступен, явно зафиксировать not checked и причину.
- [x] 6.6 Прогнать Dify mocked/smoke check, если implementation pass затронул Dify route, service или frontend action.
- [x] 6.7 Прогнать `npm run openspec:validate`.
