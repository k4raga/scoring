## ADDED Requirements

### Requirement: Separate wiki documentation layer
The system SHALL maintain a separate project-level wiki documentation layer that is distinct from original source documents and technical extractor artifacts.

#### Scenario: Project has original documents and generated Markdown
- **WHEN** a project contains uploaded archives, original files, normalized Markdown, generated HTML, and diagnostic JSON
- **THEN** the system SHALL expose original documents, wiki/MD documents, and diagnostic artifacts as distinct document categories

#### Scenario: Wiki layer does not replace source files
- **WHEN** a wiki/MD document exists for an original source document
- **THEN** the original source document SHALL remain accessible from the project documents area

### Requirement: Quartz-compatible knowledge base target
The system SHALL model project wiki/MD documents so they can be published into a separate Quartz-compatible knowledge base containing projects and their related Markdown documents.

#### Scenario: Project has wiki documents
- **WHEN** a project has one or more wiki/MD documents
- **THEN** the system SHALL retain enough metadata to publish the project and those MD documents into a separate navigable knowledge base

#### Scenario: Knowledge base renderer is added later
- **WHEN** a Quartz or compatible static wiki renderer is introduced
- **THEN** the existing project wiki/MD model SHALL be usable as renderer input without redefining the scoring document model

#### Scenario: User navigates from scoring to knowledge base
- **WHEN** a project has a published wiki/knowledge-base page
- **THEN** the project document area SHALL be able to link to that page as a user-facing wiki entry

### Requirement: Automatic compact document links
The system SHALL keep the project card "Документы и ссылки" block compact and generate inline document link rows from normalized document sources and wiki block configuration.

#### Scenario: New extraction artifacts are attached to a project
- **WHEN** extraction completes and returns original documents, normalized Markdown, knowledge HTML, and JSON artifacts
- **THEN** the project card document block SHALL show user-facing rows such as "Требования" with inline "MD" and original-file links without requiring manual data entry

#### Scenario: User needs the full document list
- **WHEN** a project has source documents, generated Markdown, knowledge pages, or diagnostic artifacts
- **THEN** the project card SHALL link to a dedicated project documents page that lists all available document entries

#### Scenario: Project links are deployed to production
- **WHEN** the project is served from any supported host
- **THEN** archive, folder, original-document, and Markdown links SHALL use application-relative routes rather than machine-local paths or extractor-local ports

#### Scenario: Technical artifacts are present
- **WHEN** diagnostic JSON artifacts exist for the project
- **THEN** the full project documents page SHALL place them in a secondary technical/diagnostic group rather than forcing them into the compact project card list

### Requirement: Manual document block management
The system SHALL allow users to manually add, hide, restore, rename, remove, and reorder document blocks in the project document layer without making the project card document block visually heavy.

#### Scenario: User adds a manual block
- **WHEN** a user creates a manual document block with a title and either a URL or text/Markdown body
- **THEN** the block SHALL appear in the configured position in the right-side document block

#### Scenario: User hides a generated block
- **WHEN** a user hides an automatically generated document block
- **THEN** the block SHALL not be shown in the default document view but SHALL remain recoverable

#### Scenario: User reorders blocks
- **WHEN** a user changes the order of document blocks
- **THEN** the right-side document block SHALL preserve that order across page reloads

#### Scenario: User removes a manual block
- **WHEN** a user deletes a manually created block
- **THEN** the block SHALL be removed from the project configuration without deleting original source files or extractor artifacts

### Requirement: Manual overrides survive regeneration
The system SHALL preserve user edits to generated document blocks when document artifacts are regenerated or refreshed.

#### Scenario: User renamed a generated block before regeneration
- **WHEN** extractor artifacts are refreshed for the same project
- **THEN** the user-provided block title SHALL remain in effect for the matching stable block id

#### Scenario: User hid a generated block before regeneration
- **WHEN** extractor artifacts are refreshed for the same project
- **THEN** the hidden state SHALL remain in effect for the matching stable block id

### Requirement: Wiki/MD viewer behavior
The system SHALL provide a readable viewer for wiki/MD documents linked from the project document area.

#### Scenario: User opens a wiki/MD document
- **WHEN** a user clicks a wiki/MD document entry
- **THEN** the system SHALL open a dedicated readable page for that document

#### Scenario: Markdown contains metadata
- **WHEN** a wiki/MD document contains technical metadata or frontmatter
- **THEN** the viewer SHALL visually separate metadata from the main document body

### Requirement: Human-readable Markdown normalization
The system SHALL convert source documents into human-readable normalized Markdown rather than raw unstructured text dumps.

#### Scenario: Source document has visible structure
- **WHEN** a source document contains headings, sections, lists, tables, or repeated labeled fields
- **THEN** the generated Markdown SHALL preserve or reconstruct that structure with Markdown headings, lists, tables, and paragraphs where technically possible

#### Scenario: Source document structure is partially unavailable
- **WHEN** the source format or extraction quality does not allow reliable structure reconstruction
- **THEN** the generated Markdown SHALL still group available text into readable blocks and mark extraction limitations without inventing business meaning

#### Scenario: Markdown normalization runs
- **WHEN** the system normalizes a document into Markdown
- **THEN** it SHALL avoid deciding scoring fields, winners, procurement risks, or other business conclusions

#### Scenario: Tables are extracted
- **WHEN** tabular content can be detected in the source document
- **THEN** the generated Markdown SHALL represent it as a Markdown table or another readable table-like block

### Requirement: Compatibility with existing records
The system SHALL continue to display document links for existing records that only contain legacy `documents` and `documentArtifacts` data.

#### Scenario: Existing record has no wiki configuration
- **WHEN** a project record has no explicit wiki block configuration
- **THEN** the system SHALL derive a default document block from existing document fields

#### Scenario: Existing record has malformed or incomplete document entries
- **WHEN** document entries are missing optional metadata such as group, kind, documentId, or path
- **THEN** the system SHALL still render available labels and links without crashing the project page
