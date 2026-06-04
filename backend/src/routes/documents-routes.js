import path from "node:path";
import { Router } from "express";
import { loadRecords } from "../data-store.js";
import {
  buildDocumentRecordsIndex,
  getArtifactContentType,
  getMarkdownDocumentPayload,
  getSourceFolderPayload,
  resolveRecordExtractionArtifactPath,
  resolveRecordSourceArchive,
  resolveRecordSourceArtifact
} from "../services/document-service.js";
import { createHttpError, sendHttpError } from "../services/http-utils.js";
import { getRecordOrThrow } from "../services/record-service.js";

export function createDocumentsRouter() {
  const router = Router();

  router.get("/api/document-records", (_request, response) => {
    response.json(buildDocumentRecordsIndex(loadRecords()));
  });

  router.get("/api/records/:recordId/documents/:documentId/markdown", (request, response) => {
    try {
      const record = getRecordOrThrow(request.params.recordId);
      response.json(getMarkdownDocumentPayload(record, request.params.documentId));
    } catch (error) {
      sendHttpError(response, error, "document_markdown_read_failed");
    }
  });

  router.get("/api/records/:recordId/source-archive", (request, response) => {
    try {
      const record = getRecordOrThrow(request.params.recordId);
      const archiveArtifact = resolveRecordSourceArchive(record);

      if (!archiveArtifact) {
        throw createHttpError(404, "source_archive_not_found");
      }

      response.type(getArtifactContentType(archiveArtifact.path));
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(archiveArtifact.fileName || path.basename(archiveArtifact.path))}`);
      response.sendFile(archiveArtifact.path);
    } catch (error) {
      sendHttpError(response, error, "source_archive_read_failed");
    }
  });

  router.get("/api/records/:recordId/source-folder", (request, response) => {
    try {
      const record = getRecordOrThrow(request.params.recordId);
      response.json(getSourceFolderPayload(record));
    } catch (error) {
      sendHttpError(response, error, "source_folder_read_failed");
    }
  });

  router.get("/api/records/:recordId/source-documents/:documentId", (request, response) => {
    try {
      const record = getRecordOrThrow(request.params.recordId);
      const sourceArtifact = resolveRecordSourceArtifact(record, request.params.documentId);

      if (!sourceArtifact) {
        throw createHttpError(404, "source_document_not_found");
      }

      response.type(getArtifactContentType(sourceArtifact.path));
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(sourceArtifact.fileName || path.basename(sourceArtifact.path))}`);
      response.sendFile(sourceArtifact.path);
    } catch (error) {
      sendHttpError(response, error, "source_document_read_failed");
    }
  });

  router.get("/api/records/:recordId/extraction-artifacts/:artifactKey", (request, response) => {
    try {
      const record = getRecordOrThrow(request.params.recordId);
      const artifactPath = resolveRecordExtractionArtifactPath(record, request.params.artifactKey);

      if (!artifactPath) {
        throw createHttpError(404, "extraction_artifact_not_found");
      }

      response.type(getArtifactContentType(artifactPath));
      response.sendFile(artifactPath);
    } catch (error) {
      sendHttpError(response, error, "extraction_artifact_read_failed");
    }
  });

  return router;
}
