import fs from "node:fs";
import path from "node:path";
import { getProjectRoot, getStorageAssetsRoot } from "../paths.js";
import { createHttpError, isObject, normalizeOptionalText } from "./http-utils.js";

const projectRoot = getProjectRoot();

export function buildDocumentRecordsIndex(records) {
  const months = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const project = buildDocumentRecordProject(record);

    if (!project || !project.assets.length) {
      continue;
    }

    const monthKey = `${project.year}-${String(project.month).padStart(2, "0")}`;
    const month = months.get(monthKey) || {
      id: monthKey,
      year: project.year,
      month: project.month,
      projects: []
    };

    month.projects.push(project);
    months.set(monthKey, month);
  }

  const monthList = [...months.values()]
    .map((month) => ({
      ...month,
      projects: month.projects.sort((left, right) => {
        return String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) ||
          String(left.title).localeCompare(String(right.title), "ru-RU");
      })
    }))
    .sort((left, right) => right.id.localeCompare(left.id));

  return {
    months: monthList,
    totals: {
      months: monthList.length,
      projects: monthList.reduce((sum, month) => sum + month.projects.length, 0),
      assets: monthList.reduce((sum, month) => {
        return sum + month.projects.reduce((projectSum, project) => projectSum + project.assets.length, 0);
      }, 0)
    }
  };
}

export function getMarkdownDocumentPayload(record, documentId) {
  const markdownArtifact = resolveRecordMarkdownArtifact(record, documentId);

  if (!markdownArtifact) {
    throw createHttpError(404, "document_markdown_not_found");
  }

  return {
    record: {
      id: record.id,
      title: record.projectTitle || record.title || record.id
    },
    document: markdownArtifact.metadata,
    markdown: fs.readFileSync(markdownArtifact.path, "utf-8")
  };
}

export function getSourceFolderPayload(record) {
  const seenDocumentIds = new Set();
  const documents = collectSourceDocumentCandidates(record)
    .filter((document) => normalizeOptionalText(document.documentId))
    .filter((document) => {
      const documentId = normalizeOptionalText(document.documentId);

      if (seenDocumentIds.has(documentId)) {
        return false;
      }

      seenDocumentIds.add(documentId);
      return true;
    })
    .map((document) => ({
      documentId: normalizeOptionalText(document.documentId),
      fileName: normalizeOptionalText(document.fileName || document.sourceFileName || document.name || document.documentId),
      sourcePath: normalizeOptionalText(document.sourcePath || document.relativePath),
      mimeType: normalizeOptionalText(document.mimeType || document.sourceMimeType),
      sizeBytes: Number(document.sizeBytes || document.sourceSizeBytes || 0),
      status: normalizeOptionalText(document.status),
      href: `/api/records/${encodeURIComponent(record.id)}/source-documents/${encodeURIComponent(normalizeOptionalText(document.documentId))}`
    }));

  return {
    record: {
      id: record.id,
      title: record.projectTitle || record.title || record.id
    },
    folder: {
      label: "Папка распаковки",
      href: `/records/${encodeURIComponent(record.id)}/source-folder`
    },
    documents
  };
}

export function resolveRecordMarkdownArtifact(record, documentId) {
  const normalizedDocumentId = normalizeOptionalText(documentId);
  const candidate = collectMarkdownDocumentCandidates(record).find((document) => {
    return normalizeOptionalText(document.documentId || document.id) === normalizedDocumentId;
  });

  if (!candidate) {
    return null;
  }

  const artifactPath = resolveAllowedMarkdownPath(candidate);

  if (!artifactPath) {
    throw createHttpError(403, "document_markdown_path_not_allowed");
  }

  if (!fs.existsSync(artifactPath)) {
    throw createHttpError(404, "document_markdown_file_not_found");
  }

  return {
    path: artifactPath,
    metadata: {
      documentId: normalizeOptionalText(candidate.documentId || candidate.id),
      label: normalizeOptionalText(candidate.label || candidate.fileName || candidate.name),
      fileName: normalizeOptionalText(candidate.fileName || candidate.name),
      sourceFileName: normalizeOptionalText(candidate.sourceFileName || candidate.fileName || candidate.name),
      sourceFileUrl: normalizeOptionalText(candidate.sourceFileUrl),
      sourcePath: normalizeOptionalText(candidate.sourcePath || candidate.relativePath),
      status: normalizeOptionalText(candidate.status),
      extraction: isObject(candidate.extraction) ? candidate.extraction : {},
      href: normalizeOptionalText(candidate.href || candidate.markdownHref || candidate.mdHref)
    }
  };
}

export function resolveRecordSourceArtifact(record, documentId) {
  const normalizedDocumentId = normalizeOptionalText(documentId);
  const candidate = collectSourceDocumentCandidates(record).find((document) => {
    return normalizeOptionalText(document.documentId || document.id) === normalizedDocumentId;
  });

  if (!candidate) {
    return null;
  }

  const artifactPath = resolveAllowedSourcePath(candidate);

  if (!artifactPath) {
    throw createHttpError(403, "source_document_path_not_allowed");
  }

  if (!fs.existsSync(artifactPath)) {
    throw createHttpError(404, "source_document_file_not_found");
  }

  return {
    path: artifactPath,
    fileName: normalizeOptionalText(candidate.sourceFileName || candidate.fileName || candidate.name)
  };
}

export function resolveRecordSourceArchive(record) {
  const candidate = collectSourceArchiveCandidates(record).find((archive) => {
    const archivePath = resolveAllowedStoragePath(archive.href || archive.path || archive.sourcePath);
    return archivePath && fs.existsSync(archivePath);
  });

  if (!candidate) {
    return null;
  }

  const archivePath = resolveAllowedStoragePath(candidate.href || candidate.path || candidate.sourcePath);

  if (!archivePath) {
    throw createHttpError(403, "source_archive_path_not_allowed");
  }

  if (!fs.existsSync(archivePath)) {
    throw createHttpError(404, "source_archive_file_not_found");
  }

  return {
    path: archivePath,
    fileName: normalizeOptionalText(candidate.fileName || candidate.name || path.basename(archivePath))
  };
}

export function resolveRecordExtractionArtifactPath(record, artifactKey) {
  const normalizedArtifactKey = normalizeOptionalText(artifactKey);
  const artifactSources = [
    record.workflow?.extraction?.artifacts,
    record.workflow?.analysis?.artifacts
  ];

  for (const artifacts of artifactSources) {
    if (!isObject(artifacts)) {
      continue;
    }

    const artifactValue = normalizeOptionalText(artifacts[normalizedArtifactKey]);

    if (!artifactValue) {
      continue;
    }

    const artifactPath = resolveExtractorArtifactPath(artifactValue);

    if (artifactPath && fs.existsSync(artifactPath)) {
      return artifactPath;
    }
  }

  return null;
}

export function buildRecordDocumentsFromExtraction(existingDocuments, extraction, recordId) {
  const existing = Array.isArray(existingDocuments) ? existingDocuments : [];
  const sourceArchives = existing.filter((document) => document?.kind === "archive");
  const legacyDocuments = existing.filter((document) => {
    return !["archive", "normalized_markdown", "json_artifact", "fallback_document"].includes(normalizeOptionalText(document?.kind));
  });
  const markdownDocuments = (Array.isArray(extraction.documents) ? extraction.documents : [])
    .map((document) => buildMarkdownDocumentArtifact(document))
    .filter(Boolean);
  const fallbackDocuments = (Array.isArray(extraction.documents) ? extraction.documents : [])
    .filter((document) => document?.fallback || normalizeOptionalText(document?.status) === "needs_fallback")
    .map((document) => ({
      kind: "fallback_document",
      group: "fallbackDocuments",
      documentId: normalizeOptionalText(document.documentId || document.id),
      label: normalizeOptionalText(document.fileName || document.name || document.documentId || document.id),
      fileName: normalizeOptionalText(document.fileName || document.name),
      sourcePath: normalizeOptionalText(document.sourcePath || document.relativePath),
      status: normalizeOptionalText(document.status),
      fallback: isObject(document.fallback) ? document.fallback : null
    }));
  const jsonArtifacts = Object.entries(isObject(extraction.artifacts) ? extraction.artifacts : {})
    .filter(([key, value]) => normalizeOptionalText(key) && /\.json(?:$|[?#])/iu.test(normalizeOptionalText(value)))
    .map(([key, value]) => ({
      kind: "json_artifact",
      group: "jsonArtifacts",
      artifactKey: key,
      documentId: `artifact-${key}`,
      label: formatArtifactLabel(key),
      fileName: path.basename(normalizeOptionalText(value).split(/[?#]/u)[0]),
      href: normalizeOptionalText(value)
    }));
  const knowledgeArtifacts = buildKnowledgeArtifacts(extraction.artifacts, recordId);

  return uniqueDocumentArtifacts([
    ...legacyDocuments,
    ...sourceArchives,
    ...markdownDocuments,
    ...jsonArtifacts,
    ...knowledgeArtifacts,
    ...fallbackDocuments
  ]);
}

export function getArtifactContentType(value) {
  const extension = path.extname(value).toLowerCase();

  if (extension === ".html" || extension === ".htm") {
    return "text/html; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension === ".md" || extension === ".markdown") {
    return "text/markdown; charset=utf-8";
  }

  if (extension === ".txt") {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
}

function buildDocumentRecordProject(record) {
  const recordId = normalizeOptionalText(record?.id);

  if (!recordId) {
    return null;
  }

  const publishedAt = normalizeOptionalText(record.publishedAt);
  const dateParts = publishedAt.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  const year = Number(record.year || dateParts?.[1] || new Date().getFullYear());
  const month = Number(record.month || dateParts?.[2] || 1);
  const projectHref = `/records/${encodeURIComponent(recordId)}`;
  const documentsHref = `/records/${encodeURIComponent(recordId)}/documents`;
  const assets = [
    ...buildDocumentRecordArchiveAssets(record, recordId, projectHref),
    ...buildDocumentRecordMarkdownAssets(record, recordId, projectHref)
  ];

  return {
    id: recordId,
    title: normalizeOptionalText(record.projectTitle || record.title || recordId),
    publishedAt,
    year,
    month,
    projectHref,
    taskHref: projectHref,
    documentsHref,
    assets
  };
}

function buildDocumentRecordArchiveAssets(record, recordId, projectHref) {
  const archive = collectSourceArchiveCandidates(record)[0];

  if (!archive && !record.documentsFolderHref && !record.googleDocumentsFolderHref) {
    return [];
  }

  return [
    {
      id: "source-archive",
      type: "archive",
      title: normalizeOptionalText(archive?.label || archive?.fileName || archive?.name || "Исходный архив"),
      subtitle: "Полный архив проекта",
      href: `/api/records/${encodeURIComponent(recordId)}/source-archive`,
      projectHref,
      taskHref: projectHref
    }
  ];
}

function buildDocumentRecordMarkdownAssets(record, recordId, projectHref) {
  const seen = new Set();
  const markdownBlocks = Array.isArray(record.documentBlocks?.blocks)
    ? record.documentBlocks.blocks.filter((block) => block?.visible !== false && block?.type === "wiki" && normalizeOptionalText(block.documentId) && !normalizeOptionalText(block.documentId).startsWith("artifact-"))
    : [];
  const markdownDocuments = markdownBlocks.length
    ? markdownBlocks
    : collectMarkdownDocumentCandidates(record);

  return markdownDocuments
    .map((document) => {
      const documentId = normalizeOptionalText(document.documentId || document.id);

      if (!documentId || seen.has(documentId)) {
        return null;
      }

      seen.add(documentId);
      return {
        id: `md-${documentId}`,
        documentId,
        type: "md",
        title: stripExtension(normalizeOptionalText(document.title || document.label || document.sourceFileName || document.fileName || document.name || documentId)),
        subtitle: normalizeOptionalText(document.subtitle || document.sourcePath || document.relativePath || "Markdown"),
        href: `/records/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(documentId)}`,
        projectHref,
        taskHref: projectHref
      };
    })
    .filter(Boolean);
}

function sanitizeExtractionDocument(document) {
  if (!isObject(document)) {
    return document;
  }

  const { text: _text, ...rest } = document;
  return rest;
}

function buildMarkdownDocumentArtifact(document) {
  const extraction = isObject(document.extraction) ? document.extraction : {};
  const href = normalizeOptionalText(extraction.markdownHref || document.markdownHref || document.mdHref);
  const markdownPath = normalizeOptionalText(extraction.markdownPath || document.markdownPath || document.mdPath);
  const documentId = normalizeOptionalText(document.documentId || document.id);

  if (!documentId || (!href && !markdownPath)) {
    return null;
  }

  return {
    kind: "normalized_markdown",
    group: "normalizedMarkdown",
    documentId,
    label: normalizeOptionalText(document.fileName || document.name || `${documentId}.md`),
    fileName: normalizeOptionalText(document.fileName || document.name || `${documentId}.md`),
    href,
    path: markdownPath,
    sourceFileName: normalizeOptionalText(document.fileName || document.name),
    sourcePath: normalizeOptionalText(document.sourcePath || document.relativePath),
    status: normalizeOptionalText(document.status),
    extraction
  };
}

function uniqueDocumentArtifacts(documents) {
  const seen = new Set();
  const result = [];

  for (const document of documents) {
    const key = normalizeOptionalText(document?.documentId) || normalizeOptionalText(document?.href) || normalizeOptionalText(document?.path) || normalizeOptionalText(document?.fileName);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(document);
  }

  return result;
}

function stripExtension(value) {
  return normalizeOptionalText(value).replace(/\.[a-z0-9]{2,8}$/iu, "");
}

function buildKnowledgeArtifacts(artifacts, recordId) {
  if (!isObject(artifacts)) {
    return [];
  }

  return Object.entries(artifacts)
    .filter(([key, value]) => normalizeOptionalText(key) && /\.html?(?:$|[?#])/iu.test(normalizeOptionalText(value)))
    .map(([key, value]) => ({
      kind: "knowledge_html",
      group: "knowledgeArtifacts",
      artifactKey: key,
      documentId: `artifact-${key}`,
      label: key === "knowledgeIndexHtml" ? "База знаний" : formatArtifactLabel(key),
      fileName: path.basename(normalizeOptionalText(value).split(/[?#]/u)[0]),
      href: `/api/records/${encodeURIComponent(recordId)}/extraction-artifacts/${encodeURIComponent(key)}`,
      sourceHref: normalizeOptionalText(value)
    }));
}

function collectSourceArchiveCandidates(record) {
  const documentArtifacts = record.documentArtifacts?.sourceArchives;
  const recordDocuments = record.documents;
  const candidates = [
    ...(Array.isArray(documentArtifacts) ? documentArtifacts : []),
    ...(Array.isArray(recordDocuments) ? recordDocuments.filter((document) => document?.kind === "archive") : [])
  ];

  for (const href of [record.documentsFolderHref, record.googleDocumentsFolderHref]) {
    if (normalizeOptionalText(href)) {
      candidates.push({
        href: normalizeOptionalText(href),
        fileName: path.basename(decodeURIComponent(normalizeOptionalText(href)).replaceAll("\\", "/"))
      });
    }
  }

  return candidates;
}

function collectSourceDocumentCandidates(record) {
  const documentArtifacts = record.documentArtifacts?.originalDocuments;
  const workflowExtractionDocuments = record.workflow?.extraction?.documents;
  const workflowAnalysisDocuments = record.workflow?.analysis?.documents;

  return [
    ...(Array.isArray(documentArtifacts) ? documentArtifacts : []),
    ...(Array.isArray(workflowExtractionDocuments) ? workflowExtractionDocuments : []),
    ...(Array.isArray(workflowAnalysisDocuments) ? workflowAnalysisDocuments : [])
  ].map((document) => ({
    ...document,
    documentId: normalizeOptionalText(document.documentId || document.id),
    sourceFileUrl: normalizeOptionalText(document.sourceFileUrl || document.href),
    sourcePath: normalizeOptionalText(document.sourcePath || document.relativePath),
    fileName: normalizeOptionalText(document.sourceFileName || document.fileName || document.name)
  }));
}

function resolveAllowedSourcePath(document) {
  const candidates = [
    normalizeOptionalText(document.sourceFileUrl || document.href),
    normalizeOptionalText(document.sourcePath)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveExtractorArtifactPath(candidate);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function collectMarkdownDocumentCandidates(record) {
  const documentArtifacts = record.documentArtifacts?.normalizedMarkdown;
  const workflowExtractionDocuments = record.workflow?.extraction?.documents;
  const workflowAnalysisDocuments = record.workflow?.analysis?.documents;
  const recordDocuments = Array.isArray(record.documents) ? record.documents : [];

  return [
    ...(Array.isArray(documentArtifacts) ? documentArtifacts : []),
    ...(Array.isArray(recordDocuments) ? recordDocuments.filter((document) => document.kind === "normalized_markdown" || document.group === "normalizedMarkdown") : []),
    ...(Array.isArray(workflowExtractionDocuments) ? workflowExtractionDocuments : []),
    ...(Array.isArray(workflowAnalysisDocuments) ? workflowAnalysisDocuments : [])
  ].map((document) => {
    const extraction = isObject(document.extraction) ? document.extraction : {};

    return {
      ...document,
      documentId: normalizeOptionalText(document.documentId || document.id),
      href: normalizeOptionalText(document.href || extraction.markdownHref || document.markdownHref || document.mdHref),
      path: normalizeOptionalText(document.path || extraction.markdownPath || document.markdownPath || document.mdPath),
      extraction
    };
  });
}

function resolveAllowedMarkdownPath(document) {
  const rawPath = normalizeOptionalText(document.path || document.extraction?.markdownPath);
  const rawHref = normalizeOptionalText(document.href || document.extraction?.markdownHref);
  const candidates = [rawPath, rawHref].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveExtractorArtifactPath(candidate);

    if (resolved && isMarkdownPath(resolved)) {
      return resolved;
    }
  }

  return null;
}

function resolveAllowedStoragePath(value) {
  const storageAssetsRoot = getStorageAssetsRoot();
  const normalizedValue = normalizeOptionalText(value);
  let candidatePath = "";

  if (!normalizedValue) {
    return "";
  }

  const relativePath = extractStorageRelativePath(normalizedValue);

  if (relativePath) {
    candidatePath = path.resolve(storageAssetsRoot, relativePath);
  } else if (path.isAbsolute(normalizedValue)) {
    candidatePath = path.resolve(normalizedValue);
  } else {
    return "";
  }

  const relativeFromStorage = path.relative(storageAssetsRoot, candidatePath);

  if (!relativeFromStorage || relativeFromStorage.startsWith("..") || path.isAbsolute(relativeFromStorage)) {
    return "";
  }

  return candidatePath;
}

function extractStorageRelativePath(value) {
  try {
    const parsed = new URL(value, "http://localhost");
    const match = decodeURIComponent(parsed.pathname).match(/^\/assets\/storage\/(.+)$/u);
    return match ? match[1] : "";
  } catch (_error) {
    const normalized = value.replaceAll("\\", "/");
    const match = normalized.match(/^\/?assets\/storage\/(.+)$/u);
    return match ? decodeURIComponent(match[1]) : "";
  }
}

function resolveExtractorArtifactPath(value) {
  const runsRoot = process.env.SCORING_EXTRACTOR_RUNS_ROOT
    ? path.resolve(process.env.SCORING_EXTRACTOR_RUNS_ROOT)
    : path.resolve(projectRoot, "artifacts", "scoring-extractor", "runs");
  const normalizedValue = normalizeOptionalText(value);
  let candidatePath = "";

  if (!normalizedValue) {
    return "";
  }

  const artifactRelative = extractArtifactRelativePath(normalizedValue);

  if (artifactRelative) {
    candidatePath = path.resolve(runsRoot, artifactRelative);
  } else if (path.isAbsolute(normalizedValue)) {
    candidatePath = path.resolve(normalizedValue);
  } else {
    return "";
  }

  const relativeFromRuns = path.relative(runsRoot, candidatePath);

  if (!relativeFromRuns || relativeFromRuns.startsWith("..") || path.isAbsolute(relativeFromRuns)) {
    return "";
  }

  return candidatePath;
}

function extractArtifactRelativePath(value) {
  try {
    const parsed = new URL(value);
    const match = decodeURIComponent(parsed.pathname).match(/^\/artifacts\/(.+)$/u);
    return match ? match[1] : "";
  } catch (_error) {
    const normalized = value.replaceAll("\\", "/");
    const match = normalized.match(/^\/?artifacts\/(.+)$/u);
    return match ? decodeURIComponent(match[1]) : "";
  }
}

function isMarkdownPath(value) {
  return /\.md(?:own)?$/iu.test(path.basename(value));
}

function formatArtifactLabel(key) {
  const labels = {
    inventoryJson: "inventory.json",
    documentsJson: "documents.json",
    manifestJson: "manifest.json",
    extractionReportJson: "extraction-report.json",
    legacyDocumentIndexJson: "document-index.json",
    knowledgeIndexHtml: "База знаний"
  };

  return labels[key] || key;
}

export function sanitizeExtractionDocuments(documents) {
  return (Array.isArray(documents) ? documents : []).map(sanitizeExtractionDocument);
}
