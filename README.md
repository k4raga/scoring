# scoring

Отдельный проект в папке `projects/` для логики скорринга.

## Текущий смысл

- самостоятельный контур, не вложенный в `estimate`;
- место для доменной логики, сценариев, схем и интерфейсов скорринга;
- отдельная точка сборки требований, гипотез и реализации.

## Пока что внутри

- `README.md` — краткая карта проекта;
- `AGENTS.md` — локальные правила по ролям, правам и границам development contour;
- `AGENT-LOOP.md` — manager/developer/QA цикл работы внутри `scoring/`;
- `.codex-workflow/` — team policy, task board и сценарии smoke-проверки;
- `backend/` — `Node.js` API для структуры `год -> месяц -> день -> деталка` и Excel-экспорта дня;
- `frontend/` — web-интерфейс реестра coding-проектов;
- `docs/ARCHITECTURE.md` — стартовая архитектурная рамка;
- `docs/UI-REFERENCE.md` — зафиксированный дизайн-ориентир и библиотека UI-паттернов для следующих страниц;
- `docs/CODING-PROCESS.md` — зафиксированный бизнес-процесс кодинга.
- `docs/CODING-SOLUTION-ARCHITECTURES.md` — варианты архитектуры решения под coding.
- `docs/CODEX-FIRST-MVP.md` — конкретный стартовый контур Codex-first MVP.
- `docs/CODING-WEB-ARCHITECTURE.md` — целевая архитектура внутреннего сайта кодинга.
- `mvp/` — минимальный локальный runtime для запуска coding-процесса.

## Границы

- `scoring/` не является частью `Watson`;
- `scoring/` не заменяет `estimate`, а забирает из него только результаты предварительной проработки;
- UI, backend и доменная модель можно развивать здесь как отдельный продукт;
- development contour проекта должен опираться на `AGENTS.md`, `AGENT-LOOP.md` и `.codex-workflow/`, а не собираться заново на каждом цикле.

## Локальный запуск приложения

- `npm install`
- `npm run dev`

По умолчанию:

- backend стартует на `http://localhost:4100`
- frontend стартует на `http://localhost:5173`

Для Windows можно запустить отдельным launcher:

- [launch-local.ps1](C:/Users/illki/Desktop/projects/scoring/launch-local.ps1)
- [launch-local.cmd](C:/Users/illki/Desktop/projects/scoring/launch-local.cmd)

Быстрая проверка:

- `npm run smoke` — smoke-пак по API, страницам и Excel-экспорту.
