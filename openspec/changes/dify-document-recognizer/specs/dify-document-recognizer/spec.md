## ADDED Requirements

### Requirement: Dify recognizer workflow input
Dify recognizer workflow SHALL accept a single JSON input variable named `scoring_payload` that matches backend contract `dify-ai-pass.v1`.

#### Scenario: Backend starts published workflow
- **WHEN** scoring backend calls Dify `/workflows/run`
- **THEN** request inputs SHALL contain `scoring_payload` with `context.contractVersion`, `record`, `selectionCriteriaRows`, `documents`, and `instructions`

#### Scenario: Workflow receives unsupported contract version
- **WHEN** `scoring_payload.context.contractVersion` is not `dify-ai-pass.v1`
- **THEN** workflow SHALL return a valid `result` JSON contract with a warning or error metadata instead of prose

### Requirement: Dify recognizer document source
Dify recognizer workflow SHALL analyze only Markdown/json content supplied inside `scoring_payload.documents` and SHALL NOT use document links, local paths, frontend routes, or machine-local URLs as primary evidence.

#### Scenario: Document contains Markdown
- **WHEN** a payload document contains `markdown`
- **THEN** workflow SHALL use that Markdown as the primary text source for extraction

#### Scenario: Document contains JSON artifacts
- **WHEN** a payload document contains `jsonArtifacts`
- **THEN** workflow SHALL use those artifacts only as structured supporting content tied to the same `documentId`

#### Scenario: Document content is missing
- **WHEN** no payload document contains `markdown` or `jsonArtifacts`
- **THEN** workflow SHALL return a valid `result` with no patch and a warning that document content is missing

### Requirement: Dify recognizer output
Dify recognizer workflow SHALL return its final answer through workflow output `result` as a JSON object or JSON string compatible with scoring backend normalization.

#### Scenario: Successful recognition
- **WHEN** workflow finds values in the supplied documents
- **THEN** `result` SHALL contain `recordPatch`, `selectionCriteriaRows`, `documentFindings`, `warnings`, and `metadata`

#### Scenario: Selection criteria are recognized
- **WHEN** workflow recognizes winner selection criteria
- **THEN** each criteria row SHALL include `group`, `title`, `coverageStatus`, and supporting note or excerpt where available

#### Scenario: Field is not supported by backend patch
- **WHEN** workflow detects a value for an unsupported or document-link field
- **THEN** workflow SHALL NOT include that field in `recordPatch` and MAY include a finding or warning instead

### Requirement: Dify recognizer evidence
Dify recognizer workflow SHALL provide document evidence for meaningful card fields and criteria rows whenever it proposes values.

#### Scenario: Card field is proposed
- **WHEN** workflow includes a field in `recordPatch`
- **THEN** `documentFindings` SHALL include a related `field` or `target`, `documentId`, `quote` or `excerpt`, and `note`

#### Scenario: Evidence is uncertain
- **WHEN** workflow cannot confidently identify a supporting excerpt
- **THEN** workflow SHALL omit the patch field or include a warning explaining that evidence is missing

### Requirement: Dify recognizer publication and smoke
Dify recognizer workflow SHALL be published before production use and SHALL pass scoring backend live smoke before the provider is treated as ready.

#### Scenario: Workflow is not published
- **WHEN** backend calls Dify and the workflow is not executable
- **THEN** scoring SHALL surface a controlled failed analysis job without applying a patch

#### Scenario: Live smoke succeeds
- **WHEN** production-like smoke runs against configured Dify env
- **THEN** provider SHALL be `configured`, job SHALL complete, record fields or criteria SHALL update, and safe diagnostics SHALL contain no secrets, document links, localhost URLs, or local paths
