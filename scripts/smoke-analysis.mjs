import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scoringBaseUrl = process.env.SCORING_API_BASE_URL || "http://localhost:4100";
const extractorBaseUrl =
  process.env.SCORING_EXTRACTOR_API_BASE_URL ||
  process.env.SCORING_ANALYSIS_API_BASE_URL ||
  "http://127.0.0.1:4200";
const archivePath =
  process.env.SCORING_TEST_ARCHIVE ||
  path.join(os.homedir(), "Downloads", "МРИЯ.zip");
const keepRecord = ["1", "true", "yes", "on"].includes(String(process.env.SCORING_KEEP_SMOKE_RECORD || "").toLowerCase());

await assertHealth(`${scoringBaseUrl}/api/health`, "scoring backend");
await assertHealth(`${extractorBaseUrl}/api/health`, "scoring extractor");

if (!fs.existsSync(archivePath)) {
  throw new Error(`Test archive not found: ${archivePath}`);
}

const formData = new FormData();
formData.append("title", "МРИЯ smoke");
formData.append("archive", new Blob([fs.readFileSync(archivePath)]), path.basename(archivePath));

const createResponse = await fetch(`${scoringBaseUrl}/api/records`, {
  method: "POST",
  body: formData
});
const createPayload = await readJson(createResponse);

if (!createResponse.ok) {
  throw new Error(`Create failed: ${createResponse.status} ${JSON.stringify(createPayload)}`);
}

const record = createPayload.record;
const stages = record?.workflow?.analysis?.stages || [];
const stageIds = stages.map((stage) => stage.id || stage.name);

assert(record?.id, "record id is missing");
assert(record.customer === "ООО «МРИЯ»", `unexpected customer: ${record.customer}`);
assert(record.projectTitle === "МРИЯ smoke", `unexpected projectTitle: ${record.projectTitle}`);
assert(String(record.title || "").includes("Внедрение"), `unexpected title: ${record.title}`);
assert(record.overallExecutionTerm, "overallExecutionTerm is missing");
assert(record.purchaseBy === "Нет информации", `unexpected purchaseBy: ${record.purchaseBy}`);
assert(record.nmc === "Не указано в документах", `unexpected nmc: ${record.nmc}`);
assert(record.workflow?.analysis?.service === "scoring-extractor", `unexpected extractor service: ${record.workflow?.analysis?.service}`);
assert(["unpack", "inventory", "extract", "normalize"].every((id) => stageIds.includes(id)), `missing extraction stages: ${stageIds.join(", ")}`);
assert(stages.every((stage) => stage.status === "completed"), "not all extraction stages completed");
assert(String(record.technicalSpecificationUrl || "").startsWith(extractorBaseUrl), `technicalSpecificationUrl is not an extractor artifact URL: ${record.technicalSpecificationUrl}`);
assert(String(record.workflow?.analysis?.documentIndex || "").startsWith(extractorBaseUrl), `documentIndex is not an extractor artifact URL: ${record.workflow?.analysis?.documentIndex}`);

if (!keepRecord) {
  await fetch(`${scoringBaseUrl}/api/records/${encodeURIComponent(record.id)}`, {
    method: "DELETE"
  });
  cleanupAnalysisRun(record.workflow?.analysis?.runRoot);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      recordId: record.id,
      kept: keepRecord,
      stages: stages.map((stage) => `${stage.id || stage.name}:${stage.status}`)
    },
    null,
    2
  )
);

async function assertHealth(url, label) {
  const response = await fetch(url);
  const payload = await readJson(response);

  if (!response.ok || payload?.ok !== true) {
    throw new Error(`${label} health failed: ${response.status}`);
  }
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanupAnalysisRun(runRoot) {
  if (!runRoot) {
    return;
  }

  const resolved = path.resolve(String(runRoot));
  const expectedRoot = path.resolve(path.join(process.cwd(), "artifacts", "scoring-extractor", "runs"));
  const relative = path.relative(expectedRoot, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return;
  }

  fs.rmSync(resolved, { recursive: true, force: true });
}
