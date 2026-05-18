import fs from "node:fs";
import path from "node:path";
import { extractArchiveMetadata, buildSafeSlug } from "./upload-metadata.js";
import { buildProjectFolderParts, buildRecordId } from "./data-store.js";
import { buildLegacyCriteriaGroups, normalizePreassessment, normalizeSelectionCriteriaRows } from "./record-schema.js";
import { getStorageProjectsRoot } from "./paths.js";
import { repairTextEncoding } from "./text-repair.js";

export function ingestArchiveUpload({
  archiveFile,
  title,
  sourceUrl = "",
  etpUrl = "",
  now = new Date()
}) {
  if (!archiveFile) {
    throw new Error("archive_required");
  }

  const storageProjectsRoot = getStorageProjectsRoot();
  const metadata = applyMetadataOverrides(extractArchiveMetadata(archiveFile.originalname, now), title);
  const folderParts = buildProjectFolderParts(metadata.publishedAt, metadata.title);
  const projectFolder = path.join(storageProjectsRoot, ...folderParts);
  const relativeProjectFolder = path.join("projects", ...folderParts).replaceAll("\\", "/");
  const archiveName = sanitizeArchiveFileName(archiveFile.originalname);

  fs.mkdirSync(projectFolder, { recursive: true });

  const archivePath = path.join(projectFolder, archiveName);
  fs.writeFileSync(archivePath, archiveFile.buffer);

  return {
    archiveName,
    archivePath,
    archiveHref: `/assets/storage/${toUrlPath(relativeProjectFolder)}/${encodeURIComponent(archiveName)}`,
    metadata,
    sourceUrl: normalizeOptionalText(sourceUrl),
    etpUrl: normalizeOptionalText(etpUrl),
    projectFolder,
    relativeProjectFolder,
    relativeRunRoot: "",
    relativeScriptPath: null,
    recordId: buildRecordId(metadata.publishedAt, metadata.title)
  };
}

export function buildUploadedRecord(ingest, analysis = null) {
  const archiveHref = ingest.archiveHref;
  const patch = analysis?.recordPatch || {};

  return {
    id: ingest.recordId,
    projectTitle: patch.projectTitle || ingest.metadata.title,
    title: patch.title || ingest.metadata.title,
    shortTitle: patch.shortTitle || ingest.metadata.shortTitle,
    publishedAt: patch.publishedAt || ingest.metadata.publishedAt,
    deadlineAt: null,
    customer: "",
    region: "",
    platform: "Загрузка архива",
    purchaseBy: "",
    sourceUrl: patch.sourceUrl || ingest.sourceUrl || "",
    etpUrl: patch.etpUrl || ingest.etpUrl || "",
    documentsFolderHref: archiveHref,
    googleDocumentsFolderHref: archiveHref,
    nmc: "",
    status: "Нужен анализ",
    stage: "Скоринг",
    priceStatus: "Не заполнено",
    executionWindow: "Не заполнено",
    platformPayment: "",
    applicationSecurity: "",
    contractSecurity: "",
    overallExecutionTerm: "",
    contractTerm: "",
    retrade: "",
    antiDumpingMeasures: "",
    notes: "",
    creative: null,
    requirementsDocumentUrl: archiveHref,
    criteriaDocumentUrl: archiveHref,
    technicalSpecificationUrl: archiveHref,
    summary: `Архив ${ingest.archiveName} загружен. Анализ выполняется внешним сервисом.`,
    criteriaRows: [],
    criteria: buildLegacyCriteriaGroups([]),
    selectionCriteriaRows: normalizeSelectionCriteriaRows(patch.selectionCriteriaRows || patch.selectionCriteria),
    preassessment: normalizePreassessment(patch.preassessment),
    documents: [
      {
        label: "Архив проекта",
        href: ingest.archiveHref,
        kind: "archive",
        fileName: ingest.archiveName
      }
    ],
    workflow: {
      codingFile: "Не сформирован",
      bitrixTaskStatus: "Не создана",
      pageStatus: "Запись создана автоматически",
      projectFolder: ingest.relativeProjectFolder,
      codexRun: {
        status: "",
        method: "",
        runRoot: ingest.relativeRunRoot,
        scriptPath: ingest.relativeScriptPath
      }
    },
    analysis: analysis
  };
}

export function mergeUploadedRecord(existingRecord, uploadedRecord) {
  const existingDocuments = (existingRecord.documents || []).filter((document) => document.kind !== "archive");
  const existingWorkflow = existingRecord.workflow || {};
  const uploadedWorkflow = uploadedRecord.workflow || {};
  const existingCodexRun = existingWorkflow.codexRun || {};
  const uploadedCodexRun = uploadedWorkflow.codexRun || {};
  const analysis = uploadedRecord.analysis || existingRecord.analysis || null;
  const existingSelectionCriteriaRows = normalizeSelectionCriteriaRows(existingRecord.selectionCriteriaRows || existingRecord.selectionCriteria);
  const uploadedSelectionCriteriaRows = normalizeSelectionCriteriaRows(uploadedRecord.selectionCriteriaRows || uploadedRecord.selectionCriteria);
  const selectionCriteriaRows = existingSelectionCriteriaRows.length ? existingSelectionCriteriaRows : uploadedSelectionCriteriaRows;
  const existingPreassessment = normalizePreassessment(existingRecord.preassessment);
  const uploadedPreassessment = normalizePreassessment(uploadedRecord.preassessment);
  const preassessment = hasMeaningfulPreassessment(existingPreassessment) ? existingPreassessment : uploadedPreassessment;

  return {
    ...existingRecord,
    id: uploadedRecord.id,
    projectTitle: existingRecord.projectTitle || uploadedRecord.projectTitle || uploadedRecord.title,
    title: existingRecord.title || uploadedRecord.title,
    shortTitle: existingRecord.shortTitle || uploadedRecord.shortTitle,
    publishedAt: existingRecord.publishedAt || uploadedRecord.publishedAt,
    deadlineAt: existingRecord.deadlineAt ?? uploadedRecord.deadlineAt,
    customer: existingRecord.customer || uploadedRecord.customer,
    region: existingRecord.region || uploadedRecord.region,
    platform: existingRecord.platform || uploadedRecord.platform,
    purchaseBy: existingRecord.purchaseBy || uploadedRecord.purchaseBy || existingRecord.platform || "",
    sourceUrl: existingRecord.sourceUrl || uploadedRecord.sourceUrl,
    etpUrl: existingRecord.etpUrl || uploadedRecord.etpUrl,
    documentsFolderHref: existingRecord.documentsFolderHref || uploadedRecord.documentsFolderHref,
    googleDocumentsFolderHref:
      existingRecord.googleDocumentsFolderHref || uploadedRecord.googleDocumentsFolderHref,
    nmc: existingRecord.nmc || uploadedRecord.nmc || existingRecord.priceStatus || "",
    status: existingRecord.status || uploadedRecord.status,
    stage: existingRecord.stage || uploadedRecord.stage,
    priceStatus: existingRecord.priceStatus || uploadedRecord.priceStatus,
    executionWindow: existingRecord.executionWindow || uploadedRecord.executionWindow,
    platformPayment: existingRecord.platformPayment || uploadedRecord.platformPayment,
    applicationSecurity: existingRecord.applicationSecurity || uploadedRecord.applicationSecurity,
    contractSecurity: existingRecord.contractSecurity || uploadedRecord.contractSecurity,
    overallExecutionTerm: existingRecord.overallExecutionTerm || uploadedRecord.overallExecutionTerm,
    contractTerm: existingRecord.contractTerm || uploadedRecord.contractTerm,
    retrade: existingRecord.retrade || uploadedRecord.retrade,
    antiDumpingMeasures: existingRecord.antiDumpingMeasures || uploadedRecord.antiDumpingMeasures,
    notes: existingRecord.notes || uploadedRecord.notes || existingRecord.summary || "",
    creative: existingRecord.creative ?? uploadedRecord.creative ?? null,
    requirementsDocumentUrl:
      existingRecord.requirementsDocumentUrl || uploadedRecord.requirementsDocumentUrl,
    criteriaDocumentUrl: existingRecord.criteriaDocumentUrl || uploadedRecord.criteriaDocumentUrl,
    technicalSpecificationUrl:
      existingRecord.technicalSpecificationUrl || uploadedRecord.technicalSpecificationUrl,
    summary: existingRecord.summary || uploadedRecord.summary,
    criteriaRows: [],
    criteria: buildLegacyCriteriaGroups([]),
    selectionCriteriaRows,
    preassessment,
    documents: [...existingDocuments, ...(uploadedRecord.documents || [])],
    analysis,
    workflow: {
      ...existingWorkflow,
      ...uploadedWorkflow,
      codingFile: existingWorkflow.codingFile || uploadedWorkflow.codingFile,
      bitrixTaskStatus: existingWorkflow.bitrixTaskStatus || uploadedWorkflow.bitrixTaskStatus,
      pageStatus: existingWorkflow.pageStatus || uploadedWorkflow.pageStatus,
      projectFolder: uploadedWorkflow.projectFolder || existingWorkflow.projectFolder || "",
      codexRun: {
        ...existingCodexRun,
        ...uploadedCodexRun
      }
    }
  };
}

function hasMeaningfulPreassessment(preassessment) {
  return Boolean(
    preassessment.riskRows.length ||
    preassessment.riskBaseUrl ||
    preassessment.summaryDecision ||
    preassessment.alexanderDecision ||
    preassessment.estimateFileUrl
  );
}

function applyMetadataOverrides(metadata, title) {
  const normalizedTitle = normalizeOptionalText(title);

  if (!normalizedTitle) {
    return metadata;
  }

  const shortTitle = normalizedTitle.split(/\s+/u).slice(0, 5).join(" ") || normalizedTitle;

  return {
    ...metadata,
    title: normalizedTitle,
    shortTitle,
    titleSlug: buildSafeSlug(normalizedTitle, "project")
  };
}

function sanitizeArchiveFileName(value) {
  const clean = path.basename(repairTextEncoding(String(value || "source-archive.zip")))
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || "source-archive.zip";
}

function normalizeOptionalText(value) {
  const text = repairTextEncoding(String(value || "")).trim();
  return text || "";
}

function toUrlPath(value) {
  return String(value)
    .split(/[\\/]+/u)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
