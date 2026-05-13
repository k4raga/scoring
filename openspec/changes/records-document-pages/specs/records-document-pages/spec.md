## ADDED Requirements

### Requirement: Records Document Page Layer
The system SHALL provide a separate document page layer under `/records`.

#### Scenario: User opens the document layer root
- **WHEN** the user opens the root page of the document layer
- **THEN** the system SHALL show documents grouped by month and project

#### Scenario: Root page lists project document assets
- **WHEN** a project has archives and normalized Markdown documents
- **THEN** the root page SHALL list those archives and MD documents from the document-layer perspective

#### Scenario: User opens a project from the document layer
- **WHEN** the user selects a project or document folder from the root page
- **THEN** the system SHALL open a nested page with the project's document list

### Requirement: Reverse Links To Project Tasks
The document page layer SHALL provide reverse links from document pages and document entries back to their related project/task.

#### Scenario: User views a document entry
- **WHEN** a document entry is displayed in the document layer
- **THEN** the entry SHALL include a link back to the related project/task page

#### Scenario: User views a nested project document list
- **WHEN** the user is on a nested document list page
- **THEN** the page SHALL include a visible link back to the related project/task page

### Requirement: Production-Safe Document Layer Links
The document page layer SHALL use application-relative routes and SHALL NOT expose machine-local paths.

#### Scenario: Document layer links are rendered
- **WHEN** the root page, nested document list, or document viewer renders links
- **THEN** links SHALL NOT expose `C:\`, `file://`, or extractor-local `127.0.0.1:4200` URLs

#### Scenario: User opens an archive or MD from the document layer
- **WHEN** the user opens an archive or MD document from the document layer
- **THEN** the link SHALL go through the main scoring application route or API route
