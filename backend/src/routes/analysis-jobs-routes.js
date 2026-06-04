import { Router } from "express";
import { getAnalysisJobStatuses } from "../analysis-jobs-store.js";
import {
  applyAnalysisJobContractUpdate,
  buildAnalysisExecutionErrorPayload,
  createValidatedAnalysisJob,
  getAnalysisJobOrThrow,
  listRecordAnalysisJobs,
  runDifyAnalysisAdapterJob,
  runLocalAnalysisAdapterJob
} from "../services/analysis-job-service.js";
import { normalizeOptionalText, sendHttpError } from "../services/http-utils.js";

export function createAnalysisJobsRouter({ localAnalysisAdapterEnabled = false } = {}) {
  const router = Router();

  router.get("/api/analysis-jobs/statuses", (_request, response) => {
    response.json({
      statuses: getAnalysisJobStatuses()
    });
  });

  router.post("/api/analysis-jobs", (request, response) => {
    try {
      response.status(201).json({
        accepted: true,
        job: createValidatedAnalysisJob(request.body)
      });
    } catch (error) {
      sendHttpError(response, error, "analysis_job_create_failed");
    }
  });

  router.get("/api/analysis-jobs/:jobId", (request, response) => {
    try {
      response.json({ job: getAnalysisJobOrThrow(request.params.jobId) });
    } catch (error) {
      sendHttpError(response, error, "analysis_job_read_failed");
    }
  });

  router.get("/api/records/:recordId/analysis-jobs", (request, response) => {
    try {
      response.json(listRecordAnalysisJobs(request.params.recordId));
    } catch (error) {
      sendHttpError(response, error, "record_analysis_jobs_read_failed");
    }
  });

  router.patch("/api/analysis-jobs/:jobId/field-patch", (request, response) => {
    handleAnalysisJobUpdate(request, response, { defaultStatus: "running", finalResult: false });
  });

  router.post("/api/analysis-jobs/:jobId/result", (request, response) => {
    handleAnalysisJobUpdate(request, response, { defaultStatus: "completed", finalResult: true });
  });

  if (localAnalysisAdapterEnabled) {
    router.post("/api/analysis-jobs/:jobId/run-local-adapter", (request, response) => {
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
        response
          .status(Number(error?.httpStatus) || 500)
          .json(buildAnalysisExecutionErrorPayload(error, "local_adapter_execution_failed"));
      }
    });
  }

  router.post("/api/analysis-jobs/:jobId/run-dify-adapter", async (request, response) => {
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
      response
        .status(Number(error?.httpStatus) || 500)
        .json(buildAnalysisExecutionErrorPayload(error, "dify_adapter_execution_failed"));
    }
  });

  return router;
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
    sendHttpError(response, error, "analysis_job_update_failed");
  }
}
