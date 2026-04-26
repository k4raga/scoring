import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import {
  appendJobHistory,
  createAnalysisJob,
  deleteAnalysisJobsByRecordId,
  getAnalysisJobById,
  getAnalysisJobStatuses,
  listAnalysisJobsByRecordId,
  updateAnalysisJob
} from "./analysis-jobs-store.js";
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
} from "./data-store.js";
import { analyzeArchivePackage, getAiProviders } from "./ai-analysis.js";
import { requestExternalAnalysis } from "./external-analysis-client.js";
import { buildUploadedRecord, ingestArchiveUpload, mergeUploadedRecord } from "./record-ingest.js";
import { getProjectRoot, getStorageProjectsRoot } from "./paths.js";
import { applyRecordPatch } from "./record-patch.js";
import { runLocalAnalysisAdapterPass } from "./local-analysis-adapter.js";
import { createDayWorkbook } from "./xlsx-export.js";

const projectRoot = getProjectRoot();
const storageRoot = getStorageProjectsRoot();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

fs.mkdirSync(storageRoot, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 4100);
const analysisJobStatuses = new Set(getAnalysisJobStatuses());
const localAnalysisAdapterEnabled = readBooleanEnv(process.env.SCORING_ENABLE_LOCAL_ANALYSIS_ADAPTER);

app.use(express.json());
app.use("/assets/docs", express.static(path.join(projectRoot, "docs")));
app.use("/assets/tmp", express.static(path.join(projectRoot, "tmp")));
app.use("/assets/storage", express.static(path.join(projectRoot, "storage")));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "scoring-backend",
    port
  });
});

app.get("/api/dashboard", (_request, response) => {
  const records = loadRecords();
  response.json(getCurrentMonthDashboard(records));
});

app.get("/api/ai/providers", (_request, response) => {
  response.json({
    providers: getAiProviders()
  });
});

app.get("/api/analysis-jobs/statuses", (_request, response) => {
  response.json({
    statuses: getAnalysisJobStatuses()
  });
});

app.post("/api/analysis-jobs", (request, response) => {
  if (!request.body || typeof request.body !== "object") {
    response.status(400).json({ error: "invalid_payload" });
    return;
  }

  const recordId = normalizeOptionalText(request.body.recordId);
  const archive = isObject(request.body.archive) ? request.body.archive : null;

  if (!recordId && !archive) {
    response.status(400).json({ error: "record_or_archive_required" });
    return;
  }

  if (recordId) {
    const records = loadRecords();
    const record = getRecordById(records, recordId);

    if (!record) {
      response.status(404).json({ error: "record_not_found" });
      return;
    }
  }

  const job = createAnalysisJob({
    recordId,
    archive,
    providerId: request.body.providerId || request.body.provider || "",
    requestedBy: request.body.requestedBy || "api",
    requestPayload: {
      hints: isObject(request.body.hints) ? request.body.hints : {},
      metadata: isObject(request.body.metadata) ? request.body.metadata : {}
    },
    status: request.body.status || "queued"
  });

  response.status(201).json({
    accepted: true,
    job
  });
});

app.get("/api/analysis-jobs/:jobId", (request, response) => {
  const job = getAnalysisJobById(request.params.jobId);

  if (!job) {
    response.status(404).json({ error: "analysis_job_not_found" });
    return;
  }

  response.json({ job });
});

app.get("/api/years", (_request, response) => {
  const records = loadRecords();
  response.json({ years: getYears(records) });
});

app.get("/api/years/:year", (request, response) => {
  const records = loadRecords();
  const view = getYearView(records, request.params.year);

  if (!view) {
    response.status(404).json({ error: "year_not_found" });
    return;
  }

  response.json(view);
});

app.get("/api/years/:year/months/:month", (request, response) => {
  const records = loadRecords();
  const view = getMonthView(records, request.params.year, request.params.month);

  response.json(view);
});

app.get("/api/years/:year/months/:month/days/:day", (request, response) => {
  const records = loadRecords();
  const view = getDayView(records, request.params.year, request.params.month, request.params.day);

  if (!view) {
    response.status(404).json({ error: "day_not_found" });
    return;
  }

  response.json(view);
});

app.get("/api/years/:year/months/:month/days/:day/export", async (request, response) => {
  const records = loadRecords();
  const view = getDayView(records, request.params.year, request.params.month, request.params.day);

  if (!view) {
    response.status(404).json({ error: "day_not_found" });
    return;
  }

  const fullRecords = records.filter((record) => record.dayKey === view.dayKey);
  const workbookBuffer = await createDayWorkbook(view, fullRecords);

  response.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  response.setHeader("Content-Disposition", `attachment; filename="scoring-day-${view.dayKey}.xlsx"`);
  response.send(workbookBuffer);
});

app.get("/api/records/:recordId", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  response.json(record);
});

app.get("/api/records/:recordId/analysis-jobs", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  response.json({
    recordId: request.params.recordId,
    jobs: listAnalysisJobsByRecordId(request.params.recordId)
  });
});

app.patch("/api/analysis-jobs/:jobId/field-patch", (request, response) => {
  handleAnalysisJobUpdate(request, response, { defaultStatus: "running", finalResult: false });
});

app.post("/api/analysis-jobs/:jobId/result", (request, response) => {
  handleAnalysisJobUpdate(request, response, { defaultStatus: "completed", finalResult: true });
});

if (localAnalysisAdapterEnabled) {
  app.post("/api/analysis-jobs/:jobId/run-local-adapter", (request, response) => {
    handleLocalAnalysisAdapterRun(request, response);
  });
}

app.post("/api/ai/analyze-archive", upload.single("archive"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "archive_required" });
    return;
  }

  const analysis = analyzeArchivePackage({
    archiveFile: request.file,
    providerId: request.body?.providerId || request.body?.provider,
    hints: {
      title: request.body?.title,
      sourceUrl: request.body?.sourceUrl,
      etpUrl: request.body?.etpUrl
    }
  });

  response.json(analysis);
});

app.delete("/api/records/:recordId", (request, response) => {
  const rawRecords = loadRawRecords();
  const recordIndex = rawRecords.findIndex((record) => record.id === request.params.recordId);

  if (recordIndex === -1) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  const [deletedRecord] = rawRecords.splice(recordIndex, 1);
  saveRecords(rawRecords);

  const deletedArtifacts = deleteProjectArtifacts(deletedRecord);
  const deletedJobs = deleteAnalysisJobsByRecordId(request.params.recordId);

  response.json({
    deleted: true,
    recordId: request.params.recordId,
    artifacts: deletedArtifacts,
    analysisJobsDeleted: deletedJobs
  });
});

app.put("/api/records/:recordId", (request, response) => {
  if (!request.body || typeof request.body !== "object") {
    response.status(400).json({ error: "invalid_payload" });
    return;
  }

  const rawRecords = loadRawRecords();
  const recordIndex = rawRecords.findIndex((record) => record.id === request.params.recordId);

  if (recordIndex === -1) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  const mergedRecord = applyRecordPatch(rawRecords[recordIndex], request.body);
  rawRecords[recordIndex] = mergedRecord;
  saveRecords(rawRecords);

  const records = loadRecords();
  const savedRecord = getRecordById(records, request.params.recordId);

  response.json({
    updated: true,
    record: savedRecord
  });
});

app.post("/api/records", upload.single("archive"), handleArchiveUpload);
app.post("/api/ingest/archive", upload.single("archive"), handleArchiveUpload);

app.listen(port, () => {
  console.log(`scoring-backend listening on http://localhost:${port}`);
});

async function handleArchiveUpload(request, response) {
  if (!request.file) {
    response.status(400).json({ error: "archive_required" });
    return;
  }

  const rawRecords = loadRawRecords();
  const ingest = ingestArchiveUpload({
    archiveFile: request.file,
    title: request.body?.title,
    sourceUrl: request.body?.sourceUrl,
    etpUrl: request.body?.etpUrl
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

  const records = loadRecords();
  const savedRecord = getRecordById(records, ingest.recordId);
  let analysisJob = createAnalysisJob({
    recordId: ingest.recordId,
    archive: {
      name: ingest.archiveName,
      sizeBytes: Number(request.file?.size || request.file?.buffer?.length || 0),
      href: ingest.archiveHref,
      kind: path.extname(ingest.archiveName).replace(/^\./u, "").toLowerCase() || "archive"
    },
    providerId: request.body?.providerId || request.body?.provider || "",
    requestedBy: "create_flow",
    requestPayload: {
      hints: {
        title: request.body?.title || "",
        sourceUrl: request.body?.sourceUrl || "",
        etpUrl: request.body?.etpUrl || ""
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
        title: request.body?.title || "",
        sourceUrl: request.body?.sourceUrl || "",
        etpUrl: request.body?.etpUrl || ""
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
            service: "scoring-analysis",
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

  response.status(created ? 201 : 200).json({
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
  });
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

function handleAnalysisJobUpdate(request, response, { defaultStatus, finalResult }) {
  try {
    const updated = applyAnalysisJobContractUpdate({
      jobId: request.params.jobId,
      body: request.body,
      defaultStatus,
      finalResult
    });

    response.json({
      updated: true,
      job: updated.job,
      record: updated.record
    });
  } catch (error) {
    response.status(Number(error?.httpStatus) || 500).json({
      error: normalizeOptionalText(error?.code) || "analysis_job_update_failed"
    });
  }
}

function handleLocalAnalysisAdapterRun(request, response) {
  const requestedBy = normalizeOptionalText(request.body?.requestedBy) || "local_adapter_endpoint";

  try {
    const executed = runLocalAnalysisAdapterJob({
      jobId: request.params.jobId,
      requestedBy
    });

    response.json({
      executed: true,
      job: executed.job,
      record: executed.record,
      adapter: executed.adapter
    });
  } catch (error) {
    const payload = {
      error: normalizeOptionalText(error?.code) || "local_adapter_execution_failed"
    };

    if (normalizeOptionalText(error?.message)) {
      payload.message = normalizeOptionalText(error.message);
    }

    if (error?.details !== undefined) {
      payload.details = error.details;
    }

    if (error?.job) {
      payload.job = error.job;
    }

    response.status(Number(error?.httpStatus) || 500).json(payload);
  }
}

function runLocalAnalysisAdapterJob({ jobId, requestedBy }) {
  const currentJob = getAnalysisJobById(jobId);

  if (!currentJob) {
    throw createHttpError(404, "analysis_job_not_found");
  }

  if (currentJob.status === "running") {
    throw createHttpError(409, "analysis_job_already_running");
  }

  const records = loadRecords();
  const record = currentJob.recordId ? getRecordById(records, currentJob.recordId) : null;

  if (currentJob.recordId && !record) {
    throw createHttpError(404, "record_not_found_for_job");
  }

  applyAnalysisJobContractUpdate({
    jobId,
    body: {
      status: "running",
      metadata: {
        localAdapter: {
          state: "running",
          requestedBy,
          startedAt: new Date().toISOString()
        }
      }
    },
    defaultStatus: "running",
    finalResult: false
  });

  try {
    const adapterPass = runLocalAnalysisAdapterPass({
      job: getAnalysisJobById(jobId),
      record
    });

    const completed = applyAnalysisJobContractUpdate({
      jobId,
      body: {
        status: "completed",
        warnings: adapterPass.warnings,
        result: adapterPass.result,
        metadata: {
          localAdapter: {
            state: "completed",
            requestedBy,
            finishedAt: new Date().toISOString()
          }
        }
      },
      defaultStatus: "completed",
      finalResult: true
    });

    return {
      ...completed,
      adapter: {
        status: "completed",
        warnings: adapterPass.warnings
      }
    };
  } catch (error) {
    const failedMetadata = {
      localAdapter: {
        state: "failed",
        requestedBy,
        failedAt: new Date().toISOString()
      }
    };
    const failedError = {
      code: normalizeOptionalText(error?.code) || "local_adapter_execution_failed",
      message: normalizeOptionalText(error?.message) || "local_adapter_execution_failed",
      details: error?.details ?? null
    };
    let failedJob = null;

    try {
      const failed = applyAnalysisJobContractUpdate({
        jobId,
        body: {
          status: "failed",
          error: failedError,
          result: {
            analysisMetadata: failedMetadata,
            fields: {},
            recordPatch: {}
          }
        },
        defaultStatus: "failed",
        finalResult: true
      });
      failedJob = failed.job;
    } catch (_updateError) {
      failedJob = getAnalysisJobById(jobId);
    }

    const wrappedError = createHttpError(
      Number(error?.httpStatus) || 500,
      failedError.code,
      failedError.message
    );
    wrappedError.details = failedError.details;
    wrappedError.job = failedJob;
    throw wrappedError;
  }
}

function applyAnalysisJobContractUpdate({ jobId, body, defaultStatus, finalResult }) {
  if (!body || typeof body !== "object") {
    throw createHttpError(400, "invalid_payload");
  }

  const currentJob = getAnalysisJobById(jobId);

  if (!currentJob) {
    throw createHttpError(404, "analysis_job_not_found");
  }

  const payloadResult = isObject(body.result) ? body.result : {};
  const topLevelRecordPatch = isObject(body.recordPatch) ? body.recordPatch : {};
  const fieldPatch = isObject(body.fieldPatch) ? body.fieldPatch : {};
  const payloadRecordPatch = isObject(payloadResult.recordPatch) ? payloadResult.recordPatch : {};
  const recordPatch = {
    ...payloadRecordPatch,
    ...fieldPatch,
    ...topLevelRecordPatch
  };
  const metadata = {
    ...(isObject(payloadResult.analysisMetadata) ? payloadResult.analysisMetadata : {}),
    ...(isObject(payloadResult.metadata) ? payloadResult.metadata : {}),
    ...(isObject(body.metadata) ? body.metadata : {})
  };
  const fields = {
    ...(isObject(payloadResult.fields) ? payloadResult.fields : {}),
    ...(isObject(body.fields) ? body.fields : {})
  };
  const warnings = Array.isArray(body.warnings)
    ? body.warnings
    : Array.isArray(payloadResult.warnings)
      ? payloadResult.warnings
      : undefined;
  const error = body.error ?? payloadResult.error;
  const status = resolveAnalysisJobStatus(body.status, defaultStatus, error);
  const hasRecordPatch = Object.keys(recordPatch).length > 0;
  const hasResultPayload =
    hasRecordPatch ||
    Object.keys(metadata).length > 0 ||
    Object.keys(fields).length > 0 ||
    warnings !== undefined ||
    error !== undefined ||
    isObject(body.result) ||
    normalizeOptionalText(body.status);

  if (!hasResultPayload) {
    throw createHttpError(400, "analysis_payload_required");
  }

  let patchedRecord = null;

  if (hasRecordPatch) {
    if (!currentJob.recordId) {
      throw createHttpError(409, "job_record_binding_required");
    }

    patchedRecord = applyAnalysisPatchToRecord(currentJob.recordId, recordPatch);

    if (!patchedRecord) {
      throw createHttpError(404, "record_not_found_for_job");
    }
  }

  const updatedJob = updateAnalysisJob(jobId, (job) => {
    const currentResult = isObject(job.result) ? job.result : {};
    const nextResult = {
      ...currentResult,
      receivedAt: new Date().toISOString(),
      final: Boolean(finalResult),
      payload: isObject(body.result) ? body.result : currentResult.payload,
      analysisMetadata: {
        ...(isObject(currentResult.analysisMetadata) ? currentResult.analysisMetadata : {}),
        ...metadata
      },
      fields: {
        ...(isObject(currentResult.fields) ? currentResult.fields : {}),
        ...fields
      },
      recordPatch: {
        ...(isObject(currentResult.recordPatch) ? currentResult.recordPatch : {}),
        ...recordPatch
      }
    };

    if (warnings !== undefined) {
      nextResult.warnings = warnings;
    }

    const updated = appendJobHistory(
      {
        ...job,
        status,
        result: nextResult,
        error: error === undefined ? job.error : error
      },
      finalResult ? "result_received" : "field_patch_received",
      {
        finalResult,
        status,
        patchedFields: Object.keys(recordPatch)
      }
    );

    if (patchedRecord && patchedRecord.id) {
      return appendJobHistory(updated, "record_updated", {
        recordId: patchedRecord.id,
        patchedFields: Object.keys(recordPatch)
      });
    }

    return updated;
  });

  if (!updatedJob) {
    throw createHttpError(404, "analysis_job_not_found");
  }

  return {
    job: updatedJob,
    record: patchedRecord
  };
}

function applyAnalysisPatchToRecord(recordId, recordPatch) {
  const rawRecords = loadRawRecords();
  const recordIndex = rawRecords.findIndex((record) => record.id === recordId);

  if (recordIndex === -1) {
    return null;
  }

  rawRecords[recordIndex] = applyRecordPatch(rawRecords[recordIndex], recordPatch);
  saveRecords(rawRecords);

  const records = loadRecords();
  return getRecordById(records, recordId);
}

function resolveAnalysisJobStatus(requestedStatus, fallbackStatus, error) {
  const normalizedRequestedStatus = normalizeOptionalText(requestedStatus).toLowerCase();
  if (analysisJobStatuses.has(normalizedRequestedStatus)) {
    return normalizedRequestedStatus;
  }

  if (error !== undefined && error !== null && error !== "") {
    return "failed";
  }

  return fallbackStatus;
}

function createHttpError(httpStatus, code, message = code) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  error.code = code;
  return error;
}

function readBooleanEnv(value) {
  const normalized = normalizeOptionalText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeOptionalText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
