# Sprint: Document Extraction Foundation

## Mandatory Preflight

Перед выполнением любой задачи этого спринта manager обязан прочитать этот документ целиком, а не только ближайший раздел.

Если после чтения выясняется, что задача конфликтует с текущими правилами, границами `scoring` / `scoring-extractor`, promotion flow или manager/worker protocol, сначала нужно обновить постановку и только потом выполнять работу.

## Goal

Отделить нейтральный document extraction контур от основного `scoring` и подготовить архитектуру, в которой документы сначала приводятся к нормализованному MD/JSON виду, а смысловая обработка выполняется отдельным будущим AI/DeFi-контуром.

Сначала перенести source of truth проекта в корпоративный GitLab, затем закрепить production-like тестовый серверный контур, где можно проверять изменения на моковых и тестовых данных максимально близко к production-логике, не затрагивая production-данные.

## Core Principle

`scoring-extractor` не является анализатором и не принимает решений.

Он не должен:

- заполнять поля карточки проекта;
- определять заказчика, предмет закупки, НМЦ, закон закупки или риски как бизнес-вывод;
- интерпретировать требования;
- сокращать документ до "важного";
- переписывать текст своими словами;
- смешивать документы в единый смысловой вывод;
- решать, какой документ к чему относится в бизнес-смысле.

Он должен только:

- принять архив или файл;
- распаковать входной пакет;
- построить инвентарь файлов;
- извлечь доступный текст и структуру;
- нормализовать каждый документ в Markdown;
- сформировать машинно-читаемый JSON manifest;
- сформировать extraction report;
- явно описать fallback для файлов, которые нельзя полноценно извлечь стандартным способом.

## Product Boundary

```text
scoring
- проекты, UI, карточки, workflow;
- загрузка архивов;
- хранение ссылок на extraction artifacts;
- вызов внешнего extractor API.

scoring-extractor
- unpack;
- inventory;
- raw extraction;
- normalized Markdown;
- document JSON manifest;
- extraction quality report;
- fallback descriptors.

future AI/DeFi processing
- смысловой анализ;
- извлечение бизнес-полей;
- проверка противоречий;
- принятие решений;
- формирование patches для scoring.
```

## Execution Guide

Этот раздел является рабочим порядком спринта. Если отдельная задача конфликтует с ним, сначала уточнить архитектурное решение, а не чинить локальный симптом.

### Order of Work

1. Сначала закрепить corporate GitLab как основной source of truth:
   - проверить SSH-доступ;
   - добавить remote;
   - перенести ветки `main` и `rc`;
   - зафиксировать, откуда Dokploy берет production и RC.
2. Затем довести production-like RC/test контур:
   - отдельный домен;
   - отдельные persistent volumes;
   - отдельная ветка `rc`;
   - smoke перед любым production deploy.
3. После этого переименовать и сузить контур `scoring-analysis` до `scoring-extractor`.
4. Затем строить extraction artifacts:
   - оригинальный архив;
   - original documents;
   - normalized Markdown;
   - JSON manifest;
   - extraction report;
   - fallback descriptors.
5. После появления стабильных artifacts подключать viewer / knowledge-base слой.
6. Только после этого проектировать будущую AI/DeFi обработку поверх extraction artifacts.

### Manager / Worker Protocol

Главная консоль ведет этот спринт как manager, а не как бесформенный исполнитель.

Для каждой sprint task manager обязан:

1. прочитать актуальный sprint document перед стартом задачи;
2. сформулировать bounded worker task:
   - цель;
   - write scope;
   - что нельзя менять;
   - критерии приемки;
   - ожидаемые проверки;
3. выдать задачу отдельному worker-агенту, если задача не является маленькой документационной правкой или срочным unblock на критическом пути;
4. после handoff worker-агента не принимать результат автоматически;
5. провести manager acceptance:
   - прочитать измененную поверхность;
   - проверить соответствие архитектурным правилам;
   - выполнить доступные smoke/test checks;
   - зафиксировать остаточные риски;
6. только после acceptance переводить задачу в done/accepted.

Если worker упирается в blocker, manager не останавливает весь спринт. Нужно:

1. зафиксировать blocker в sprint document или handoff;
2. отметить задачу как `blocked`, `partial` или `needs-user-input`;
3. оставить понятный resume point;
4. перейти к следующей задаче, если она не зависит от заблокированной части.

Пример: если GitLab/Dokploy migration не завершается из-за доступа, работа не прекращается. Нужно продолжить реализацию extractor/viewer/knowledge-base по текущему рабочему GitHub/локальному контуру и вернуться к migration после пользовательского вмешательства.

### Final User Acceptance Package

После выполнения всех задач спринта manager должен вернуть пользователю простой проверочный пакет, а не только технический handoff.

В финальном ответе должны быть:

1. ссылка на production или RC, где пользователь может проверить проект;
2. ссылка на wiki/knowledge-base страницу, если она создана;
3. тестовый сценарий в 3-7 шагов без внутренних деталей реализации;
4. список того, что manager уже проверил сам;
5. список известных ограничений или blockers, если они остались;
6. где лежат generated artifacts:
   - оригинальный архив;
   - оригиналы документов;
   - normalized Markdown;
   - JSON manifest/report.

Перед тем как отдавать ссылку пользователю, manager обязан сам открыть доступный URL или выполнить API/browser smoke. Если проверка невозможна, это нужно прямо написать вместе с причиной.

### Promotion Flow

```text
local change
-> push to GitLab rc
-> deploy scoring-rc.w6p.ru
-> smoke on RC
-> user/manager acceptance
-> merge or promote to main
-> deploy scoring.w6p.ru
-> production smoke
```

Нельзя выкатывать новую extraction/knowledge-base логику напрямую в production, если она не прошла RC на тестовых данных.

### Boundary Rules

- `scoring` не парсит документы сам и не импортирует runtime-код extractor.
- `scoring` хранит карточки, UI, workflow и ссылки на artifacts.
- `scoring` вызывает extractor только через внешний API.
- `scoring-extractor` не заполняет бизнес-поля карточки и не принимает решений.
- `scoring-extractor` не сокращает документы до выводов; он сохраняет нормализованное представление и качество извлечения.
- будущий AI/DeFi слой читает artifacts и возвращает отдельный результат обработки, а не подменяет extraction.
- если нужен fallback для картинок, PDF scans, Excel, DOCX или поврежденных файлов, он описывается явно в manifest/report, а не скрывается пустым полем.

### Artifact Rules

Для каждого загруженного пакета должны быть различимы:

1. исходный архив;
2. список исходных файлов;
3. ссылка на каждый оригинал;
4. normalized `.md` для каждого документа, если извлечение возможно;
5. structured JSON manifest;
6. extraction quality/fallback report.

Markdown используется как удобный человекочитаемый слой, но не заменяет оригинальные документы. Оригиналы должны оставаться доступны из карточки проекта и будущей knowledge-base страницы.

### Decision Rules

- Если данных нет, писать `нет информации`, а не угадывать.
- Если источник неоднозначен, сохранять неоднозначность в extraction report.
- Если документ похож на несколько типов, фиксировать кандидаты и confidence/source, но не принимать бизнес-решение.
- Если field-fill нужен для UI, это отдельный слой после extraction, а не обязанность extractor.
- Любая логика, похожая на "выбрать правильный ответ", должна жить вне extractor.

### Definition of Done for Sprint Changes

Каждая существенная задача этого спринта считается закрытой только если:

1. границы `scoring` / `scoring-extractor` не нарушены;
2. изменения проверены локально или причина пропуска проверки записана;
3. RC path описан или фактически пройден;
4. artifacts доступны и не теряют оригиналы;
5. секреты не попали в git;
6. sprint document обновлен, если изменилось архитектурное решение.

## Sprint Task 0: GitLab Migration and Access Runbook

### Objective

Сделать корпоративный GitLab основным source of truth для проекта `scoring`, зафиксировать безопасный runbook доступа и подготовить дальнейший workflow так, чтобы все изменения сначала проходили через тестовый контур, а затем попадали в production.

Эта задача является первой в спринте, потому что дальнейшие изменения extractor/knowledge-base должны выполняться уже от корпоративного GitLab.

### Target Shape

```text
GitLab
- canonical repository;
- branches: main, rc;
- used by Dokploy prod/rc after migration.

GitHub
- current public repository;
- can remain temporary backup until corporate GitLab migration is accepted.
```

### Known GitLab Access

Не хранить приватный SSH-ключ или токены в git.

GitLab web URL:

```text
https://webpractik.gitlab.yandexcloud.net/webpractik/scoring
```

GitLab SSH remote:

```text
git@webpractik.gitlab.yandexcloud.net:webpractik/scoring.git
```

Authenticated GitLab user observed by SSH check:

```text
@k.nikitin
```

Local SSH key path:

```text
C:\Users\illki\.ssh\scoring_gitlab_ed25519
```

Public key title in GitLab:

```text
scoring-codex-deploy
```

SSH check command:

```powershell
ssh -T -i $env:USERPROFILE\.ssh\scoring_gitlab_ed25519 -o IdentitiesOnly=yes git@webpractik.gitlab.yandexcloud.net
```

Expected successful response:

```text
Welcome to GitLab, @k.nikitin!
```

Git command with explicit SSH key:

```powershell
$key = ($env:USERPROFILE + "\.ssh\scoring_gitlab_ed25519").Replace("\","/")
$env:GIT_SSH_COMMAND = "ssh -i `"$key`" -o IdentitiesOnly=yes"
git ls-remote git@webpractik.gitlab.yandexcloud.net:webpractik/scoring.git
Remove-Item Env:GIT_SSH_COMMAND -ErrorAction SilentlyContinue
```

Current check result:

```text
SSH auth works.
git ls-remote with explicit key succeeds.
Remote repository returned no refs, so it appears empty at the time of setup.
```

### Migration Scope

1. Add GitLab remote:

```powershell
git remote add gitlab git@webpractik.gitlab.yandexcloud.net:webpractik/scoring.git
```

2. Push required branches:

```text
main
rc
```

3. Verify remote refs:

```powershell
git ls-remote gitlab
```

4. Update Dokploy source repository:

```text
prod compose -> GitLab repo, branch main
rc compose -> GitLab repo, branch rc
```

5. Deploy RC from GitLab.

6. Run RC smoke.

7. After acceptance, deploy prod from GitLab.

8. Decide final GitHub status:

```text
temporary backup / mirror / deprecated
```

### Acceptance Criteria

1. GitLab remote is added locally.
2. Branch `main` exists in GitLab.
3. Branch `rc` exists in GitLab.
4. Dokploy RC is switched to GitLab `rc`.
5. Dokploy prod is switched to GitLab `main`.
6. RC deploy from GitLab completes successfully.
7. RC smoke passes.
8. Prod deploy from GitLab completes successfully after explicit acceptance.
9. Sprint document contains access runbook without secrets.

### Security Notes

- Never commit private SSH key.
- Never commit GitLab tokens.
- Never paste credentials into `.env`, README, compose, or public workflow docs.
- If temporary API tokens are used later, revoke them after migration.

## Sprint Task 1: Production-like Test Environment

### Objective

Поднять и зафиксировать отдельный тестовый production-like контур на сервере, который повторяет production-архитектуру, но использует отдельные домен, ветку, volumes и тестовые данные.

Эта задача выполняется сразу после GitLab migration, потому что все изменения extractor и будущего AI/DeFi-контура должны проверяться сначала на этом стенде.

### Target Shape

```text
prod
- URL: https://scoring.w6p.ru
- branch: main
- data: production persistent volumes
- purpose: рабочая версия

production-like test / rc
- URL: https://scoring-rc.w6p.ru
- branch: rc
- data: отдельные persistent volumes
- purpose: проверка production-like сценариев на моковых и тестовых данных
```

### Scope

1. Зафиксировать отдельный RC/test-production контур в Dokploy.
2. Убедиться, что RC использует отдельные volumes и не разделяет production-данные.
3. Настроить отдельный домен `scoring-rc.w6p.ru`.
4. Настроить HTTPS для RC.
5. Подготовить mock/test seed policy:
   - тестовые архивы;
   - моковые карточки;
   - сценарии загрузки;
   - сценарии extractor fallback.
6. Зафиксировать promotion flow:
   - локально;
   - push в `rc`;
   - deploy на `scoring-rc.w6p.ru`;
   - smoke на RC;
   - только после приемки merge/push в `main`;
   - deploy на production.
7. Добавить server-side smoke для RC:
   - healthcheck;
   - открытие главной;
   - загрузка тестового архива;
   - проверка extraction stages;
   - удаление тестовой карточки после проверки.

### Acceptance Criteria

1. RC/test-production стенд существует как отдельное Dokploy-приложение или отдельное окружение.
2. RC доступен по отдельному домену.
3. RC не использует production persistent volume.
4. Изменения можно выкатывать в RC из ветки `rc`.
5. Production остается на ветке `main`.
6. Тестовая загрузка архива на RC не создает данных в production.
7. Есть явный smoke-порядок для проверки перед production deploy.
8. DNS/HTTPS для RC доведены до рабочего состояния.

### Current Known State

На момент постановки задачи RC-контур уже частично создан:

```text
branch: rc
Dokploy environment: rc
planned URL: https://scoring-rc.w6p.ru
```

Оставшийся инфраструктурный блок:

```text
DNS A-record:
scoring-rc.w6p.ru -> 155.212.175.100
```

После добавления DNS нужно повторить полноценный browser/API smoke без принудительного local resolve.

### Dokploy Access Runbook

Не хранить Dokploy API key в git. Репозиторий `scoring` публичный, поэтому сырой ключ в workflow-документах, `.env`, compose или README будет утечкой.

Для работы с Dokploy в shell перед выполнением команд нужно задать:

```powershell
$env:DOKPLOY_TOKEN = "<paste current Dokploy API key here>"
```

Dokploy API использует заголовок:

```text
x-api-key: $DOKPLOY_TOKEN
```

Базовый URL:

```text
https://dokploy.w6p.ru
```

GitHub repository:

```text
https://github.com/k4raga/scoring.git
```

Known Dokploy IDs:

```text
Project:
- name: scoring
- projectId: mopak_CR8PlJHkXw39ZCX

Production:
- environmentId: 3I1sj1ZxbIWVdjsYwu5E6
- composeId: lwisfAJIp4H8Dpl_K5B1j
- appName: scoring-91m9rd
- branch: main
- domain: https://scoring.w6p.ru
- domainId: imqH_rshFK1CnZTDEtKIi

RC / production-like test:
- environmentId: syNHM3QdapA3IlCsSMsZS
- composeId: YdpZ1ggmmluR_bFdQBtyL
- appName: scoring-rc-azxjb7
- branch: rc
- domain: https://scoring-rc.w6p.ru
- domainId: gtd1055PEupLsNQEdmgBi
- DNS target: 155.212.175.100
```

Useful API checks:

```powershell
$headers = @{ "x-api-key" = $env:DOKPLOY_TOKEN; accept = "application/json" }
Invoke-RestMethod -Uri "https://dokploy.w6p.ru/api/project.all" -Headers $headers -Method Get
Invoke-RestMethod -Uri "https://dokploy.w6p.ru/api/compose.one?composeId=lwisfAJIp4H8Dpl_K5B1j" -Headers $headers -Method Get
Invoke-RestMethod -Uri "https://dokploy.w6p.ru/api/compose.one?composeId=YdpZ1ggmmluR_bFdQBtyL" -Headers $headers -Method Get
```

Deploy commands:

```powershell
$headers = @{
  "x-api-key" = $env:DOKPLOY_TOKEN
  "Content-Type" = "application/json"
  accept = "application/json"
}

# prod
$body = @{ composeId = "lwisfAJIp4H8Dpl_K5B1j"; title = "Deploy prod"; description = "Deploy main" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://dokploy.w6p.ru/api/compose.deploy" -Headers $headers -Method Post -Body $body

# rc
$body = @{ composeId = "YdpZ1ggmmluR_bFdQBtyL"; title = "Deploy rc"; description = "Deploy rc" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://dokploy.w6p.ru/api/compose.deploy" -Headers $headers -Method Post -Body $body
```

Production health checks:

```powershell
Invoke-WebRequest -Uri "https://scoring.w6p.ru/api/health" -UseBasicParsing
Invoke-WebRequest -Uri "https://scoring.w6p.ru/api/dashboard" -UseBasicParsing
```

RC health checks after DNS:

```powershell
Invoke-WebRequest -Uri "https://scoring-rc.w6p.ru/api/health" -UseBasicParsing
Invoke-WebRequest -Uri "https://scoring-rc.w6p.ru/api/dashboard" -UseBasicParsing
```

RC health checks before DNS propagation:

```powershell
curl.exe -k -I --resolve scoring-rc.w6p.ru:443:155.212.175.100 https://scoring-rc.w6p.ru/api/health
```

## Sprint Task 2: Rename and Redefine `scoring-analysis` as `scoring-extractor`

### Objective

Переименовать и переопределить текущий `scoring-analysis` в нейтральный `scoring-extractor`, который не анализирует документы, а только извлекает и нормализует их содержимое.

### Scope

1. Переименовать runtime-понятия:
   - `scoring-analysis` -> `scoring-extractor`;
   - `analysis service` -> `extractor service`;
   - `analysis stages` -> `extraction stages`, где это относится к preprocessing.

2. Обновить API naming:
   - добавить основной endpoint `POST /api/extract`;
   - старый `POST /api/analyze` оставить как compatibility alias на переходный период.

3. Обновить env:
   - добавить `SCORING_EXTRACTOR_API_BASE_URL`;
   - старую `SCORING_ANALYSIS_API_BASE_URL` оставить fallback на переходный период.

4. Обновить Docker/Dokploy:
   - service name: `scoring-extractor`;
   - volume: `scoring-extractor-runs`;
   - healthcheck: extractor health.

5. Обновить контракт ответа:
   - основной результат: documents, manifest, normalized Markdown links, extraction report, fallback descriptors;
   - `recordPatch` не должен быть основным результатом;
   - если нужен compatibility layer, `recordPatch` должен быть явно legacy/compatibility-only.

6. Обновить тексты в UI/API/docs, если они называют сервис анализатором там, где теперь должен быть extraction/preprocessing.

7. Обновить тесты и smoke-сценарии под новый контракт.

### Initial Output Contract

```json
{
  "ok": true,
  "runId": "20260505-...",
  "input": {
    "recordId": "...",
    "archiveName": "..."
  },
  "stages": [
    { "id": "unpack", "status": "completed" },
    { "id": "inventory", "status": "completed" },
    { "id": "extract", "status": "completed" },
    { "id": "normalize", "status": "completed" }
  ],
  "artifacts": {
    "inventoryJson": "/artifacts/.../inventory.json",
    "documentsJson": "/artifacts/.../documents.json",
    "extractionReportJson": "/artifacts/.../extraction-report.json"
  },
  "documents": [
    {
      "documentId": "doc-001",
      "sourcePath": "docs/example.pdf",
      "fileName": "example.pdf",
      "extension": ".pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 123456,
      "status": "extracted",
      "extraction": {
        "method": "pdf_text",
        "quality": "full",
        "markdownPath": "/artifacts/.../normalized/doc-001.md",
        "textPath": "/artifacts/.../text/doc-001.txt"
      },
      "fallback": null
    }
  ]
}
```

### Fallback Types

Extractor должен явно описывать fallback, но не выполнять бизнес-анализ:

- `ocr_required`;
- `vision_required`;
- `image_file`;
- `pdf_without_text_layer`;
- `password_protected`;
- `unsupported_format`;
- `corrupted_file`;
- `too_large`;
- `empty_text_layer`;
- `manual_review_required`.

Пример:

```json
{
  "documentId": "doc-002",
  "sourcePath": "scheme.png",
  "fileName": "scheme.png",
  "extension": ".png",
  "mimeType": "image/png",
  "status": "needs_fallback",
  "extraction": {
    "method": null,
    "quality": "none",
    "markdownPath": null,
    "textPath": null
  },
  "fallback": {
    "required": true,
    "reason": "image_file",
    "suggestedPipeline": "vision_or_ocr"
  }
}
```

### Acceptance Criteria

1. В коде и документации новый сервис называется `scoring-extractor`.
2. `POST /api/extract` работает.
3. `POST /api/analyze` либо работает как alias, либо явно помечен legacy.
4. Extractor возвращает полный normalized output по документам.
5. Extractor не возвращает бизнес-выводы как основной результат.
6. Extractor не заполняет карточку `scoring`.
7. Backend `scoring` умеет обращаться к extractor через новый env.
8. Текущий пользовательский сценарий загрузки архива не ломается.
9. Docker/Dokploy compose обновлен.
10. Проверки проходят локально и на RC.

### Definition of Done

- `npm run build` проходит;
- unit tests extractor проходят;
- локальный upload smoke проходит;
- RC deploy проходит;
- тестовый архив на RC загружается;
- extraction stages возвращаются как preprocessing/extraction stages;
- production deploy выполняется только после отдельного подтверждения.

## Transition Rule

На первом этапе запрещено ломать текущий пользовательский сценарий. Поэтому допустим временный compatibility layer:

```text
result.extraction   -> новый основной контракт
result.recordPatch  -> legacy compatibility output, временно
```

Следующая задача спринта должна перевести `scoring` на хранение extraction artifacts без зависимости от `recordPatch`.

## Sprint Task 3: Built-in Markdown Artifact Viewer and Document Links Normalization

### Objective

Сделать внутри `scoring` удобный просмотр normalized Markdown-артефактов, которые возвращает `scoring-extractor`, и привести ссылки в карточке проекта к понятной структуре:

```text
исходный архив / source package
normalized markdown documents
machine-readable JSON artifacts
fallback-required files
```

Пользователь должен иметь возможность из карточки проекта открыть не сырой `.md` как файл, а встроенный viewer с нормальным чтением документа.

### Product Rule

Карточка проекта должна различать типы артефактов:

1. Исходный архив:
   - сохраняется как original/source artifact;
   - должен быть доступен для скачивания;
   - не подменяется normalized MD.

2. Normalized Markdown:
   - основной человекочитаемый слой для просмотра извлеченного содержимого;
   - открывается во встроенном viewer;
   - должен быть связан с исходным файлом.

3. JSON artifacts:
   - `inventory.json`;
   - `documents.json`;
   - `extraction-report.json`;
   - используются для машинной обработки и диагностики.

4. Fallback documents:
   - показываются как файлы, для которых нужен OCR/vision/manual review;
   - не должны выглядеть как успешно извлеченные документы.

### Desired UX

В detail project view:

```text
Документы
- Исходный архив
  Скачать архив

- Нормализованные документы
  doc-001.md -> открыть во viewer
  doc-002.md -> открыть во viewer

- Служебные артефакты
  inventory.json
  documents.json
  extraction-report.json

- Требуется fallback
  scheme.png -> vision_or_ocr required
```

Viewer route, предварительный вариант:

```text
/records/:recordId/documents/:documentId
```

или artifact route:

```text
/artifacts/view?href=...
```

Предпочтительно начинать с record-bound route, чтобы viewer жил в контексте проекта и мог показать:

- название проекта;
- имя исходного файла;
- extraction status;
- ссылку на исходный архив;
- markdown content;
- fallback warnings.

### Backend Requirements

1. Нормализовать document links в record model:
   - archive/source artifact отдельно;
   - markdown artifacts отдельно;
   - JSON artifacts отдельно;
   - fallback artifacts отдельно.

2. Добавить endpoint для безопасного чтения MD-артефакта:

```text
GET /api/records/:recordId/documents/:documentId/markdown
```

3. Endpoint должен:
   - проверять, что документ относится к record;
   - не позволять path traversal;
   - читать только разрешенные artifact paths;
   - возвращать markdown text и metadata.

4. Для legacy records без нового extraction output:
   - оставить текущие ссылки на архив;
   - не ломать detail view;
   - показывать пустое состояние normalized documents.

### Frontend Requirements

1. Добавить viewer route:

```text
/records/:recordId/documents/:documentId
```

2. Viewer должен:
   - загружать markdown через backend API;
   - показывать markdown как читабельный документ;
   - поддерживать таблицы хотя бы в базовом виде;
   - показывать metadata документа;
   - иметь возврат в карточку проекта.

3. В detail page:
   - документные ссылки должны быть сгруппированы по типам;
   - archive link должен быть явно подписан как исходный архив;
   - MD links должны открывать viewer, а не скачиваться как сырой файл;
   - fallback-required файлы должны быть визуально отделены.

### Acceptance Criteria

1. У проекта есть отдельный source archive link.
2. Normalized MD-документы отображаются отдельным списком.
3. Клик по MD-документу открывает встроенный viewer.
4. Viewer показывает markdown content и metadata.
5. JSON artifacts не смешиваются с пользовательскими документами.
6. Fallback-required файлы отображаются отдельно и не маркируются как успешно извлеченные.
7. Legacy records без extraction artifacts не ломаются.
8. Проверка проходит на RC с тестовым архивом.

### Open Design Notes

- Если markdown rendering окажется сложным, на первом этапе допустим safe plain markdown viewer с сохранением переносов, заголовков и таблиц как текста.
- Полноценный markdown renderer можно добавить вторым этапом.
- Ссылки на extraction artifacts должны приходить из `scoring-extractor` manifest, а не собираться эвристически во frontend.

## Sprint Task 4: Static Knowledge HTML with Source Originals

### Objective

Сформировать для каждого проекта статическую HTML-базу знаний из normalized Markdown-документов, используя готовый Markdown-to-HTML renderer, предварительно выбранный кандидат: Quartz.

При этом HTML/MD не заменяет исходные файлы. Каждый normalized document должен сохранять явную связь с оригиналом.

### Core Rule

```text
MD/HTML = удобное производное представление
Original file = source of truth
```

Extractor и renderer не должны терять оригиналы и не должны подменять ими normalized output.

### Candidate Renderer

Первичный кандидат:

```text
Quartz
```

Причина:

- строит HTML-site из Markdown corpus;
- близок к Obsidian-like knowledge base;
- поддерживает wikilinks, backlinks, graph view, full-text search;
- подходит для static knowledge artifacts.

Альтернативы, если Quartz не подойдет:

- VitePress;
- MkDocs Material;
- Astro Starlight;
- Docusaurus;
- Eleventy.

### Target Pipeline

```text
archive/source files
-> scoring-extractor
-> normalized/*.md
-> documents.json
-> extraction-report.json
-> knowledge renderer
-> knowledge/index.html
-> knowledge/doc-001.html
-> knowledge/doc-002.html
```

`scoring` должен хранить и показывать ссылку на generated knowledge base:

```text
/assets/storage/projects/<project>/knowledge/index.html
```

### Document Page Requirements

Каждая HTML-страница документа должна показывать:

- readable normalized content;
- source file name;
- source file type;
- extraction status;
- fallback status, если есть;
- link: открыть оригинал;
- link: скачать оригинал;
- link: скачать normalized Markdown, если есть.

Пример:

```text
doc-001.html

Техническое задание

Source:
- file: TZ.docx
- type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
- status: extracted

Actions:
[Открыть оригинал] [Скачать оригинал] [Скачать MD]

Normalized content:
...
```

### Original File Handling

Для каждого документа manifest должен содержать:

```json
{
  "documentId": "doc-001",
  "sourceFileName": "TZ.docx",
  "sourceFileUrl": "/assets/storage/...",
  "sourceMimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "sourceSizeBytes": 123456,
  "normalizedMarkdownUrl": "/assets/storage/.../normalized/doc-001.md",
  "generatedHtmlUrl": "/assets/storage/.../knowledge/doc-001.html",
  "fallback": null
}
```

Типы оригиналов:

- `.docx`: normalized MD/HTML + source DOCX link;
- `.xlsx`: normalized MD/HTML листов/таблиц + source XLSX link;
- `.pdf`: normalized MD/HTML из текстового слоя + source PDF link;
- `.png/.jpg`: source image link + fallback `vision_or_ocr`, если текст не извлечен;
- unsupported/corrupted/password-protected: source link + fallback descriptor.

### Image and Rich Document Rule

Markdown/HTML knowledge base не обязана идеально воспроизводить визуальную верстку оригинала.

Если файл содержит важные изображения, схемы, сканы, подписи или таблицы, которые нельзя надежно извлечь в текст, extractor должен:

- сохранить original source link;
- добавить fallback descriptor;
- не маркировать документ как полноценно extracted.

### Acceptance Criteria

1. Есть spike/demo на Quartz с generated HTML из локального Markdown corpus.
2. Для проекта можно сгенерировать `knowledge/index.html`.
3. HTML knowledge base открывается как static artifact из `scoring`.
4. Каждый generated document page связан с original source file.
5. Original source files доступны для открытия/скачивания.
6. Images/XLSX/DOCX/PDF не теряются при нормализации.
7. Fallback-required файлы видны в knowledge base отдельным состоянием.
8. HTML является производным артефактом и может быть пересобран из MD/JSON.

### Current Spike Result

Локальная Quartz-демка была собрана в:

```text
tmp/quartz-demo
```

Preview:

```text
http://localhost:8099
```

В демо использованы:

- `.codex-workflow/sprint-extractor-foundation.md`;
- `docs/UI-REFERENCE.md`;
- `docs/AI-API.md`.

Первичный вывод: Quartz подходит как кандидат для static knowledge HTML layer, но интеграция должна оставлять `MD + JSON manifest` source of truth и не терять original files.
