## MODIFIED Requirements

### Requirement: Заполнение через AI-pass и тестовый extractor
Система SHALL поддерживать заполнение блока критериев через Dify `AI-pass` и SHALL сохранять тестовый extractor как временный источник Markdown/json артефактов в первом integration pass.

#### Scenario: Extractor нашел критерии в документации
- **WHEN** тестовый extractor возвращает критерии из документации
- **THEN** система SHALL записывать их в новую модель блока критериев

#### Scenario: Dify AI-pass нашел критерии в документации
- **WHEN** Dify `AI-pass` возвращает `selectionCriteriaRows` по Markdown/json содержимому документации
- **THEN** система SHALL записывать строки через целевой контракт блока критериев, а не через старую скрытую модель

#### Scenario: AI-pass заменяет тестовый extractor
- **WHEN** `AI-pass` подключается к scoring
- **THEN** система SHALL принимать критерии через тот же целевой контракт блока, а не через старую скрытую модель

#### Scenario: Dify возвращает строку без статуса закрытия
- **WHEN** Dify result содержит критерий или требование без `coverageStatus`
- **THEN** система SHALL отклонить или пометить невалидной эту строку и SHALL NOT сохранять ее как корректную строку блока критериев
