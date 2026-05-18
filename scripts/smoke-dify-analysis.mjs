import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scoring-dify-smoke-"));
const dataFile = path.join(tempRoot, "coding-records.json");
const jobsFile = path.join(tempRoot, "analysis-jobs.json");
const runsRoot = path.join(tempRoot, "runs");
const runDir = path.join(runsRoot, "run-1");
const normalizedDir = path.join(runDir, "normalized");

fs.mkdirSync(normalizedDir, { recursive: true });
fs.writeFileSync(path.join(normalizedDir, "doc-1.md"), "# Критерии\n\nЦена - 60%.\n", "utf-8");
fs.writeFileSync(jobsFile, "[]\n", "utf-8");
fs.writeFileSync(
  dataFile,
  JSON.stringify(
    [
      {
        id: "dify-smoke-record",
        publishedAt: "2026-05-18",
        projectTitle: "Dify smoke",
        customer: "Старый заказчик",
        title: "Тестовый тендер",
        documentsFolderHref: "/assets/storage/private/source.zip",
        criteriaDocumentUrl: "/api/records/dify-smoke-record/documents/doc-1",
        purchaseBy: "44-ФЗ",
        selectionCriteriaRows: [],
        documents: [
          {
            kind: "normalized_markdown",
            group: "normalizedMarkdown",
            documentId: "doc-1",
            label: "Документ критериев",
            href: "/artifacts/run-1/normalized/doc-1.md"
          }
        ],
        workflow: {
          extraction: {
            documents: [],
            artifacts: {}
          }
        }
      }
    ],
    null,
    2
  ),
  "utf-8"
);

let difyRequest = null;
const difyServer = http.createServer((request, response) => {
  let body = "";

  request.setEncoding("utf-8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    difyRequest = {
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(body)
    };

    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        task_id: "task-smoke",
        data: {
          status: "succeeded",
          workflow_run_id: "workflow-smoke",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                customer: "Новый заказчик"
              },
              selectionCriteriaRows: [
                {
                  group: "price",
                  title: "Цена договора",
                  weightPercent: 60,
                  coverageStatus: "full",
                  coverageNote: "Закрываем ценой",
                  sourceExcerpt: "Цена - 60%"
                }
              ],
              documentFindings: [
                {
                  field: "customer",
                  documentId: "doc-1",
                  quote: "Новый заказчик",
                  note: "Найдено в документации"
                }
              ],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      })
    );
  });
});

await listen(difyServer, 0);
const difyPort = difyServer.address().port;
const backendPort = await findFreePort();
const backend = spawn("node", ["backend/src/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(backendPort),
    SCORING_DATA_FILE: dataFile,
    SCORING_ANALYSIS_JOBS_FILE: jobsFile,
    SCORING_EXTRACTOR_RUNS_ROOT: runsRoot,
    SCORING_DIFY_API_BASE_URL: `http://127.0.0.1:${difyPort}`,
    SCORING_DIFY_API_KEY: "smoke-secret",
    SCORING_FRONTEND_DIST: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
backend.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForHealth(`http://127.0.0.1:${backendPort}/api/health`);
  const providers = await readJsonFetch(`http://127.0.0.1:${backendPort}/api/ai/providers`);
  const difyProvider = providers.providers.find((provider) => provider.id === "dify");

  assert.equal(difyProvider.status, "configured");
  assert.equal(difyProvider.apiKey, undefined);

  const created = await readJsonFetch(`http://127.0.0.1:${backendPort}/api/analysis-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recordId: "dify-smoke-record",
      providerId: "dify",
      requestedBy: "smoke"
    })
  });
  const run = await readJsonFetch(`http://127.0.0.1:${backendPort}/api/analysis-jobs/${encodeURIComponent(created.job.id)}/run-dify-adapter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requestedBy: "smoke"
    })
  });

  assert.equal(run.job.status, "completed");
  assert.equal(run.record.customer, "Новый заказчик");
  assert.equal(run.record.selectionCriteriaRows[0].coverageStatus, "full");
  assert.equal(difyRequest.url, "/workflows/run");
  assert.equal(difyRequest.authorization, "Bearer smoke-secret");
  assert.equal(difyRequest.body.inputs.scoring_payload.record.criteriaDocumentUrl, undefined);
  assert.match(JSON.stringify(difyRequest.body.inputs.scoring_payload.documents), /# Критерии/u);
  assert.doesNotMatch(JSON.stringify(run.job.result), /smoke-secret/u);
  assert.doesNotMatch(JSON.stringify(run.job.result), /# Критерии/u);

  console.log(
    JSON.stringify(
      {
        ok: true,
        recordId: run.record.id,
        jobId: run.job.id,
        provider: difyProvider.status
      },
      null,
      2
    )
  );
} finally {
  backend.kill();
  difyServer.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function readJsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function waitForHealth(url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    try {
      const payload = await readJsonFetch(url);

      if (payload.ok) {
        return;
      }
    } catch (_error) {
      await delay(150);
    }
  }

  throw new Error(`backend did not become healthy: ${stderr}`);
}

async function findFreePort() {
  const server = http.createServer();
  await listen(server, 0);
  const port = server.address().port;
  server.close();
  return port;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
