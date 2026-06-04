import { useEffect, useMemo, useState } from "react";
import {
  createAnalysisJob,
  fetchAnalysisJob,
  fetchAiProviders,
  fetchRecord,
  fetchRecordAnalysisJobs,
  runDifyAnalysisJob
} from "../../api.js";

const DIFY_POLL_INTERVAL_MS = 2500;
const DIFY_POLL_TIMEOUT_MS = 120000;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed"]);

export function useAnalysisContext({ dirty, onRecordLoaded, recordId }) {
  const [aiProviders, setAiProviders] = useState([]);
  const [analysisJobs, setAnalysisJobs] = useState([]);
  const [difyStatus, setDifyStatus] = useState("idle");
  const [difyMessage, setDifyMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAnalysisContext() {
      try {
        const [providersPayload, jobsPayload] = await Promise.all([
          fetchAiProviders(),
          fetchRecordAnalysisJobs(recordId)
        ]);

        if (!active) {
          return;
        }

        setAiProviders(Array.isArray(providersPayload?.providers) ? providersPayload.providers : []);
        setAnalysisJobs(Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []);
      } catch (_error) {
        if (!active) {
          return;
        }

        setAiProviders([]);
        setAnalysisJobs([]);
      }
    }

    if (recordId) {
      loadAnalysisContext();
    }

    return () => {
      active = false;
    };
  }, [recordId]);

  const difyProvider = useMemo(() => aiProviders.find((provider) => provider.id === "dify") || null, [aiProviders]);
  const difyJobs = useMemo(() => analysisJobs.filter((job) => job.providerId === "dify"), [analysisJobs]);
  const latestDifyJob = difyJobs[0] || null;

  useEffect(() => {
    const latestStatus = String(latestDifyJob?.status || "").trim();

    if (difyStatus !== "running" || !TERMINAL_JOB_STATUSES.has(latestStatus)) {
      return;
    }

    if (latestStatus === "completed") {
      setDifyStatus("success");
      setDifyMessage("Dify AI-pass завершен.");
      return;
    }

    setDifyStatus("error");
    setDifyMessage(buildDifyErrorMessage(latestDifyJob?.error || latestDifyJob?.result?.warnings?.[0] || latestDifyJob));
  }, [difyStatus, latestDifyJob]);

  async function refreshAnalysisContext() {
    const [providersPayload, jobsPayload] = await Promise.all([
      fetchAiProviders(),
      fetchRecordAnalysisJobs(recordId)
    ]);

    setAiProviders(Array.isArray(providersPayload?.providers) ? providersPayload.providers : []);
    setAnalysisJobs(Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []);
  }

  async function handleDifyRun() {
    if (dirty) {
      setDifyStatus("error");
      setDifyMessage("Сначала сохраните изменения карточки.");
      return;
    }

    setDifyStatus("running");
    setDifyMessage("Dify AI-pass запущен. Обычно это занимает до минуты.");
    let activeJobId = "";

    try {
      const jobPayload = await createAnalysisJob({
        recordId,
        providerId: "dify",
        requestedBy: "detail_page",
        metadata: {
          source: "detail_page"
        }
      });
      const jobId = jobPayload?.job?.id;

      if (!jobId) {
        throw new Error("analysis_job_id_missing");
      }

      activeJobId = jobId;
      setAnalysisJobs((currentJobs) => upsertAnalysisJob(currentJobs, jobPayload.job));
      const runPayload = await runDifyAnalysisJob(jobId);
      const completedJob = runPayload?.job || null;
      const nextRecord = runPayload?.record || (await fetchRecord(recordId));

      onRecordLoaded(nextRecord);
      if (completedJob) {
        setAnalysisJobs((currentJobs) => upsertAnalysisJob(currentJobs, completedJob));
      }
      setDifyStatus("success");
      setDifyMessage("Dify AI-pass завершен.");
      await refreshAnalysisContext();
    } catch (difyError) {
      const recovered = await recoverDifyRunAfterError({
        fallbackJobId: activeJobId,
        error: difyError,
        onRecordLoaded,
        recordId,
        refreshAnalysisContext,
        setAnalysisJobs,
        setDifyMessage,
        setDifyStatus
      });

      if (recovered) {
        return;
      }

      setDifyStatus("error");
      setDifyMessage(buildDifyErrorMessage(difyError));

      try {
        await refreshAnalysisContext();
      } catch (_refreshError) {
        // ignore refresh failure after the primary error
      }
    }
  }

  return {
    aiProviders,
    analysisJobs,
    difyMessage,
    difyProvider,
    difyStatus,
    handleDifyRun,
    latestDifyJob,
    refreshAnalysisContext
  };
}

async function recoverDifyRunAfterError({
  error,
  fallbackJobId,
  onRecordLoaded,
  recordId,
  refreshAnalysisContext,
  setAnalysisJobs,
  setDifyMessage,
  setDifyStatus
}) {
  const jobId = normalizeAnalysisJobId(error?.details?.job?.id || error?.job?.id || fallbackJobId);

  if (!jobId) {
    return false;
  }

  setDifyStatus("running");
  setDifyMessage("Запрос прервался, проверяем статус Dify AI-pass.");

  try {
    const completedJob = await waitForAnalysisJob(jobId);

    setAnalysisJobs((currentJobs) => upsertAnalysisJob(currentJobs, completedJob));

    if (completedJob.status === "completed") {
      const nextRecord = await fetchRecord(recordId);
      onRecordLoaded(nextRecord);
      setDifyStatus("success");
      setDifyMessage("Dify AI-pass завершен.");
      await refreshAnalysisContext();
      return true;
    }

    setDifyStatus("error");
    setDifyMessage(buildDifyErrorMessage(completedJob.error || error));
    await refreshAnalysisContext();
    return true;
  } catch (_pollError) {
    return false;
  }
}

async function waitForAnalysisJob(jobId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DIFY_POLL_TIMEOUT_MS) {
    const payload = await fetchAnalysisJob(jobId);
    const job = payload?.job;

    if (job?.status) {
      if (TERMINAL_JOB_STATUSES.has(job.status)) {
        return job;
      }
    }

    await delay(DIFY_POLL_INTERVAL_MS);
  }

  throw new Error("dify_poll_timeout");
}

function upsertAnalysisJob(jobs, nextJob) {
  if (!nextJob?.id) {
    return jobs;
  }

  const withoutCurrent = jobs.filter((job) => job.id !== nextJob.id);
  return [nextJob, ...withoutCurrent];
}

function buildDifyErrorMessage(error) {
  const message = String(error?.message || error?.code || error || "").trim();

  if (!message || /^Request failed:\s*500$/iu.test(message)) {
    return "Dify AI-pass не выполнен. Проверьте статус последнего запуска или повторите попытку.";
  }

  return message;
}

function normalizeAnalysisJobId(value) {
  return String(value || "").trim();
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
