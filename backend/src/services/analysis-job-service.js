import path from "node:path";
import {
  appendJobHistory,
  createAnalysisJob,
  getAnalysisJobById,
  getAnalysisJobStatuses,
  listAnalysisJobsByRecordId,
  updateAnalysisJob
} from "../analysis-jobs-store.js";
import { getRecordById, loadRecords, loadRawRecords, saveRecords } from "../data-store.js";
import { runDifyAnalysisPass } from "../dify-analysis.js";
import { runLocalAnalysisAdapterPass } from "../local-analysis-adapter.js";
import { applyRecordPatch } from "../record-patch.js";
import {
  buildRecordDocumentsFromExtraction,
  sanitizeExtractionDocuments
} from "./document-service.js";
import { createHttpError, isObject, normalizeOptionalText } from "./http-utils.js";

const analysisJobStatuses = new Set(getAnalysisJobStatuses());

export function createValidatedAnalysisJob(body) {
  if (!body || typeof body !== "object") {
    throw createHttpError(400, "invalid_payload");
  }

  const recordId = normalizeOptionalText(body.recordId);
  const archive = isObject(body.archive) ? body.archive : null;

  if (!recordId && !archive) {
    throw createHttpError(400, "record_or_archive_required");
  }

  if (recordId) {
    const records = loadRecords();
    const record = getRecordById(records, recordId);

    if (!record) {
      throw createHttpError(404, "record_not_found");
    }
  }

  return createAnalysisJob({
    recordId,
    archive,
    providerId: body.providerId || body.provider || "",
    requestedBy: body.requestedBy || "api",
    requestPayload: {
      hints: isObject(body.hints) ? body.hints : {},
      metadata: isObject(body.metadata) ? body.metadata : {}
    },
    status: body.status || "queued"
  });
}

export function getAnalysisJobOrThrow(jobId) {
  const job = getAnalysisJobById(jobId);

  if (!job) {
    throw createHttpError(404, "analysis_job_not_found");
  }

  return job;
}

export function listRecordAnalysisJobs(recordId) {
  const records = loadRecords();
  const record = getRecordById(records, recordId);

  if (!record) {
    throw createHttpError(404, "record_not_found");
  }

  return {
    recordId,
    jobs: listAnalysisJobsByRecordId(recordId)
  };
}

export function applyAnalysisJobContractUpdate({ jobId, body, defaultStatus, finalResult }) {
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

export function runLocalAnalysisAdapterJob({ jobId, requestedBy }) {
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

export async function runDifyAnalysisAdapterJob({ jobId, requestedBy }) {
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
  const safeExtractionDocuments = sanitizeExtractionDocuments(extractionDocuments);
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

export function buildAnalysisExecutionErrorPayload(error, fallbackCode) {
  const payload = {
    error: normalizeOptionalText(error?.code) || fallbackCode
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

  return payload;
}

export function buildAnalysisArchiveDescriptor(ingest, archiveFile) {
  return {
    name: ingest.archiveName,
    sizeBytes: Number(archiveFile?.size || archiveFile?.buffer?.length || 0),
    href: ingest.archiveHref,
    kind: path.extname(ingest.archiveName).replace(/^\./u, "").toLowerCase() || "archive"
  };
}
