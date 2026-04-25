# Scoring

`scoring` — внутренний инструмент для ведения, анализа и подготовки coding-проектов по тендерным материалам. Проект объединяет локальный web-интерфейс, Node.js API, хранилище проектных артефактов и Codex-first MVP-контур для обработки архивов документов.

На текущем этапе это рабочий прототип, который помогает превратить входной пакет документов в структурированную карточку проекта, слой извлеченных фактов, журнал анализа и выгружаемый Excel-артефакт для дальнейшей работы.

## Зачем нужен проект

Процесс `coding` обычно начинается с разрозненного комплекта материалов: архивов, технических заданий, документов закупки, ссылок на источник и дополнительных вводных. `scoring` задает для этого процесса единый локальный контур:

- принимает архив проекта и базовые метаданные;
- создает карточку проекта в структуре `год -> месяц -> день -> проект`;
- хранит исходные файлы и служебные артефакты;
- запускает или регистрирует задания анализа;
- фиксирует результат анализа как нормализованный набор полей;
- позволяет вручную проверить и скорректировать карточку;
- выгружает дневной набор проектов в Excel;
- сохраняет воспроизводимый след работы через `mvp/runs/`.

Главная идея проекта — отделить доменную логику coding/scoring от соседних проектов и развивать ее как самостоятельный продуктовый и инженерный контур.

## Текущий статус

Проект находится в стадии локального MVP.

Уже есть:

- backend на `Express`;
- frontend на `React`, `React Router` и `Vite`;
- локальное JSON-хранилище записей;
- загрузка архивов через API;
- создание и обновление карточек проектов;
- очередь/реестр `analysis jobs`;
- локальный analysis adapter, включаемый через переменную окружения;
- экспорт дневной выборки в `.xlsx`;
- smoke-проверка backend, frontend и Excel-экспорта;
- набор архитектурных и workflow-документов.

Пока это не production-сервис: нет многопользовательской модели, полноценной очереди задач, внешней авторизации, промышленного storage-слоя и завершенной интеграции с Bitrix24. Эти части вынесены в следующие этапы развития.

## Основные возможности

### Реестр coding-проектов

Frontend показывает проекты как рабочий реестр с навигацией по календарной структуре. Основные страницы:

- главная панель текущего месяца;
- страница месяца;
- детальная карточка проекта;
- создание проекта из загружаемого архива.

### Загрузка и первичная обработка архивов

Backend принимает архив проекта, сохраняет его в локальное storage-пространство, создает или обновляет запись проекта и формирует связанное задание анализа.

Ключевые endpoints:

- `POST /api/records`
- `POST /api/ingest/archive`
- `POST /api/ai/analyze-archive`

### Analysis jobs

Слой `analysis jobs` отделяет карточку проекта от процесса анализа. Это позволяет:

- создать задание анализа;
- хранить статус выполнения;
- принимать частичные field patches;
- принять финальный результат;
- применять найденные поля к карточке проекта;
- хранить историю изменений задания.

Ключевые endpoints:

- `POST /api/analysis-jobs`
- `GET /api/analysis-jobs/:jobId`
- `PATCH /api/analysis-jobs/:jobId/field-patch`
- `POST /api/analysis-jobs/:jobId/result`

### Codex-first MVP

В `mvp/` зафиксирован минимальный runtime-контур, где каждый запуск процесса живет как отдельная папка:

```text
mvp/runs/<run-id>/
├── input/
├── output/
├── facts.json
├── bitrix-task.json
├── run-log.json
└── summary.md
```

Этот слой нужен, чтобы процесс был воспроизводимым и проверяемым: исходные документы, извлеченные факты, итоговые файлы и журнал запуска лежат рядом.

### Excel-экспорт

Backend умеет собрать дневную выборку проектов в Excel-файл:

```text
GET /api/years/:year/months/:month/days/:day/export
```

Экспорт используется как практический артефакт для передачи результата дальше по процессу.

## Архитектура

Проект устроен как npm workspace с двумя основными приложениями:

```text
scoring/
├── backend/              # Express API, JSON storage, upload, analysis jobs, xlsx export
├── frontend/             # React/Vite web-интерфейс
├── docs/                 # архитектура, процесс coding, UI-референсы, MVP-описания
├── mvp/                  # Codex-first runtime и воспроизводимые runs
├── scripts/              # smoke и служебные проверки
├── storage/              # локальные проектные артефакты
├── tmp/                  # временные файлы
├── .codex-workflow/      # team policy, task board, test scenarios
├── AGENTS.md             # локальные правила development contour
├── AGENT-LOOP.md         # manager/developer/QA цикл работы
├── package.json
└── README.md
```

### Backend

Backend находится в `backend/` и реализован на `Node.js` + `Express`.

Основные зоны ответственности:

- чтение и запись записей проекта;
- построение dashboard/year/month/day представлений;
- прием архивов через `multer`;
- регистрация и обновление заданий анализа;
- применение patches к карточкам проектов;
- запуск локального analysis adapter при включенной настройке;
- генерация Excel-файлов через `exceljs`.

### Frontend

Frontend находится в `frontend/` и реализован на `React`.

Основные маршруты:

```text
/                                # главная панель
/years/:year/months/:month       # страница месяца
/records/:recordId               # карточка проекта
```

Сборка выполняется через `Vite`.

### Документация

Ключевые документы:

- `docs/ARCHITECTURE.md` — архитектурная рамка проекта;
- `docs/CODING-PROCESS.md` — бизнес-процесс coding;
- `docs/CODING-SOLUTION-ARCHITECTURES.md` — варианты архитектуры решения;
- `docs/CODEX-FIRST-MVP.md` — устройство Codex-first MVP;
- `docs/CODING-WEB-ARCHITECTURE.md` — целевая архитектура web-интерфейса;
- `docs/UI-REFERENCE.md` — UI-ориентиры и паттерны;
- `docs/AI-API.md` — контракт AI/API-слоя;
- `.codex-workflow/test-scenarios.md` — smoke и приемочные сценарии.

## Локальный запуск

Требования:

- Node.js;
- npm;
- Windows PowerShell или любой shell, способный запускать npm-скрипты.

Установка зависимостей:

```bash
npm install
```

Запуск backend и frontend вместе:

```bash
npm run dev
```

По умолчанию:

- backend: `http://localhost:4100`;
- frontend: `http://localhost:5173`.

Можно запускать части отдельно:

```bash
npm run dev:backend
npm run dev:frontend
```

Для Windows также есть launcher-файлы:

- `launch-local.ps1`;
- `launch-local.cmd`.

## Проверки

Проверка сборки frontend:

```bash
npm run build
```

Проверка кодировки русскоязычных файлов и UI-источников:

```bash
npm run check:encoding
```

Smoke-проверка:

```bash
npm run smoke
```

Smoke ожидает, что backend и frontend уже запущены на стандартных портах. Проверяются:

- `/api/health`;
- календарные API;
- карточка тестового проекта;
- главная frontend-страница;
- endpoint Excel-экспорта.

## Переменные окружения

### `PORT`

Порт backend-сервера.

По умолчанию:

```text
4100
```

### `SCORING_ENABLE_LOCAL_ANALYSIS_ADAPTER`

Включает endpoint локального analysis adapter:

```text
POST /api/analysis-jobs/:jobId/run-local-adapter
```

Истинные значения:

```text
1, true, yes, on
```

## API-обзор

### Системные endpoints

```text
GET /api/health
GET /api/dashboard
GET /api/ai/providers
```

### Навигация по реестру

```text
GET /api/years
GET /api/years/:year
GET /api/years/:year/months/:month
GET /api/years/:year/months/:month/days/:day
GET /api/years/:year/months/:month/days/:day/export
```

### Карточки проектов

```text
GET    /api/records/:recordId
POST   /api/records
PUT    /api/records/:recordId
DELETE /api/records/:recordId
```

### Анализ

```text
GET   /api/analysis-jobs/statuses
POST  /api/analysis-jobs
GET   /api/analysis-jobs/:jobId
GET   /api/records/:recordId/analysis-jobs
PATCH /api/analysis-jobs/:jobId/field-patch
POST  /api/analysis-jobs/:jobId/result
POST  /api/ai/analyze-archive
```

## Границы проекта

`scoring/` — самостоятельный проект внутри папки `projects/`.

Важные ограничения:

- проект не является частью `Watson`;
- проект не заменяет соседний `estimate`;
- runtime-логика, документы и решения соседних проектов не должны переноситься сюда без явного основания;
- development contour проекта описан в `AGENTS.md`, `AGENT-LOOP.md` и `.codex-workflow/`.

## Roadmap

Ближайшие направления развития:

- усилить contract layer для AI-анализа;
- формализовать review step для результатов анализа;
- расширить UI карточки проекта;
- стабилизировать локальный adapter и сценарии ручной приемки;
- вынести orchestration в отдельный слой при росте процесса;
- подготовить интеграционный adapter для Bitrix24;
- заменить локальное JSON-хранилище на более надежный storage при необходимости.

## Лицензия

Лицензия пока не задана. Перед публикацией репозитория на GitHub стоит явно выбрать режим распространения: private/internal repository без публичной лицензии либо отдельную open-source лицензию.
