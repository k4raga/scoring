## ADDED Requirements

### Requirement: Published workflow canvas compatibility
Система SHALL запускать live Dify AI-pass через опубликованный workflow, совместимый с canvas contract `scoring_payload -> result`.

#### Scenario: Backend sends recognizer payload
- **WHEN** backend запускает Dify pass для scoring-записи
- **THEN** Dify request SHALL передать versioned payload в input variable `scoring_payload`

#### Scenario: Backend reads recognizer result
- **WHEN** Dify workflow возвращает blocking response
- **THEN** backend SHALL извлечь JSON contract из `data.outputs.result` или совместимого workflow outputs поля

#### Scenario: Workflow output shape does not match
- **WHEN** Dify workflow возвращает output без валидного `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings` или `metadata` contract
- **THEN** backend SHALL mark analysis job failed or invalid and SHALL NOT mutate the scoring record
