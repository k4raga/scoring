# Regression Scenario Pack

Этот файл задает базовый QA scenario pack для `scoring/`.

Manager назначает на цикл релевантный поднабор.
Tester должен отдавать каждый назначенный сценарий в формате `works`, `does not work` или `not checked`.

## Current Smoke Pack

`TS-SC-001` Agent contour files exist
- Проверить наличие `AGENTS.md`, `AGENT-LOOP.md`, `.codex-workflow/team-policy.md`, `.codex-workflow/task-board.md`, `.codex-workflow/test-scenarios.md`.
- Expect: все файлы существуют и относятся к `scoring/`, а не к соседнему проекту.

`TS-SC-002` Role model is aligned
- Сравнить `AGENTS.md`, `AGENT-LOOP.md` и `.codex-workflow/team-policy.md`.
- Expect: роли, права и границы проекта не противоречат друг другу.

`TS-SC-003` Main console contract is explicit
- Проверить, что в agent docs отдельно зафиксирована роль основной консоли.
- Expect: основная консоль описана как manager/orchestrator с широким read и ограниченным write для workflow/integration задач.

`TS-SC-004` README exposes the contour
- Открыть `README.md`.
- Expect: в карте проекта видны agent/workflow-артефакты, а не только продуктовые документы.

`TS-SC-005` Architecture references the contour
- Открыть `docs/ARCHITECTURE.md`.
- Expect: в архитектурной рамке зафиксирован development contour и его артефакты.

`TS-SC-006` Static page exposes key artifacts
- Открыть `index.html`.
- Expect: страница по-прежнему ведет к coding-файлу и ключевым документам.
- Expect: на странице появились ссылки как минимум на `AGENT-LOOP.md` и team policy development contour.

`TS-SC-009` Dashboard shows current month
- Открыть `/`.
- Expect: главная страница показывает текущий месяц как основной workspace, а не только список годов.
- Expect: на экране есть агрегаты по текущему месяцу и список дней/записей этого месяца.

`TS-SC-010` Upload creates folder and record
- На главной заполнить форму создания записи и прикрепить архив.
- Expect: backend создает запись в реестре.
- Expect: backend создает папку проекта в storage-контуре.
- Expect: после успешной отправки новая запись появляется в текущем месяце без ручного обновления данных извне.

`TS-SC-011` Upload result is visible
- После успешного upload проверить результат на UI.
- Expect: интерфейс показывает созданную запись и путь/ссылку на folder/archive result в понятной форме.

`TS-SC-012` Detail editor persists Excel-shaped fields
- Открыть деталку существующей записи.
- Изменить `Примечания`, `Творческое` и один document-url.
- Добавить строку в блок критериев, сохранить, перезагрузить страницу и убедиться, что изменения сохранились.
- Удалить добавленную строку, повторно сохранить и убедиться, что count вернулся назад.
- Expect: деталка редактируется без локального-only fallback, `creative` сохраняет и пустое значение, и выбранное значение, а тип строки критериев не схлопывается и следует Excel-семантике по группе.

## Sprint 1 User Paths

`TS-SP1-001` Home stage filters behave as real selection
- Открыть `/`.
- Последовательно выбрать каждый stage-фильтр в блоке `Последние проекты`.
- Expect: любой выбранный фильтр меняет не только active-chip, но и сам result-set; если по стадии есть записи, показывается только этот набор; если записей нет, показывается явное empty-state.
- Expect: правило трактуется обобщенно; если пользователь должен иметь возможность выбрать один из фильтров, значит любой фильтр из этого набора должен работать как реальный сценарий отбора.

`TS-SP1-002` Home search works across live registry without hard cap
- Открыть `/`, раскрыть поиск и ввести один запрос, который матчится по title.
- Затем ввести отдельный запрос, который матчится по summary или description, а не только по заголовку.
- Expect: интерфейс возвращает весь релевантный набор по реестру без произвольного ограничения несколькими первыми карточками.

`TS-SP1-003` Create-project flow lands in detail with scoring stage
- На `/` открыть создание проекта, ввести название и приложить архив.
- Expect: создается новая запись, происходит переход в `detail`, после загрузки карточки стадия проекта равна `Скоринг`.

`TS-SP1-004` Delete-project flow requires confirmation and recovers safely
- Из `detail` открыть удаление проекта.
- Сначала нажать `Отмена`.
- Expect: модалка закрывается, пользователь остается на той же detail-странице.
- Затем повторно открыть удаление и подтвердить действие.
- Expect: запись удаляется, broken route не возникает, пользователь возвращается на стабильный экран.

`TS-SC-007` Python runtime syntax
- Применять, если цикл затронул `mvp/scripts/*.py`.
- Запустить `python -m py_compile` для измененных скриптов.
- Expect: синтаксических ошибок нет.

`TS-SC-008` Run bootstrap smoke
- Применять, если цикл менял `mvp/scripts/init_run.py` или связанные runtime-артефакты.
- Инициализировать тестовый run.
- Expect: создаются `input/`, `normalized/`, `output/`, `facts.json`, `bitrix-task.json`, `run-log.json`, `summary.md`.

## Manager Final Check Format

После QA manager должен зафиксировать минимальный meaningful subset:

- `agent contour docs: works / does not work`
- `README and architecture wiring: works / does not work`
- `scoring page update: works / does not work`
- `current month dashboard: works / does not work`
- `upload -> folder -> record: works / does not work`
- `runtime smoke: works / does not work`

## Automation Candidates

В первую очередь автоматизировать:

1. наличие и согласованность workflow-файлов;
2. smoke ссылок на ключевые артефакты страницы;
3. `py_compile` для Python-скриптов;
4. bootstrap `run`-контур;
5. проверку генерации `facts.json` и выходных артефактов.
