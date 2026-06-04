import fs from "node:fs";
import path from "node:path";
import { createAnalysisJob, deleteAnalysisJobsByRecordId } from "../analysis-jobs-store.js";
import {
  getCurrentMonthDashboard,
  getDayView,
  getMonthView,
  getRecordById,
  getYearView,
  getYears,
  loadRecords,
  loadRawRecords,
  saveRecords
} from "../data-store.js";
import { requestExternalAnalysis } from "../external-analysis-client.js";
import { getStorageProjectsRoot } from "../paths.js";
import { applyRecordPatch } from "../record-patch.js";
import { buildUploadedRecord, ingestArchiveUpload, mergeUploadedRecord } from "../record-ingest.js";
import { createDayWorkbook } from "../xlsx-export.js";
import {
  applyAnalysisJobContractUpdate,
  buildAnalysisArchiveDescriptor
} from "./analysis-job-service.js";
import { createHttpError, normalizeOptionalText } from "./http-utils.js";

const storageRoot = getStorageProjectsRoot();

export function getDashboardPayload() {
  return getCurrentMonthDashboard(loadRecords());
}

export function getYearsPayload() {
  return { years: getYears(loadRecords()) };
}

export function getYearPayload(year) {
  const view = getYearView(loadRecords(), year);

  if (!view) {
    throw createHttpError(404, "year_not_found");
  }

  return view;
}

export function getMonthPayload(year, month) {
  return getMonthView(loadRecords(), year, month);
}

export function getDayPayload(year, month, day) {
  const view = getDayView(loadRecords(), year, month, day);

  if (!view) {
    throw createHttpError(404, "day_not_found");
  }

  return view;
}

export async function createDayExport({ year, month, day }) {
  const records = loadRecords();
  const view = getDayView(records, year, month, day);

  if (!view) {
    throw createHttpError(404, "day_not_found");
  }

  const fullRecords = records.filter((record) => record.dayKey === view.dayKey);
  const workbookBuffer = await createDayWorkbook(view, fullRecords);

  return {
    dayKey: view.dayKey,
    buffer: workbookBuffer
  };
}

export function getRecordOrThrow(recordId) {
  const record = getRecordById(loadRecords(), recordId);

  if (!record) {
    throw createHttpError(404, "record_not_found");
  }

  return record;
}

export function updateRecord(recordId, body) {
  if (!body || typeof body !== "object") {
    throw createHttpError(400, "invalid_payload");
  }

  const rawRecords = loadRawRecords();
  const recordIndex = rawRecords.findIndex((record) => record.id === recordId);

  if (recordIndex === -1) {
    throw createHttpError(404, "record_not_found");
  }

  try {
    rawRecords[recordIndex] = applyRecordPatch(rawRecords[recordIndex], body);
  } catch (error) {
    throw createHttpError(
      400,
      normalizeOptionalText(error?.code) || normalizeOptionalText(error?.message) || "record_patch_invalid"
    );
  }

  saveRecords(rawRecords);

  return {
    updated: true,
    record: getRecordOrThrow(recordId)
  };
}

export function deleteRecord(recordId) {
  const rawRecords = loadRawRecords();
  const recordIndex = rawRecords.findIndex((record) => record.id === recordId);

  if (recordIndex === -1) {
    throw createHttpError(404, "record_not_found");
  }

  const [deletedRecord] = rawRecords.splice(recordIndex, 1);
  saveRecords(rawRecords);

  const deletedArtifacts = deleteProjectArtifacts(deletedRecord);
  const deletedJobs = deleteAnalysisJobsByRecordId(recordId);

  return {
    deleted: true,
    recordId,
    artifacts: deletedArtifacts,
    analysisJobsDeleted: deletedJobs
  };
}

export async function uploadArchiveRecord({ archiveFile, body }) {
  if (!archiveFile) {
    throw createHttpError(400, "archive_required");
  }

  const rawRecords = loadRawRecords();
  const ingest = ingestArchiveUpload({
    archiveFile,
    title: body?.title,
    sourceUrl: body?.sourceUrl,
    etpUrl: body?.etpUrl
  });
  const recordIndex = rawRecords.findIndex((record) => record.id === ingest.recordId);
  const uploadedRecord = buildUploadedRecord(ingest, null);

  let created = false;

  if (recordIndex === -1) {
    rawRecords.push(uploadedRecord);
    created = true;
  } else {
    rawRecords[recordIndex] = mergeUploadedRecord(rawRecords[recordIndex], uploadedRecord);
  }

  saveRecords(rawRecords);

  const savedRecord = getRecordOrThrow(ingest.recordId);
  let analysisJob = createAnalysisJob({
    recordId: ingest.recordId,
    archive: buildAnalysisArchiveDescriptor(ingest, archiveFile),
    providerId: body?.providerId || body?.provider || "",
    requestedBy: "create_flow",
    requestPayload: {
      hints: {
        title: body?.title || "",
        sourceUrl: body?.sourceUrl || "",
        etpUrl: body?.etpUrl || ""
      },
      metadata: {
        createFlow: true
      }
    },
    status: "queued"
  });
  let externalAnalysis = null;
  let finalRecord = savedRecord;

  try {
    const externalPayload = await requestExternalAnalysis({
      archiveHref: ingest.archiveHref,
      archivePath: ingest.archivePath,
      hints: {
        title: body?.title || "",
        sourceUrl: body?.sourceUrl || "",
        etpUrl: body?.etpUrl || ""
      },
      jobId: analysisJob.id,
      recordId: ingest.recordId
    });

    externalAnalysis = externalPayload;

    const completed = applyAnalysisJobContractUpdate({
      jobId: analysisJob.id,
      body: {
        status: "completed",
        result: externalPayload.result,
        warnings: Array.isArray(externalPayload.warnings) ? externalPayload.warnings : undefined
      },
      defaultStatus: "completed",
      finalResult: true
    });

    analysisJob = completed.job;
    finalRecord = completed.record || getRecordById(loadRecords(), ingest.recordId) || savedRecord;
  } catch (error) {
    const failed = applyAnalysisJobContractUpdate({
      jobId: analysisJob.id,
      body: {
        status: "failed",
        error: {
          code: "external_analysis_failed",
          message: error instanceof Error ? error.message : "external_analysis_failed"
        },
        result: {
          analysisMetadata: {
            service: "scoring-extractor",
            compatibility: "legacy_analysis_job",
            state: "failed"
          },
          fields: {},
          recordPatch: {}
        }
      },
      defaultStatus: "failed",
      finalResult: true
    });

    analysisJob = failed.job;
  }

  return {
    status: created ? 201 : 200,
    payload: {
      created,
      record: finalRecord,
      analysis: null,
      externalAnalysis,
      analysisJob,
      folder: {
        relativePath: ingest.relativeProjectFolder,
        absolutePath: ingest.projectFolder
      },
      codexRun: {
        status: "",
        method: "",
        runRoot: ingest.relativeRunRoot,
        scriptPath: ingest.relativeScriptPath
      }
    }
  };
}

function deleteProjectArtifacts(record) {
  const relativeProjectFolder = String(record?.workflow?.projectFolder || "").trim();

  if (!relativeProjectFolder) {
    return {
      folderDeleted: false,
      reason: "project_folder_not_set"
    };
  }

  const projectFolder = path.resolve(storageRoot, path.relative("projects", relativeProjectFolder));
  const relativeFromStorage = path.relative(storageRoot, projectFolder);

  if (
    !relativeFromStorage ||
    relativeFromStorage.startsWith("..") ||
    path.isAbsolute(relativeFromStorage)
  ) {
    return {
      folderDeleted: false,
      reason: "unsafe_project_folder"
    };
  }

  if (!fs.existsSync(projectFolder)) {
    return {
      folderDeleted: false,
      reason: "project_folder_missing"
    };
  }

  fs.rmSync(projectFolder, { recursive: true, force: true });

  return {
    folderDeleted: true,
    relativeProjectFolder
  };
}
