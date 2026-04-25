import fs from "node:fs";
import path from "node:path";
import { extractArchiveMetadata, buildSafeSlug } from "./upload-metadata.js";
import { buildProjectFolderParts, buildRecordId } from "./data-store.js";
import { buildLegacyCriteriaGroups } from "./record-schema.js";
import { initializeCodexRun } from "./runtime-runner.js";
import { getProjectRoot, getStorageProjectsRoot } from "./paths.js";
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

  const projectRoot = getProjectRoot();
  const storageProjectsRoot = getStorageProjectsRoot();
  const metadata = applyMetadataOverrides(extractArchiveMetadata(archiveFile.originalname, now), title);
  const folderParts = buildProjectFolderParts(metadata.publishedAt, metadata.title);
  const projectFolder = path.join(storageProjectsRoot, ...folderParts);
  const relativeProjectFolder = path.join("projects", ...folderParts).replaceAll("\\", "/");
  const archiveName = sanitizeArchiveFileName(archiveFile.originalname);

  fs.mkdirSync(projectFolder, { recursive: true });

  const archivePath = path.join(projectFolder, archiveName);
  fs.writeFileSync(archivePath, archiveFile.buffer);

  const codexRun = initializeCodexRun({
    archivePath,
    archiveName,
    runSlug: buildSafeSlug(`${metadata.publishedAt}-${metadata.titleSlug}`, "coding-run")
  });

  return {
    archiveName,
    archivePath,
    archiveHref: `/assets/storage/${toUrlPath(relativeProjectFolder)}/${encodeURIComponent(archiveName)}`,
    codexRun,
    metadata,
    sourceUrl: normalizeOptionalText(sourceUrl),
    etpUrl: normalizeOptionalText(etpUrl),
    projectFolder,
    relativeProjectFolder,
    relativeRunRoot: codexRun.runRoot ? path.relative(projectRoot, codexRun.runRoot).replaceAll("\\", "/") : "",
    relativeScriptPath: codexRun.scriptPath ? path.relative(projectRoot, codexRun.scriptPath).replaceAll("\\", "/") : null,
    recordId: buildRecordId(metadata.publishedAt, metadata.title)
  };
}

export function buildUploadedRecord(ingest, analysis = null) {
  const archiveHref = ingest.archiveHref;
  const patch = analysis?.recordPatch || {};

  return {
    id: ingest.recordId,
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
    summary: `Архив ${ingest.archiveName} загружен. Запущен локальный Codex-run.`,
    criteriaRows: [],
    criteria: buildLegacyCriteriaGroups([]),
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
        status: ingest.codexRun.status,
        method: ingest.codexRun.method,
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
  const existingCriteriaRows = normalizeCriteriaRowsLike(existingRecord.criteriaRows || existingRecord.criteria);
  const uploadedCriteriaRows = normalizeCriteriaRowsLike(uploadedRecord.criteriaRows || uploadedRecord.criteria);
  const criteriaRows = existingCriteriaRows.length ? existingCriteriaRows : uploadedCriteriaRows;

  return {
    ...existingRecord,
    id: uploadedRecord.id,
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
    criteriaRows,
    criteria: buildLegacyCriteriaGroups(criteriaRows),
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

function normalizeCriteriaRowsLike(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .map((row) => {
        if (typeof row === "string") {
          return { group: "nonPrice", title: row, kind: "" };
        }

        if (!row || typeof row !== "object") {
          return null;
        }

        return {
          ...row,
          group: normalizeGroupKey(row.group)
        };
      })
      .filter(Boolean);
  }

  if (typeof input === "object") {
    return [
      ...(Array.isArray(input.price)
        ? input.price.map((item) => ({ group: "price", title: item, kind: "" }))
        : []),
      ...(Array.isArray(input.nonPrice)
        ? input.nonPrice.map((item) => ({ group: "nonPrice", title: item, kind: "" }))
        : []),
      ...(Array.isArray(input.hardRequirements)
        ? input.hardRequirements.map((item) => ({ group: "hardRequirements", title: item, kind: "" }))
        : [])
    ];
  }

  return [];
}

function normalizeGroupKey(value) {
  const group = String(value || "").trim();
  if (group === "price" || group === "nonPrice" || group === "hardRequirements") {
    return group;
  }

  return "nonPrice";
}
