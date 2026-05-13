## 1. Data Model And Mapping

- [x] 1.1 Define the project wiki/document block data shape and stable block id rules.
- [x] 1.2 Implement backend compatibility mapping from existing `documents` and `documentArtifacts` to the new document block view model.
- [x] 1.3 Add generated block grouping for source originals, wiki/MD documents, manual blocks, fallback documents, and diagnostic artifacts.
- [x] 1.4 Add manual override handling for title, visibility, order, and block type without mutating extractor artifacts.
- [x] 1.5 Define Quartz/wiki-compatible metadata for projects and MD documents: stable ids, titles, relations, and publish paths.
- [x] 1.6 Define technical Markdown normalization rules for headings, sections, lists, tables, metadata, and extraction limitation notes.

## 2. Backend API And Persistence

- [x] 2.1 Add or extend record update API support for document wiki/block configuration.
- [x] 2.2 Preserve manual overrides when extraction data is refreshed or record documents are regenerated.
- [x] 2.3 Add validation and defensive normalization for malformed legacy document entries.
- [x] 2.4 Document the backend response contract for the document block view model.

## 3. Frontend Documents Block

- [x] 3.1 Replace right-side document block rendering with the backend-backed document block view model.
- [x] 3.2 Render original/source documents as first-class open/download links.
- [x] 3.3 Render wiki/MD entries separately from diagnostic JSON artifacts.
- [x] 3.4 Add UI controls to add, rename, hide, restore, remove, and reorder document blocks.
- [x] 3.5 Ensure technical diagnostic artifacts are visually secondary and do not dominate the user-facing document block.

## 4. Wiki/MD Viewer

- [x] 4.1 Keep a dedicated readable page for wiki/MD documents.
- [x] 4.2 Separate frontmatter/technical metadata from the main Markdown body.
- [x] 4.3 Add clear navigation back to the project and, where available, a link to the original source document.
- [x] 4.4 Verify that generated Markdown is displayed as structured documentation, not as a raw text dump.

## 5. Verification

- [x] 5.1 Add unit or focused integration checks for document block normalization and override precedence.
- [x] 5.2 Add a smoke scenario for an existing legacy record without wiki configuration.
- [x] 5.3 Add a smoke scenario for a record with extractor artifacts and manual block overrides.
- [x] 5.4 Add a smoke scenario for Markdown normalization quality on a document with headings, lists, and tables.
- [x] 5.5 Run `npm run build` and relevant backend/frontend checks.
- [x] 5.6 Update project documentation describing the source document, wiki/MD, manual block, and diagnostic artifact layers.
- [x] 5.7 Document the future Quartz/wiki knowledge-base contour and how project MD documents map into it.
