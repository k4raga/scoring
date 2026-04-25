import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getAnalysisJobsFilePath } from "./paths.js";

const JOB_STATUS = new Set(["queued", "running", "completed", "failed"]);

export function getAnalysisJobStatuses() {
  return [...JOB_STATUS];
}

export function loadAnalysisJobs() {
  const jobs = readJobs();
  return jobs.sort(byCreatedDesc);
}

export function listAnalysisJobsByRecordId(recordId) {
  return loadAnalysisJobs().filter((job) => job.recordId === recordId);
}

export function getAnalysisJobById(jobId) {
  return loadAnalysisJobs().find((job) => job.id === jobId) ?? null;
}

export function createAnalysisJob({
  recordId = null,
  archive = null,
  providerId = "",
  requestedBy = "api",
  requestPayload = {},
  status = "queued"
} = {}) {
  const jobs = readJobs();
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    recordId: normalizeOptionalText(recordId),
    archive: normalizeArchive(archive),
    providerId: normalizeOptionalText(providerId),
    requestedBy: normalizeOptionalText(requestedBy) || "api",
    status: normalizeStatus(status, "queued"),
    createdAt: now,
    updatedAt: now,
    requestPayload: isObject(requestPayload) ? requestPayload : {},
    result: null,
    error: null,
    history: [buildHistoryEvent("submitted", now, status, { requestPayload })]
  };

  jobs.push(job);
  writeJobs(jobs);
  return job;
}

export function updateAnalysisJob(jobId, mutate) {
  const jobs = readJobs();
  const index = jobs.findIndex((job) => job.id === jobId);

  if (index === -1) {
    return null;
  }

  const previous = jobs[index];
  const draft = cloneJson(previous);
  const maybeNext = mutate(draft, previous);
  const next = maybeNext && isObject(maybeNext) ? maybeNext : draft;
  const normalized = normalizeJob(next, previous, { touch: true });

  jobs[index] = normalized;
  writeJobs(jobs);

  return normalized;
}

export function deleteAnalysisJobsByRecordId(recordId) {
  const jobs = readJobs();
  const filtered = jobs.filter((job) => job.recordId !== recordId);
  const deletedCount = jobs.length - filtered.length;

  if (deletedCount > 0) {
    writeJobs(filtered);
  }

  return deletedCount;
}

export function appendJobHistory(job, event, payload = undefined) {
  const at = new Date().toISOString();
  const history = Array.isArray(job.history) ? [...job.history] : [];
  history.push(buildHistoryEvent(event, at, job.status, payload));
  return {
    ...job,
    history
  };
}

function normalizeJob(job, previous = null, options = {}) {
  const now = new Date().toISOString();
  const updatedAt =
    options.touch === true
      ? now
      : normalizeOptionalText(job.updatedAt) || normalizeOptionalText(previous?.updatedAt) || now;
  const createdAt = normalizeOptionalText(job.createdAt) || normalizeOptionalText(previous?.createdAt) || now;
  const status = normalizeStatus(job.status, previous?.status || "queued");
  const history = Array.isArray(job.history) ? job.history.filter(isObject) : previous?.history || [];

  return {
    ...job,
    id: normalizeOptionalText(job.id) || previous?.id || crypto.randomUUID(),
    recordId: normalizeOptionalText(job.recordId) || "",
    archive: normalizeArchive(job.archive),
    providerId: normalizeOptionalText(job.providerId),
    requestedBy: normalizeOptionalText(job.requestedBy) || "api",
    status,
    createdAt,
    updatedAt,
    requestPayload: isObject(job.requestPayload) ? job.requestPayload : {},
    result: isObject(job.result) ? job.result : null,
    error: normalizeError(job.error),
    history
  };
}

function normalizeArchive(archive) {
  if (!isObject(archive)) {
    return null;
  }

  return {
    name: normalizeOptionalText(archive.name),
    sizeBytes: Number(archive.sizeBytes || 0),
    href: normalizeOptionalText(archive.href),
    kind: normalizeOptionalText(archive.kind)
  };
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      code: "",
      message: error,
      details: null
    };
  }

  if (!isObject(error)) {
    return {
      code: "",
      message: String(error),
      details: null
    };
  }

  return {
    code: normalizeOptionalText(error.code),
    message: normalizeOptionalText(error.message) || "analysis_failed",
    details: error.details ?? null
  };
}

function buildHistoryEvent(event, at, status, payload = undefined) {
  return {
    at,
    event: normalizeOptionalText(event) || "updated",
    status: normalizeStatus(status, "queued"),
    payload: payload === undefined ? null : payload
  };
}

function normalizeStatus(value, fallback) {
  const status = normalizeOptionalText(value).toLowerCase();
  return JOB_STATUS.has(status) ? status : fallback;
}

function readJobs() {
  const jobsFile = getAnalysisJobsFilePath();
  ensureJobsFile(jobsFile);

  try {
    const parsed = JSON.parse(fs.readFileSync(jobsFile, "utf-8"));
    return Array.isArray(parsed)
      ? parsed.filter(isObject).map((job) => normalizeJob(job, null, { touch: false }))
      : [];
  } catch (_error) {
    return [];
  }
}

function writeJobs(jobs) {
  const jobsFile = getAnalysisJobsFilePath();
  ensureJobsFile(jobsFile);
  fs.writeFileSync(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf-8");
}

function ensureJobsFile(jobsFile) {
  const parent = path.dirname(jobsFile);
  fs.mkdirSync(parent, { recursive: true });

  if (!fs.existsSync(jobsFile)) {
    fs.writeFileSync(jobsFile, "[]\n", "utf-8");
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function byCreatedDesc(left, right) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function normalizeOptionalText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
