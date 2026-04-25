# Agent Loop

Этот проект поддерживает manager-driven workflow для `scoring/`.

Базовая схема:

- `Основная консоль / Manager` держит контекст, план, приемку и workflow-артефакты;
- `Primary Developer` реализует bounded implementation tasks;
- `Primary QA` делает независимую проверку;
- `Test Automation` и `Design Agent` подключаются только при явной необходимости.

## Команда по умолчанию

Постоянная команда:

- `Manager`
- `Primary Developer`
- `Primary QA`

Временные роли:

- `Test Automation`
- `Design Agent`

Все дополнительные агенты считаются временными помощниками и не должны оставаться открытыми без причины.

## Контракт основной консоли

В `scoring/` основная консоль по умолчанию выполняет роль manager/orchestrator.

Это означает:

- широкий read-контекст по проекту;
- право обновлять workflow-артефакты;
- право делать узкие интеграционные или критически-важные правки напрямую;
- обязанность не превращаться в "бесконечного исполнителя всего подряд", если задача лучше делегируется bounded role.

Если задача маленькая, срочная или делегирование не дает выигрыша, основная консоль может сама выполнить и реализующую часть цикла.

## Граница проекта

Считать `C:\Users\illki\Desktop\projects\scoring` полным проектным контуром для этого workflow.

Не расширять анализ на соседние проекты, если пользователь явно не просил этого.

## Project Shape

Текущие рабочие поверхности проекта:

- проектная карта: [README.md](/C:/Users/illki/Desktop/projects/scoring/README.md)
- локальные agent rules: [AGENTS.md](/C:/Users/illki/Desktop/projects/scoring/AGENTS.md)
- архитектурная рамка: [docs/ARCHITECTURE.md](/C:/Users/illki/Desktop/projects/scoring/docs/ARCHITECTURE.md)
- coding-процесс и архитектура: [docs/CODING-PROCESS.md](/C:/Users/illki/Desktop/projects/scoring/docs/CODING-PROCESS.md), [docs/CODING-SOLUTION-ARCHITECTURES.md](/C:/Users/illki/Desktop/projects/scoring/docs/CODING-SOLUTION-ARCHITECTURES.md), [docs/CODING-WEB-ARCHITECTURE.md](/C:/Users/illki/Desktop/projects/scoring/docs/CODING-WEB-ARCHITECTURE.md)
- Codex-first runtime: [mvp/](/C:/Users/illki/Desktop/projects/scoring/mvp)
- статическая обзорная страница: [index.html](/C:/Users/illki/Desktop/projects/scoring/index.html)

## Source Of Truth

`scoring/` — самостоятельный контур.

Правила:

- не считать `estimate` источником истины для уже выделенного проекта;
- не считать `Watson` memory-слоем этого репозитория;
- использовать текущие документы и runtime-артефакты `scoring/` как основную рабочую базу.

## Manager Loop

1. Прочитать `.codex-workflow/task-board.md`.
2. Зафиксировать цель цикла, ограничения и критерий приемки.
3. Определить, нужен ли отдельный developer pass или задача может быть выполнена напрямую из основной консоли.
4. Если работа bounded и требует реализации, выдать `Primary Developer` точный scope.
5. Если цикл затрагивает поведение, данные, генерацию артефактов или UI, назначить `Primary QA` конкретные сценарии.
6. Если цикл касается только presentation layer, можно добавить узкий `Design Agent` pass до QA.
7. Выполнить manager final check в формате `works / does not work`.
8. Принять или отклонить результат.
9. Обновить board.
10. Закрыть временных помощников, если они больше не нужны.

## Default Task Routing

- стратегия, board, acceptance, границы: `Manager`
- доменные и процессные документы: `Manager` или `Primary Developer`
- `mvp/schemas`, `mvp/scripts`, `mvp/runs`: `Primary Developer`
- `index.html` и будущие внутренние страницы: `Primary Developer`, при необходимости с `Design Agent`
- smoke и сценарная верификация: `Primary QA`
- автоматизация проверок: `Test Automation`

## Codex Developer Default

Если manager делегирует implementation-pass отдельному developer-agent, по умолчанию использовать Codex-модель.

Текущее базовое правило для `scoring/`:

- default developer model: `gpt-5.3-codex`

Исключения допустимы только при явном override от пользователя или при техническом ограничении среды.

## Verification Notes

В проекте пока нет устойчивого полноценного автотестового контура.

Базовые поверхности проверки сейчас:

- согласованность документов и workflow-файлов;
- наличие и корректность ссылок на ключевые артефакты;
- `python -m py_compile` для Python-скриптов, если цикл их трогает;
- smoke-проверка статической страницы, если тронут `index.html`;
- сценарная проверка по `.codex-workflow/test-scenarios.md`.

Если проверка изменяет среду или пишет артефакты, это нужно явно проговорить до запуска.

## Tester Contract

Для каждого осмысленного цикла tester должен:

1. просмотреть измененную поверхность;
2. выполнить назначенные сценарии;
3. подтвердить фактическое поведение или указать, что именно не проверялось;
4. отдать отчет в формате:
   - findings first;
   - scenarios run;
   - pass/fail по каждому сценарию;
   - unverified scenarios;
   - residual risks.

Tester не должен останавливаться на формулировке "код выглядит правильно", если цикл затрагивает реальный пользовательский или операционный контур.

## Manager Final Check

Manager обязан делать короткий финальный check, когда цикл затрагивает:

- пользовательскую страницу;
- генерацию coding-артефактов;
- workflow-документы, на которые дальше будут опираться другие участники.

Формат:

- `works`
- `does not work`

## Test Authoring Rule

Если цикл затрагивает:

- парсинг и нормализацию фактов;
- генерацию `facts.json`, coding-файла или Bitrix-артефакта;
- создание/обновление внутренней страницы проекта;
- экспорт или связку между web и runtime-слоем,

manager должен рассмотреть отдельный `Test Automation` pass для закрепления регрессии.
