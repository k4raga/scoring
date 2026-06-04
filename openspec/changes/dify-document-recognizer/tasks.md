## 1. OpenSpec и контракт

- [x] 1.1 Создать OpenSpec change `dify-document-recognizer`.
- [x] 1.2 Зафиксировать proposal/design/spec для Dify canvas contract `scoring_payload -> result`.
- [x] 1.3 Добавить delta к `dify-ai-pass` про опубликованный workflow и live output shape.

## 2. Runbook и Dify canvas

- [x] 2.1 Добавить runbook настройки Dify recognizer canvas.
- [x] 2.2 Собрать Dify workflow в аккаунте пользователя: User Input, validation/prep, LLM extraction, final JSON output.
- [x] 2.3 Опубликовать workflow и убедиться, что Dify API key относится к этому workflow/app.
- [x] 2.4 Настроить backend env/secrets локально или в Dokploy без вывода секретов в git/логи.
- [x] 2.5 Подготовить `.env.local` template, gitignore и Docker Compose env passthrough для Dify.

## 3. Backend smoke contract

- [x] 3.1 Усилить mocked Dify smoke проверками input `scoring_payload`, output `result`, document findings и safe diagnostics.
- [x] 3.2 Проверить, что payload не содержит document links, localhost URL, Windows paths или API key.
- [x] 3.3 Добавить `npm run check:dify-live` для проверки опубликованного Dify workflow без печати секретов.
- [x] 3.4 Выполнить production/live smoke канала `scoring_payload -> outputs.result`.
- [x] 3.5 Выполнить production/live smoke распознавания после подключения LLM/code node, возвращающего `recordPatch`, `selectionCriteriaRows` и `documentFindings`.

## 4. Проверка

- [x] 4.1 Прогнать `npm run test:dify`.
- [x] 4.2 Прогнать `npm run smoke:dify`.
- [x] 4.3 Прогнать `npm run build`.
- [x] 4.4 Прогнать `npm run openspec:validate`.
