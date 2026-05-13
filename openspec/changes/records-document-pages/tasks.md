## 1. Scope Clarification

- [x] 1.1 Confirm the exact root route for the document layer.
- [x] 1.2 Confirm what "обратные ссылки на задачи" means in product terms.
- [x] 1.3 Confirm whether the root index shows only archives and MD, or also original source documents.

## 2. Backend Contract

- [x] 2.1 Define the document index view model grouped by month and project.
- [x] 2.2 Include archive and MD document references for each project.
- [x] 2.3 Include reverse links from document entries to project/task pages.
- [x] 2.4 Ensure all links are application-relative and production-safe.

## 3. Frontend Pages

- [x] 3.1 Add the root document-layer page under `/records`.
- [x] 3.2 Render month and project grouping.
- [x] 3.3 Render archive and MD links in the root index.
- [x] 3.4 Keep or adapt the existing project documents page as the nested document list.
- [x] 3.5 Add reverse links from document pages back to the project/task.

## 4. Verification

- [x] 4.1 Add a smoke check for the root document index.
- [x] 4.2 Add a smoke check for navigating from index to project documents.
- [x] 4.3 Add a smoke check for navigating from a document back to the project/task.
- [x] 4.4 Verify that no document-layer link exposes local filesystem paths or extractor-local ports.
- [x] 4.5 Run `npm run build`.

## 5. Documentation

- [x] 5.1 Document the `/records` document-layer navigation model.
- [x] 5.2 Document how this layer relates to the current project card and MD viewer.
