import path from "node:path";
import crypto from "node:crypto";
import { extractArchiveMetadata } from "./upload-metadata.js";
import { repairTextEncoding } from "./text-repair.js";

const PROVIDERS = [
  {
    id: "codex-local",
    label: "Codex Local",
    status: "active",
    transport: "local",
    supportsPageEvidence: false,
    supportsDocumentExtraction: false
  },
  {
    id: "tfi",
    label: "TFI",
    status: "planned",
    transport: "remote",
    supportsPageEvidence: true,
    supportsDocumentExtraction: true
  }
];

export function getAiProviders() {
  return PROVIDERS.map((provider) => ({ ...provider }));
}

export function analyzeArchivePackage({
  archiveFile,
  providerId = "codex-local",
  hints = {},
  now = new Date()
}) {
  const provider = resolveProvider(providerId);
  const archiveName = repairTextEncoding(path.basename(archiveFile?.originalname || "source-archive.zip"));
  const metadata = extractArchiveMetadata(archiveName, now);
  const analysisId = crypto.randomUUID();
  const documentId = "archive";
  const document = {
    id: documentId,
    name: archiveName,
    kind: path.extname(archiveName).replace(/^\./u, "").toLowerCase() || "archive",
    pageCount: null
  };

  if (provider.id === "codex-local") {
    return analyzeWithCodexLocal({
      analysisId,
      provider,
      metadata,
      archiveFile,
      document,
      hints
    });
  }

  return {
    analysisId,
    status: "not_supported",
    provider,
    archive: buildArchiveDescriptor(archiveFile, archiveName),
    documents: [document],
    fields: {},
    recordPatch: {},
    warnings: [`provider_${provider.id}_is_not_implemented`]
  };
}

function analyzeWithCodexLocal({ analysisId, provider, metadata, archiveFile, document, hints }) {
  const normalizedTitleHint = normalizeOptionalText(hints.title);
  const normalizedSourceUrl = normalizeOptionalText(hints.sourceUrl);
  const normalizedEtpUrl = normalizeOptionalText(hints.etpUrl);
  const resolvedTitle = normalizedTitleHint || metadata.title;
  const resolvedShortTitle =
    normalizedTitleHint.split(/\s+/u).slice(0, 5).join(" ") || metadata.shortTitle;

  const fields = {
    title: fieldValue(
      resolvedTitle,
      normalizedTitleHint ? 0.98 : 0.55,
      normalizedTitleHint
        ? [requestEvidence("title", normalizedTitleHint)]
        : [fileNameEvidence(document, "Название извлечено из имени архива.")]
    ),
    shortTitle: fieldValue(
      resolvedShortTitle,
      normalizedTitleHint ? 0.92 : 0.5,
      normalizedTitleHint
        ? [requestEvidence("title", normalizedTitleHint)]
        : [fileNameEvidence(document, "Короткое название извлечено из имени архива.")]
    ),
    publishedAt: fieldValue(
      metadata.publishedAt,
      metadata.dateSource === "archive_filename" ? 0.82 : 0.35,
      [
        fileNameEvidence(
          document,
          metadata.dateSource === "archive_filename"
            ? "Дата извлечена из имени архива."
            : "Дата взята из времени загрузки, потому что в имени архива дата не найдена."
        )
      ]
    ),
    sourceUrl: optionalFieldValue(
      normalizedSourceUrl,
      0.99,
      normalizedSourceUrl ? [requestEvidence("sourceUrl", normalizedSourceUrl)] : []
    ),
    etpUrl: optionalFieldValue(
      normalizedEtpUrl,
      0.99,
      normalizedEtpUrl ? [requestEvidence("etpUrl", normalizedEtpUrl)] : []
    )
  };

  return {
    analysisId,
    status: "completed",
    provider,
    archive: buildArchiveDescriptor(archiveFile, document.name),
    documents: [document],
    fields,
    recordPatch: {
      title: fields.title.value,
      shortTitle: fields.shortTitle.value,
      publishedAt: fields.publishedAt.value,
      sourceUrl: fields.sourceUrl.value || "",
      etpUrl: fields.etpUrl.value || ""
    },
    warnings: [
      "content_extraction_not_enabled",
      "page_level_provenance_not_available_for_codex_local_yet"
    ]
  };
}

function resolveProvider(providerId) {
  return getAiProviders().find((provider) => provider.id === providerId) || getAiProviders()[0];
}

function buildArchiveDescriptor(archiveFile, archiveName) {
  return {
    name: archiveName,
    sizeBytes: Number(archiveFile?.size || archiveFile?.buffer?.length || 0)
  };
}

function fieldValue(value, confidence, evidence) {
  return {
    value,
    status: value ? "filled" : "empty",
    confidence,
    evidence
  };
}

function optionalFieldValue(value, confidence, evidence) {
  return fieldValue(value || "", value ? confidence : 0, evidence);
}

function requestEvidence(field, value) {
  return {
    sourceType: "request_payload",
    field,
    documentId: null,
    documentName: null,
    page: null,
    quote: value,
    note: "Значение передано вызывающей стороной API."
  };
}

function fileNameEvidence(document, note) {
  return {
    sourceType: "archive_filename",
    field: null,
    documentId: document.id,
    documentName: document.name,
    page: null,
    quote: document.name,
    note
  };
}

function normalizeOptionalText(value) {
  return repairTextEncoding(String(value || "")).trim();
}
