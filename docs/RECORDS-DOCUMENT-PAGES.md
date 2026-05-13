# Records Document Pages

`/records` is the root page for the document-layer navigation.

The page is separate from the scoring project card. It presents project documents as a document index grouped by month and project:

- project archive;
- normalized Markdown documents;
- reverse links to the related scoring project card.

Nested project document pages remain under:

- `/records/:recordId/documents` for the project document list;
- `/records/:recordId/documents/:documentId` for a normalized Markdown document;
- `/records/:recordId/source-folder` for extracted original files.

All user-facing links in this layer must be application-relative. The UI must not expose local filesystem paths, `file://` links, or extractor-local URLs such as `127.0.0.1:4200`.

For now, the root index intentionally lists archives and MD documents only. Original DOCX/PDF/XLSX files are available from the nested project document list and source-folder page.
