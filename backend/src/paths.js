import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..");
const projectRoot = path.join(backendRoot, "..");

export function getProjectRoot() {
  return projectRoot;
}

export function getBackendRoot() {
  return backendRoot;
}

export function getMvpRoot() {
  return process.env.SCORING_MVP_ROOT ? path.resolve(process.env.SCORING_MVP_ROOT) : path.join(projectRoot, "mvp");
}

export function getDataFilePath() {
  return process.env.SCORING_DATA_FILE
    ? path.resolve(process.env.SCORING_DATA_FILE)
    : path.join(backendRoot, "data", "coding-records.json");
}

export function getAnalysisJobsFilePath() {
  return process.env.SCORING_ANALYSIS_JOBS_FILE
    ? path.resolve(process.env.SCORING_ANALYSIS_JOBS_FILE)
    : path.join(backendRoot, "data", "analysis-jobs.json");
}

export function getStorageProjectsRoot() {
  return process.env.SCORING_STORAGE_ROOT
    ? path.resolve(process.env.SCORING_STORAGE_ROOT)
    : path.join(projectRoot, "storage", "projects");
}

export function getStorageAssetsRoot() {
  return path.dirname(getStorageProjectsRoot());
}

export function getLocalAnalysisWorkspaceRoot() {
  return process.env.SCORING_LOCAL_ANALYSIS_WORKSPACE_ROOT
    ? path.resolve(process.env.SCORING_LOCAL_ANALYSIS_WORKSPACE_ROOT)
    : path.join(projectRoot, "tmp", "analysis-jobs");
}
