# Sprint Plan

## Decision

- `Sprint 1` закрывает все уже зафиксированные пользовательские пути, кроме `FS-001 Extension`.
- `Sprint 2` целиком отдается под `FS-001 Extension` без подмешивания других user-path задач.

Источники историй:

- [future-scope.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope.md)
- [future-scope-fs001-extension.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs001-extension.md)
- [future-scope-fs002.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs002.md)
- [future-scope-fs003.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs003.md)
- [future-scope-fs004.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs004.md)

## Sprint 1

### Title

Core user paths without agent archive analysis

### Goal

Собрать базовый рабочий продуктовый контур вокруг жизненного цикла проекта: создать проект, увидеть его в рабочих выборках, найти через поиск и удалить через явный безопасный сценарий.

### Included Stories

- `FS-001` Create-project ingest flow from home
- `FS-002` Submitted projects filter from home
- `FS-003` Global fuzzy search from home
- `FS-004` Delete project

### Explicitly Out Of Scope

- `FS-001 Extension`
- агентный анализ документов внутри архива
- расширение ingest до multi-document extraction pipeline

### Recommended Order

1. `SP1-01` Реализовать `FS-001` как базовый create-project контракт.
   Источник: [future-scope.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope.md:10)
   Почему первым: это входной пользовательский путь и продуктовый фундамент для остальных историй.
   QA baseline: `FT-FS-001` ... `FT-FS-008`.

2. `SP1-02` Реализовать `FS-002` как рабочую выборку поданных проектов за текущий год.
   Источник: [future-scope-fs002.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs002.md:7)
   Зависимость: после стабилизации базового create/list flow.
   QA baseline: `FT-FS-002-001` ... `FT-FS-002-006`.

3. `SP1-03` Реализовать `FS-003` как глобальный нестрогий поиск на главной.
   Источник: [future-scope-fs003.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs003.md:7)
   Зависимость: использует тот же home surface и проектный реестр, что и `FS-002`.
   QA baseline: `FT-FS-003-001` ... `FT-FS-003-007`.

4. `SP1-04` Реализовать `FS-004` как явный сценарий удаления проекта.
   Источник: [future-scope-fs004.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs004.md:7)
   Почему последним: это завершающий lifecycle path, который лучше вводить после стабилизации create/list/search surfaces.
   QA baseline: `FT-FS-004-001` ... `FT-FS-004-007`.

### Sprint 1 Exit Criteria

- Все четыре истории приняты по своим acceptance-критериям.
- Пользовательский цикл `create -> browse/filter/search -> delete` проходит без явных broken states.
- На `home`, `month` и `detail` не возникает конфликтов между новыми user paths.
- QA pack по каждой истории пройден или остаточные риски явно зафиксированы manager'ом.

## Sprint 2

### Title

Agent-driven archive analysis for create-project flow

### Goal

Расширить базовый create-project flow до полноценного агентного анализа архива: распаковка, проход по релевантным документам, извлечение значений и автозаполнение карточки только по надежно найденным данным.

### Included Story

- `FS-001 Extension` Agent-driven archive analysis for create-project flow

### Dependency

- `Sprint 1` должен быть принят.
- Базовый сценарий `FS-001` должен уже существовать как устойчивый продуктовый контракт.

### Explicitly Out Of Scope

- новые пользовательские пути вне create-project flow
- расширение выборок, фильтров, поиска или удаления
- redesign главной, detail или month вне нужд extension-сценария

### Recommended Internal Sequence

1. `SP2-01` Добавить агентный pass после загрузки архива.
   Источник: [future-scope-fs001-extension.md](/C:/Users/illki/Desktop/projects/scoring/.codex-workflow/future-scope-fs001-extension.md:26)
   Scope: запуск анализа после create, распаковка архива, инвентаризация файлов.

2. `SP2-02` Реализовать проход по нескольким релевантным документам и извлечение фактов.
   Scope: чтение документов, multi-document analysis, извлечение значений из содержимого, а не только из metadata архива.

3. `SP2-03` Довести mapping результатов в detail и состояния unresolved/unreliable values.
   Scope: автозаполнение надежных значений, сохранение disabled-state для ненайденных и ненадежных значений, прозрачный результат анализа в карточке проекта.

### Sprint 2 QA Baseline

- `FT-FS-001-EXT-001` ... `FT-FS-001-EXT-006`

### Sprint 2 Exit Criteria

- Агентный анализ реально запускается после create-project flow.
- Архив распаковывается и анализируется по документам внутри него.
- Надежно найденные значения попадают в соответствующие поля detail.
- Ненайденные или ненадежные значения не превращаются в обычные пустые editable controls.
- Пользователь видит результат анализа документов, а не просто пустую карточку с загруженным архивом.

## Planning Note

Разделение на эти два спринта сделано специально, чтобы сначала закрыть весь базовый пользовательский контур продукта, а уже потом отдельно заходить в более дорогой и рискованный слой agent-driven ingest.
