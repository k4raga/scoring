import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildDifyPayload,
  getDifyProviderDescriptor,
  normalizeDifyContract,
  normalizeDifyWorkflowResponse,
  runDifyAnalysisPass
} from "../backend/src/dify-analysis.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scoring-dify-test-"));
const runsRoot = path.join(tempRoot, "runs");
const runDir = path.join(runsRoot, "run-1");
const normalizedDir = path.join(runDir, "normalized");
const artifactsDir = path.join(runDir, "artifacts");

fs.mkdirSync(normalizedDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(path.join(normalizedDir, "doc-1.md"), "# Критерии\n\nЦена - 60%.\n", "utf-8");
fs.writeFileSync(
  path.join(artifactsDir, "manifest.json"),
  JSON.stringify({
    href: "http://localhost:4100/private",
    sourcePath: "C:\\secret\\doc.docx",
    apiToken: "must-not-leak",
    useful: {
      criterion: "Цена"
    }
  }),
  "utf-8"
);

process.env.SCORING_EXTRACTOR_RUNS_ROOT = runsRoot;

const record = {
  id: "record-1",
  projectTitle: "Тест Dify",
  customer: "Старый заказчик",
  title: "Тендер",
  sourceUrl: "https://zakupki.example/notice",
  documentsFolderHref: "/assets/storage/project/source.zip",
  criteriaDocumentUrl: "/api/records/record-1/documents/doc-1",
  selectionCriteriaRows: [],
  documents: [
    {
      kind: "normalized_markdown",
      group: "normalizedMarkdown",
      documentId: "doc-1",
      label: "Документ критериев",
      href: "/artifacts/run-1/normalized/doc-1.md",
      sourcePath: "C:\\secret\\doc.docx"
    }
  ],
  workflow: {
    extraction: {
      artifacts: {
        manifestJson: "/artifacts/run-1/artifacts/manifest.json"
      },
      documents: []
    }
  }
};
const env = {
  SCORING_DIFY_API_BASE_URL: "https://dify.example/v1",
  SCORING_DIFY_API_KEY: "test-secret",
  SCORING_DIFY_MAX_DOCUMENTS: "10",
  SCORING_DIFY_MAX_DOCUMENT_CHARS: "10000",
  SCORING_DIFY_MAX_PAYLOAD_CHARS: "100000"
};

const provider = getDifyProviderDescriptor(env);
assert.equal(provider.status, "configured");
assert.equal(provider.apiKey, undefined);

const built = buildDifyPayload({
  record,
  job: { id: "job-1" },
  config: {
    maxDocuments: 10,
    maxDocumentChars: 10000,
    maxJsonArtifactChars: 10000,
    maxPayloadChars: 100000
  }
});
const serializedPayload = JSON.stringify(built.payload);

assert.equal(built.payload.record.documentsFolderHref, undefined);
assert.equal(built.payload.record.criteriaDocumentUrl, undefined);
assert.match(serializedPayload, /# Критерии/u);
assert.doesNotMatch(serializedPayload, /must-not-leak/u);
assert.doesNotMatch(serializedPayload, /C:\\secret/u);
assert.doesNotMatch(serializedPayload, /localhost:4100/u);

const normalizedContract = normalizeDifyContract({
  recordPatch: {
    customer: "Новый заказчик",
    documentsFolderHref: "/forbidden",
    workflow: { status: "forbidden" }
  },
  selectionCriteriaRows: [
    {
      group: "price",
      title: "Цена договора",
      weightPercent: 60,
      coverageStatus: "full",
      coverageNote: "Предлагаем минимальную цену",
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
  metadata: {
    href: "/private",
    model: "mock"
  }
});

assert.equal(normalizedContract.recordPatch.customer, "Новый заказчик");
assert.equal(normalizedContract.recordPatch.documentsFolderHref, undefined);
assert.equal(normalizedContract.recordPatch.workflow, undefined);
assert.equal(normalizedContract.selectionCriteriaRows[0].coverageStatus, "full");
assert.deepEqual(normalizedContract.metadata, { model: "mock" });
assert(normalizedContract.warnings.some((warning) => warning.includes("dify_record_patch_fields_rejected")));

assert.throws(
  () => normalizeDifyWorkflowResponse({ data: { status: "succeeded", outputs: { result: "обычный текст без json" } } }),
  /valid JSON contract/u
);

let capturedRequest = null;
const pass = await runDifyAnalysisPass({
  job: { id: "job-1" },
  record,
  env,
  fetchImpl: async (url, options) => {
    capturedRequest = {
      url,
      headers: Object.fromEntries(options.headers ? Object.entries(options.headers) : []),
      body: JSON.parse(options.body)
    };
    return new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
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
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});

assert.equal(capturedRequest.url, "https://dify.example/v1/workflows/run");
assert.equal(capturedRequest.headers.Authorization, "Bearer test-secret");
assert.equal(capturedRequest.body.response_mode, "blocking");
assert.equal(capturedRequest.body.inputs.scoring_payload.record.criteriaDocumentUrl, undefined);
assert.equal(pass.result.recordPatch.customer, "Новый заказчик");
assert.equal(pass.result.recordPatch.selectionCriteriaRows[0].coverageStatus, "full");
assert.equal(pass.result.analysisMetadata.payloadSummary.documentCount, 2);
assert.doesNotMatch(JSON.stringify(pass.result), /test-secret/u);

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: [
        "provider_descriptor",
        "payload_sanitizer",
        "contract_validator",
        "dify_client_mock"
      ]
    },
    null,
    2
  )
);
