## Why

Сейчас scoring уже хранит карточку проекта, документы, normalized Markdown/json-артефакты и результаты extractor-run, но не имеет явного контракта для передачи этих данных во внешний AI-контур. Из-за этого подключение Dify рискует стать разовой интеграцией с неясными входами, скрытой бизнес-логикой и небезопасной передачей ссылок вместо содержимого документов.

Нужно зафиксировать backend-контракт `AI-pass` через Dify: scoring передает туда данные карточки и содержимое документации, а обратно принимает только структурированный результат, который можно проверить, показать пользователю и применить к карточке.

## What Changes

- Вводится backend-only интеграция с Dify API: frontend не вызывает Dify напрямую и не получает Dify API key.
- Backend формирует Dify payload из всех пользовательских данных карточки, кроме ссылок на документы, и из содержимого документации в виде Markdown/json артефактов.
- Ссылки, локальные пути, machine-local artifact paths и внутренние href не должны быть primary input для Dify.
- Dify должен возвращать строгий структурированный JSON: patch карточки, строки критериев выбора, evidence/findings по документам, предупреждения и технические metadata.
- Backend валидирует ответ Dify перед применением: невалидный JSON, неизвестные поля patch и неподтвержденные структуры не должны молча попадать в запись.
- Интеграция должна использовать текущий контур `analysis-jobs`, чтобы состояние запуска, ошибки, результат и ручное применение результата были видны в существующем workflow.
- Конфигурация Dify хранится только на backend/server side через env/secrets: base URL, API key, app/workflow режим, timeout и response mode.
- Текущий тестовый extractor остается временным источником Markdown/json артефактов и может работать рядом с Dify до замены.
- **BREAKING**: будущий AI-анализ не должен опираться на старую скрытую criteria-модель или document links как достаточный источник данных.

## Capabilities

### New Capabilities

- `dify-ai-pass`: backend-контракт запуска Dify analysis pass, состав входного payload, структура ответа, валидация результата и связь с `analysis-jobs`.

### Modified Capabilities

- `selection-criteria-block`: критерии выбора победителя могут заполняться через Dify `AI-pass` по той же целевой модели строк критериев, которая уже используется в UI.

## Impact

- Backend:
  - новый Dify client/adapter поверх текущего `analysis-jobs`;
  - сбор payload из record view model, Markdown/json artifacts и `selectionCriteriaRows`;
  - валидация Dify response и применение разрешенных patch-полей;
  - env/secrets для Dify без попадания ключей во frontend, git и логи.
- Frontend:
  - минимальное отображение состояния Dify pass через существующие статусы анализа;
  - применение структурированного результата к карточке только через backend API.
- Data/contracts:
  - явный contract для `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, `metadata`;
  - запрет на передачу document links/paths как основного входа для Dify.
- Docs/OpenSpec:
  - новая спецификация `dify-ai-pass`;
  - delta к `selection-criteria-block`, чтобы закрепить заполнение критериев через Dify без возврата к legacy-модели.
