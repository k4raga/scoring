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
import { runDifyAnalysisPass } from "./dify-analysis.js";
import { requestExternalAnalysis } from "./external-analysis-client.js";
import { buildUploadedRecord, ingestArchiveUpload, mergeUploadedRecord } from "./record-ingest.js";
import { getProjectRoot, getStorageAssetsRoot, getStorageProjectsRoot } from "./paths.js";
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
const frontendDist = normalizeOptionalText(process.env.SCORING_FRONTEND_DIST);

app.use((_request, response, next) => {
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  next();
});

app.use(express.json());
app.use("/assets/docs", express.static(path.join(projectRoot, "docs")));
app.use("/assets/tmp", express.static(path.join(projectRoot, "tmp")));
app.use("/assets/storage", express.static(getStorageAssetsRoot()));

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

app.get("/api/document-records", (_request, response) => {
  const records = loadRecords();
  response.json(buildDocumentRecordsIndex(records));
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

app.get("/api/records/:recordId/documents/:documentId/markdown", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  try {
    const markdownArtifact = resolveRecordMarkdownArtifact(record, request.params.documentId);

    if (!markdownArtifact) {
      response.status(404).json({ error: "document_markdown_not_found" });
      return;
    }

    response.json({
      record: {
        id: record.id,
        title: record.projectTitle || record.title || record.id
      },
      document: markdownArtifact.metadata,
      markdown: fs.readFileSync(markdownArtifact.path, "utf-8")
    });
  } catch (error) {
    response.status(Number(error?.httpStatus) || 500).json({
      error: normalizeOptionalText(error?.code) || "document_markdown_read_failed"
    });
  }
});

app.get("/api/records/:recordId/source-archive", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  try {
    const archiveArtifact = resolveRecordSourceArchive(record);

    if (!archiveArtifact) {
      response.status(404).json({ error: "source_archive_not_found" });
      return;
    }

    response.type(getArtifactContentType(archiveArtifact.path));
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(archiveArtifact.fileName || path.basename(archiveArtifact.path))}`);
    response.sendFile(archiveArtifact.path);
  } catch (error) {
    response.status(Number(error?.httpStatus) || 500).json({
      error: normalizeOptionalText(error?.code) || "source_archive_read_failed"
    });
  }
});

app.get("/api/records/:recordId/source-folder", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

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

  response.json({
    record: {
      id: record.id,
      title: record.projectTitle || record.title || record.id
    },
    folder: {
      label: "Папка распаковки",
      href: `/records/${encodeURIComponent(record.id)}/source-folder`
    },
    documents
  });
});

app.get("/api/records/:recordId/source-documents/:documentId", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  try {
    const sourceArtifact = resolveRecordSourceArtifact(record, request.params.documentId);

    if (!sourceArtifact) {
      response.status(404).json({ error: "source_document_not_found" });
      return;
    }

    response.type(getArtifactContentType(sourceArtifact.path));
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(sourceArtifact.fileName || path.basename(sourceArtifact.path))}`);
    response.sendFile(sourceArtifact.path);
  } catch (error) {
    response.status(Number(error?.httpStatus) || 500).json({
      error: normalizeOptionalText(error?.code) || "source_document_read_failed"
    });
  }
});

app.get("/api/records/:recordId/extraction-artifacts/:artifactKey", (request, response) => {
  const records = loadRecords();
  const record = getRecordById(records, request.params.recordId);

  if (!record) {
    response.status(404).json({ error: "record_not_found" });
    return;
  }

  try {
    const artifactPath = resolveRecordExtractionArtifactPath(record, request.params.artifactKey);

    if (!artifactPath) {
      response.status(404).json({ error: "extraction_artifact_not_found" });
      return;
    }

    response.type(getArtifactContentType(artifactPath));
    response.sendFile(artifactPath);
  } catch (error) {
    response.status(Number(error?.httpStatus) || 500).json({
      error: normalizeOptionalText(error?.code) || "extraction_artifact_read_failed"
    });
  }
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

app.post("/api/analysis-jobs/:jobId/run-dify-adapter", (request, response) => {
  handleDifyAnalysisAdapterRun(request, response);
});

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

  let mergedRecord;

  try {
    mergedRecord = applyRecordPatch(rawRecords[recordIndex], request.body);
  } catch (error) {
    response.status(400).json({
      error: normalizeOptionalText(error?.code) || normalizeOptionalText(error?.message) || "record_patch_invalid"
    });
    return;
  }

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

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(frontendDist, "index.html"));
  });
}

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

async function handleDifyAnalysisAdapterRun(request, response) {
  const requestedBy = normalizeOptionalText(request.body?.requestedBy) || "dify_adapter_endpoint";

  try {
    const executed = await runDifyAnalysisAdapterJob({
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
      error: normalizeOptionalText(error?.code) || "dify_adapter_execution_failed"
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

async function runDifyAnalysisAdapterJob({ jobId, requestedBy }) {
  const currentJob = getAnalysisJobById(jobId);

  if (!currentJob) {
    throw createHttpError(404, "analysis_job_not_found");
  }

  if (currentJob.status === "running") {
    throw createHttpError(409, "analysis_job_already_running");
  }

  const records = loadRecords();
  const record = currentJob.recordId ? getRecordById(records, currentJob.recordId) : null;

  if (!record) {
    throw createHttpError(404, currentJob.recordId ? "record_not_found_for_job" : "job_record_binding_required");
  }

  applyAnalysisJobContractUpdate({
    jobId,
    body: {
      status: "running",
      metadata: {
        dify: {
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
    const adapterPass = await runDifyAnalysisPass({
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
          dify: {
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
      adapter: adapterPass.adapter
    };
  } catch (error) {
    const failedMetadata = {
      dify: {
        state: "failed",
        requestedBy,
        failedAt: new Date().toISOString()
      }
    };
    const failedError = {
      code: normalizeOptionalText(error?.code) || "dify_adapter_execution_failed",
      message: normalizeOptionalText(error?.message) || "dify_adapter_execution_failed",
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
            metadata: failedMetadata,
            fields: {},
            recordPatch: {},
            warnings: [failedError.code]
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
  let recordPatch = {
    ...payloadRecordPatch,
    ...fieldPatch,
    ...topLevelRecordPatch
  };

  if (currentJob.recordId) {
    recordPatch = mergeRecordPatches(
      recordPatch,
      buildExtractionArtifactsPatch(currentJob.recordId, payloadResult)
    );
  }

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

function buildExtractionArtifactsPatch(recordId, payloadResult) {
  const extraction = isObject(payloadResult.extraction) ? payloadResult.extraction : payloadResult;
  const extractionDocuments = Array.isArray(extraction.documents)
    ? extraction.documents
    : Array.isArray(payloadResult.documents)
      ? payloadResult.documents
      : [];
  const safeExtractionDocuments = extractionDocuments.map(sanitizeExtractionDocument);
  const extractionArtifacts = isObject(extraction.artifacts)
    ? extraction.artifacts
    : isObject(payloadResult.artifacts)
      ? payloadResult.artifacts
      : {};

  if (!extractionDocuments.length && !Object.keys(extractionArtifacts).length) {
    return {};
  }

  const rawRecords = loadRawRecords();
  const currentRecord = rawRecords.find((record) => record.id === recordId) || {};
  const workflowExtraction = {
    status: normalizeOptionalText(extraction.status) || normalizeOptionalText(payloadResult.status) || "completed",
    service: normalizeOptionalText(extraction.service) || "scoring-extractor",
    version: normalizeOptionalText(extraction.version),
    runId: normalizeOptionalText(extraction.runId || payloadResult.runId),
    runRoot: normalizeOptionalText(extraction.runRoot),
    normalizedDir: normalizeOptionalText(extraction.normalizedDir),
    archive: isObject(extraction.archive) ? extraction.archive : isObject(payloadResult.archive) ? payloadResult.archive : null,
    artifacts: extractionArtifacts,
    documents: safeExtractionDocuments,
    report: isObject(extraction.report) ? extraction.report : null,
    stages: Array.isArray(extraction.stages) ? extraction.stages : Array.isArray(payloadResult.stages) ? payloadResult.stages : []
  };
  const analysisPatch = {
    ...((isObject(currentRecord.workflow?.analysis) ? currentRecord.workflow.analysis : {})),
    status: workflowExtraction.status,
    service: workflowExtraction.service,
    runId: workflowExtraction.runId,
    runRoot: workflowExtraction.runRoot,
    normalizedDir: workflowExtraction.normalizedDir,
    manifest: normalizeOptionalText(extractionArtifacts.manifestJson || extractionArtifacts.manifest),
    extractionReport: normalizeOptionalText(extractionArtifacts.extractionReportJson || extractionArtifacts.extractionReport),
    artifacts: extractionArtifacts,
    documents: safeExtractionDocuments,
    stages: workflowExtraction.stages
  };

  return {
    documents: buildRecordDocumentsFromExtraction(currentRecord.documents, workflowExtraction, recordId),
    workflow: {
      analysis: analysisPatch,
      extraction: workflowExtraction
    }
  };
}

function buildDocumentRecordsIndex(records) {
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

function buildRecordDocumentsFromExtraction(existingDocuments, extraction, recordId) {
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

function mergeRecordPatches(left, right) {
  if (!isObject(right) || !Object.keys(right).length) {
    return left;
  }

  return {
    ...left,
    ...right,
    workflow: {
      ...(isObject(left.workflow) ? left.workflow : {}),
      ...(isObject(right.workflow) ? right.workflow : {}),
      analysis: {
        ...(isObject(left.workflow?.analysis) ? left.workflow.analysis : {}),
        ...(isObject(right.workflow?.analysis) ? right.workflow.analysis : {})
      },
      extraction: {
        ...(isObject(left.workflow?.extraction) ? left.workflow.extraction : {}),
        ...(isObject(right.workflow?.extraction) ? right.workflow.extraction : {})
      }
    }
  };
}

function resolveRecordMarkdownArtifact(record, documentId) {
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

function resolveRecordSourceArtifact(record, documentId) {
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

function resolveRecordSourceArchive(record) {
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

function resolveRecordExtractionArtifactPath(record, artifactKey) {
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

function resolveExtractorArtifactPath(value) {
  const runsRoot = process.env.SCORING_EXTRACTOR_RUNS_ROOT
    ? path.resolve(process.env.SCORING_EXTRACTOR_RUNS_ROOT)
    : path.resolve(projectRoot, "artifacts", "scoring-extractor", "runs");
  const normalizedValue = normalizeOptionalText(value);
  let candidatePath = "";

  if (!normalizedValue) {
    return "";
  }

  if (path.isAbsolute(normalizedValue)) {
    candidatePath = path.resolve(normalizedValue);
  } else {
    const artifactRelative = extractArtifactRelativePath(normalizedValue);

    if (!artifactRelative) {
      return "";
    }

    candidatePath = path.resolve(runsRoot, artifactRelative);
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

function getArtifactContentType(value) {
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
