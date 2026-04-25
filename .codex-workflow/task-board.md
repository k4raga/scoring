# Task Board

## Goal

Собрать для `scoring/` воспроизводимый manager/developer/QA contour вокруг процесса coding, статической страницы проекта и будущего Codex-first runtime.

## Constraints

- считать `scoring/` полным проектным контуром;
- не копировать архитектуру `schedule-widget`, а переносить только development workflow;
- `Primary QA` по умолчанию работает read-only;
- основная консоль по умолчанию выполняет роль `Manager`.

## Sprint Framing

- Пользовательские истории для следующего продуктового planning pass собраны в [sprint-plan.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/sprint-plan.md).
- `Sprint 1`: `FS-001`, `FS-002`, `FS-003`, `FS-004`.
- `Sprint 2`: только `FS-001 Extension`.
- Это sprint-разделение не отменяет текущий active cycle и должно использоваться как верхнеуровневая рамка для следующих implementation-циклов.

## Sprint 1 Launch

- Sprint owner: `Manager`
- Implementation mode: `manager -> Primary Developer (Codex) -> Manager/QA`
- Developer model by default: `gpt-5.3-codex`
- Sprint acceptance frame:
  - `FS-001` create-project ingest flow from home
  - `FS-002` submitted/stage filter behavior from home
  - `FS-003` global search from home
  - `FS-004` delete project from detail

| ID | Title | Owner | Scope | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| SP1-C1 | Home filter/search contract alignment | manager -> developer(codex) -> manager/qa | Привести `home` к Sprint 1 user-path контракту: если пользователь выбирает любой stage-фильтр, он должен получать результат-set по этому фильтру, а не только декоративную смену preview; поиск должен работать как рабочий сценарий по реестру и включать хотя бы название, описание и подрядчика без произвольного обрезания релевантной выдачи | accepted | Stage-фильтры на `home` работают как пользовательский путь, а не как косметика preview-grid; поиск ищет по title/summary/customer и возвращает полный релевантный набор без hard cap на несколько первых карточек |
| SP1-C2 | Create/delete contract alignment | manager -> developer(codex) -> manager/qa | Довести Sprint 1 lifecycle до рабочего вида: новая запись стартует в стадии `Скоринг`; из `detail` доступен явный сценарий удаления проекта с подтверждением и понятным post-delete переходом | accepted | Create-flow дает стартовую стадию `Скоринг`; delete-flow доступен из `detail`, требует подтверждения, удаляет проект из UI/реестра и ведет в стабильный экран без broken route |

## Active Cycle

| ID | Title | Owner | Scope | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| SC-007 | Editable detail-page с типами полей, ссылками на архив и динамическими критериями | manager -> developer -> tester | Сделать поля деталки редактируемыми после загрузки записи, сохранить типы полей по смыслу Excel-таблицы, дать документным полям ссылки на загруженный архив, поддержать добавление и удаление строк в блоках критериев, убрать hover-jump у карточек, затем провести self-review по UX/аналитике и отдельный дополнительный проход по типам полей на основе примера Excel | accepted | Деталка редактируется и сохраняется; UI перегруппирован под Excel-структуру `общая информация -> суммы -> тендер -> критерии`; поля про документы ведут на архив/загруженные материалы; критерии можно добавлять и удалять; `creative` можно выставлять и очищать через backend merge без залипания; тип строки критериев следует Excel-семантике `основной / критерий / блок-фактор`; hover-jump убран и больше не использует `transform` |

| SC-013 | Detail comment alignment pass | manager -> developer -> tester | Пройти user-diff comments по `detail` против `prototype-detail.html`: убрать hero-meta chips, `Действия` и нижний service block, убрать секцию `Критерии выбора`, вернуть `НМЦ` в `Общую информацию`, привести `Срок подачи` и `Переторжка` к каноническому виду, перепроверить заголовки и группировку без изменения prototype-файлов | in_progress | Все 7 user comments закрыты на текущем `detail`-маршруте; layout идет за `prototype-detail.html`; save flow не сломан; `npm run build --workspace frontend` проходит |

## Accepted

- `SC-001` `Перенести в scoring manager/developer/QA contour, права ролей и workflow-артефакты по образцу schedule-widget, не копируя архитектуру приложения`
- `SC-002` `Сделать тестовый прогон через обновление статической scoring-страницы и показать на ней ссылки на development contour`
- `SC-003` `Собрать первое рабочее Node.js приложение с backend/frontend, маршрутизацией год -> месяц -> день -> деталка и Excel-экспортом дня`
- `SC-004` `Сделать текущий месяц основным workspace, вывести статистику на главной и реализовать upload архива -> создание папки -> создание/обновление записи`
- `SC-006` `Перевести UI в upload-only сценарий, автоматически создавать project folder и local Codex-run, вывести current month workspace и Excel-like detail, отдельно принять design pass и закрыть 2 manager self-review цикла`
- `SC-007` `Сделать деталку редактируемой после загрузки, привести типы и структуру полей к Excel-образцу, дать документным полям рабочие ссылки на архив, добавить add/remove в критериях, убрать hover-jump и закрыть self-review по UX/аналитике с дополнительным Excel-pass`

## Proposed Backlog

Запрет redesign-pass:
- канонический дизайн зафиксирован в [docs/UI-REFERENCE.md](/C:/Users/illki/Desktop/projects/scoring/docs/UI-REFERENCE.md), [prototype-home.html](/C:/Users/illki/Desktop/projects/scoring/prototype-home.html), [prototype-month.html](/C:/Users/illki/Desktop/projects/scoring/prototype-month.html), [prototype-detail.html](/C:/Users/illki/Desktop/projects/scoring/prototype-detail.html);
- в рамках реализации запрещено менять канонические prototype-файлы и сам reference под код;
- реализация должна подстраиваться под канон, а не канон под реализацию.

| ID | Title | Owner | Scope | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| SC-008 | Home page milestone | manager -> developer -> tester | Собрать первую веху вокруг страницы `home`: вынести минимальный app shell, общие tokens и reusable-паттерны только в объеме, который нужен для точной реализации `prototype-home.html`; подключить live-данные главной и не менять канонический дизайн ради текущей архитектуры | accepted | Главная существует как отдельная страница и визуально следует `prototype-home.html`; шапка, поиск, workspace текущего месяца, latest records, archive blocks и проектные карточки собраны на живых данных; канонический дизайн не переписан |
| SC-009 | Month page milestone | manager -> developer -> tester | Реализовать веху страницы `month` по `prototype-month.html`, используя уже собранный shell и общие паттерны из `home`; подключить `/api/years/:year/months/:month`, собрать статистику, фильтры, список проектов и обратную навигацию | accepted | Страница месяца существует как отдельный маршрут; визуально совпадает с `prototype-month.html`; переход из `home` работает; фильтры и карточки не ломают канонический ритм |
| SC-010 | Detail page milestone | manager -> developer -> tester | Реализовать веху страницы `detail` по `prototype-detail.html`, встроив уже принятую editable-detail механику в канонический layout без изменения prototype-референса | accepted | Детальная страница существует как отдельный маршрут; визуально совпадает с `prototype-detail.html`; save/update flow и типы полей продолжают работать без регрессии |
| SC-011 | Integration milestone for all pages | manager -> developer -> tester | Финальная веха, объединяющая `home`, `month`, `detail`: довести сквозную навигацию, устойчивые URL, shared states, not-found/error/loading, responsive-поведение и обновить regression pack под целостное приложение | proposed | Переходы `home -> month -> detail -> back` работают как единый поток; страницы собраны в один runtime-контур; regression pack покрывает новый маршрутный слой; нигде не было изменений канонического дизайна под реализацию |
| SC-012 | Golden standard recovery pass | manager -> developer -> tester | Один большой corrective-cycle по visual QA findings: вернуть каноническую taxonomy стадий `Скоринг / Предоценка / Оценка / Подано / Получен ответ`, пересобрать month-cards на `home` под точный паттерн референса, убрать из `detail` служебную/dev-лексику из пользовательского UI, выровнять `month` intro и summary-подачу под `prototype-month.html`, не меняя `docs/UI-REFERENCE.md` и `prototype-*.html` | accepted | `home`, `month`, `detail` визуально и терминологически ближе к golden standard; фильтры и status-chips используют канонический набор стадий; карточки месяцев на главной перестают быть шумными placeholder-like блоками; на `detail` не течет внутренняя dev-лексика; после фиксов manager-pass не находит явных расхождений первого порядка с prototype-страницами |

## Risks / Notes

- текущий `scoring/` пока состоит в основном из документов, статической страницы и MVP-заготовки;
- устойчивого автоматического test suite пока нет;
- текущий frontend-контур уже стал основной smoke-поверхностью вместо одного `index.html`;
- Excel-файлы остаются рабочими артефактами, но не должны становиться основным source of truth для развития системы.
- `SC-004` принят после developer handoff, tester read-only pass и manager runtime check; тестовые upload-артефакты были удалены вручную после верификации.
- текущий остаточный риск: browser click-through и автоматизированный upload-smoke пока не зафиксированы в отдельном self-cleaning harness.
- новая продуктовая постановка для `SC-006`: UI создания записи должен стать upload-only; автоматическое извлечение и инициализация идут через локальный Codex, а не через ручной ввод полей пользователем.
- `Sprint 1` принят manager+QA pass'ом 22 апреля 2026 года: live UI подтвердил stage-фильтры по текущему году (`Скоринг=9`, `Оценка=1`, `Подано=1`, пустые состояния для `Предоценка` и `Получен ответ`), поиск по title и summary, create-flow со стартовой стадией `Скоринг`, delete cancel/confirm и возврат на стабильный экран.
- остаточный риск `Sprint 1`: в текущем live-датасете нет ни одной записи с непустым `contractor`, поэтому поиск по этому полю не был принят отдельным фактическим сценарием и остается unverified до появления тестового или реального seed-данного.
