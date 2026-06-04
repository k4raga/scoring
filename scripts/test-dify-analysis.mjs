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
  path.join(normalizedDir, "doc-2.md"),
  "# Закупочная документация\n\n| |Критерии оценки заявок: |\n| |Единственным критерием является цена. |\n",
  "utf-8"
);
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
    },
    {
      kind: "normalized_markdown",
      group: "normalizedMarkdown",
      documentId: "doc-2",
      label: "Закупочная документация",
      href: "/artifacts/run-1/normalized/doc-2.md",
      sourcePath: "C:\\secret\\doc-2.docx"
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
assert.deepEqual(
  built.payload.instructions.extractionBlocks.map((block) => block.id),
  ["tenderInfo", "selectionCriteria"]
);
assert.equal(built.payload.instructions.allowedPatchFields.includes("preassessment"), false);
assert.equal(built.payload.instructions.disabledPatchFields.includes("preassessment"), true);
assert.equal(built.payload.instructions.preassessmentEnums, undefined);
assert.equal(built.payload.instructions.extractionTargets.preassessment, undefined);

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
                },
                {
                  field: "selectionCriteriaRows",
                  documentId: "doc-1",
                  quote: "Критерии оценки заявок: Единственным критерием является цена.",
                  note: "Dify ошибся с documentId, backend должен исправить"
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
assert.equal(pass.result.documentFindings.find((finding) => finding.field === "selectionCriteriaRows")?.documentId, "doc-2");
assert(pass.warnings.includes("dify_document_finding_document_id_repaired:1"));
assert.equal(pass.result.analysisMetadata.payloadSummary.documentCount, 3);
assert.doesNotMatch(JSON.stringify(pass.result), /test-secret/u);

const manualCriteriaPass = await runDifyAnalysisPass({
  job: { id: "job-manual-criteria" },
  record: {
    ...record,
    selectionCriteriaRows: [
      {
        order: 1,
        group: "requirement",
        title: "Опыт",
        coverageStatus: "partial",
        coverageNote: "Ручная пометка закрытия: не уверены, что примут Почта Банк.",
        sourceExcerpt: "Наличие опыта"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {},
              selectionCriteriaRows: [
                {
                  group: "requirement",
                  title: "Наличие опыта",
                  coverageStatus: "full",
                  coverageNote: "Требуется опыт по документам.",
                  sourceExcerpt: "Наличие опыта оказания услуг"
                }
              ],
              documentFindings: [
                {
                  field: "selectionCriteriaRows",
                  documentId: "doc-1",
                  quote: "Наличие опыта оказания услуг",
                  note: "Требование к опыту"
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
    )
});

assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].title, "Опыт");
assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].coverageStatus, "partial");
assert.match(manualCriteriaPass.result.selectionCriteriaRows[0].coverageNote, /Почта Банк/u);
assert.match(manualCriteriaPass.result.selectionCriteriaRows[0].sourceExcerpt, /Наличие опыта оказания услуг/u);

let capturedStreamingRequest = null;
const streamingPass = await runDifyAnalysisPass({
  job: { id: "job-streaming" },
  record,
  env: {
    ...env,
    SCORING_DIFY_RESPONSE_MODE: "streaming"
  },
  fetchImpl: async (url, options) => {
    capturedStreamingRequest = {
      url,
      body: JSON.parse(options.body)
    };

    return new Response(
      [
        `data: ${JSON.stringify({ event: "workflow_started", task_id: "task-stream", workflow_run_id: "run-stream" })}`,
        "",
        `data: ${JSON.stringify({
          event: "workflow_finished",
          task_id: "task-stream",
          workflow_run_id: "run-stream",
          data: {
            id: "run-stream",
            workflow_id: "workflow-stream",
            status: "succeeded",
            outputs: {
              result: JSON.stringify({
                recordPatch: {
                  customer: "Потоковый заказчик"
                },
                selectionCriteriaRows: [],
                documentFindings: [
                  {
                    field: "customer",
                    documentId: "doc-1",
                    quote: "Потоковый заказчик",
                    note: "Найдено в документации"
                  }
                ],
                warnings: [],
                metadata: {
                  model: "mock-stream"
                }
              })
            }
          }
        })}`,
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      }
    );
  }
});

assert.equal(capturedStreamingRequest.url, "https://dify.example/v1/workflows/run");
assert.equal(capturedStreamingRequest.body.response_mode, "streaming");
assert.equal(streamingPass.result.recordPatch.customer, "Потоковый заказчик");
assert.equal(streamingPass.result.analysisMetadata.dify.workflowRunId, "run-stream");

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: [
        "provider_descriptor",
        "payload_sanitizer",
        "contract_validator",
        "dify_client_mock",
        "dify_streaming_mock"
      ]
    },
    null,
    2
  )
);
