import assert from "node:assert/strict";
import { buildDifyInstructions, normalizeDifyWorkflowResponse } from "../backend/src/dify-analysis.js";

const config = readConfig(process.env);
const payload = buildSmokePayload();
const response = await fetch(`${config.baseUrl}${config.apiPath}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    inputs: {
      [config.payloadInputKey]: payload
    },
    response_mode: config.responseMode,
    user: `scoring-live-smoke:${Date.now()}`
  })
});
const responsePayload = await readDifyResponsePayload(response, config);

if (!response.ok) {
  throw new Error(`dify_live_request_failed:${response.status}:${safeErrorMessage(responsePayload)}`);
}

const normalized = normalizeDifyWorkflowResponse(responsePayload);
const resultJson = JSON.stringify(normalized);
const recordPatchFields = Object.keys(normalized.recordPatch);
const expectedSmokeRecordFields = [
  "customer",
  "projectTitle",
  "title",
  "deadlineAt",
  "nmc",
  "stage",
  "purchaseBy",
  "platformPayment",
  "applicationSecurity",
  "contractSecurity",
  "overallExecutionTerm",
  "contractTerm",
  "retrade",
  "antiDumpingMeasures",
  "creative",
  "notes"
];
const missingSmokeRecordFields = expectedSmokeRecordFields.filter((field) => !recordPatchFields.includes(field));
const evidenceFields = new Set(
  normalized.documentFindings
    .map((finding) => finding.field || finding.target)
    .filter(Boolean)
);
const missingSmokeEvidenceFields = recordPatchFields.filter((field) => !evidenceFields.has(field));
const criteriaEvidenceCount = normalized.documentFindings.filter(
  (finding) => finding.field === "selectionCriteriaRows" || finding.target === "selectionCriteriaRows"
).length;

assert.equal(normalized.status, "succeeded");
assertNoUnsafeReferences(resultJson, "normalized Dify result");
assert.equal(normalized.recordPatch.preassessment, undefined, "Dify result should not include preassessment in the two-block smoke");
assert.deepEqual(missingSmokeRecordFields, [], "Dify result should include expected smoke recordPatch fields");
assert.deepEqual(missingSmokeEvidenceFields, [], "Dify result should include evidence for every smoke recordPatch field");
assert.ok(normalized.selectionCriteriaRows.length > 0, "Dify result should include smoke selectionCriteriaRows");
assert.ok(
  criteriaEvidenceCount >= normalized.selectionCriteriaRows.length,
  "Dify result should include evidence for every smoke selectionCriteriaRows item"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      status: normalized.status,
      workflowRunId: responsePayload?.workflow_run_id || responsePayload?.data?.workflow_run_id || responsePayload?.data?.id || null,
      recordPatchFields,
      missingSmokeRecordFields,
      missingSmokeEvidenceFields,
      selectionCriteriaRows: normalized.selectionCriteriaRows.length,
      criteriaEvidenceCount,
      documentFindings: normalized.documentFindings.length,
      warnings: normalized.warnings
    },
    null,
    2
  )
);

function readConfig(env) {
  const baseUrl = normalizeUrl(env.SCORING_DIFY_API_BASE_URL || env.DIFY_API_BASE_URL);
  const apiKey = normalizeText(env.SCORING_DIFY_API_KEY || env.DIFY_API_KEY);
  const apiPath = normalizeApiPath(env.SCORING_DIFY_API_PATH || env.DIFY_API_PATH || "/workflows/run");
  const payloadInputKey = normalizeText(env.SCORING_DIFY_PAYLOAD_INPUT_KEY || env.DIFY_PAYLOAD_INPUT_KEY) || "scoring_payload";
  const responseMode = normalizeText(env.SCORING_DIFY_RESPONSE_MODE || env.DIFY_RESPONSE_MODE) || "blocking";

  if (!baseUrl) {
    throw new Error("SCORING_DIFY_API_BASE_URL is required");
  }

  if (!apiKey) {
    throw new Error("SCORING_DIFY_API_KEY is required");
  }

  if (!["blocking", "streaming"].includes(responseMode)) {
    throw new Error("SCORING_DIFY_RESPONSE_MODE must be blocking or streaming");
  }

  return {
    baseUrl,
    apiKey,
    apiPath,
    payloadInputKey,
    responseMode
  };
}

function buildSmokePayload() {
  const instructions = buildDifyInstructions();

  return {
    context: {
      contractVersion: "dify-ai-pass.v1",
      language: "ru",
      recordId: "dify-live-smoke-record",
      jobId: "dify-live-smoke-job"
    },
    record: {
      id: "dify-live-smoke-record",
      projectTitle: "Dify live smoke",
      customer: "",
      title: "Проверка Dify workflow",
      purchaseBy: ""
    },
    selectionCriteriaRows: [],
    documents: [
      {
        documentId: "doc-live-smoke",
        title: "Документ критериев",
        kind: "normalized_markdown",
        sourceFileName: "criteria-smoke.md",
        extractionStatus: "extracted",
        markdown: [
          "# Извещение, техническое задание и критерии выбора",
          "",
          "Заказчик: ООО Дымовой Тест.",
          "Закупка проводится по 44-ФЗ.",
          "Статус закупки: прием заявок.",
          "Предмет закупки: развитие личного кабинета, интеграция с внутренними системами и подготовка пользовательской документации.",
          "Краткое наименование: развитие личного кабинета.",
          "Начальная максимальная цена договора: 1 200 000 рублей, включая НДС.",
          "Дата и время окончания подачи заявок: 15.06.2026 18:00 по московскому времени.",
          "Оплата площадки: комиссия оператора электронной площадки оплачивается победителем по тарифам площадки.",
          "Обеспечение заявки: 2% от НМЦ, допускается независимая гарантия.",
          "Обеспечение исполнения договора: 5% от цены договора.",
          "Срок выполнения работ: 45 календарных дней с даты заключения договора.",
          "Срок действия договора: до полного исполнения обязательств сторонами, но не позднее 31.08.2026.",
          "Переторжка не предусмотрена.",
          "Антидемпинговые меры применяются при снижении цены более чем на 25%.",
          "Творческое задание: требуется предложить дизайн-концепцию интерфейса и макеты ключевых экранов.",
          "Особые условия: исполнитель должен иметь опыт не менее трех аналогичных проектов за последние два года.",
          "",
          "Критерии оценки:",
          "Цена договора - 60%.",
          "Квалификация участника и опыт аналогичных работ - 25%.",
          "Качество технического предложения и методология выполнения работ - 15%."
        ].join("\n"),
        jsonArtifacts: [
          {
            artifactKey: "procurement-summary",
            title: "Структурированная сводка закупки",
            content: {
              customer: "ООО Дымовой Тест",
              deadlineAt: "15.06.2026 18:00",
              nmc: "1 200 000 рублей",
              requirements: [
                "опыт не менее трех аналогичных проектов",
                "передача исключительных прав на дизайн-макеты"
              ]
            }
          }
        ]
      }
    ],
    instructions
  };
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

async function readDifyResponsePayload(response, config) {
  const contentType = response.headers.get("content-type") || "";

  if (response.ok && (config.responseMode === "streaming" || contentType.includes("text/event-stream"))) {
    return readDifyStreamingResponse(response);
  }

  return readJsonResponse(response);
}

async function readDifyStreamingResponse(response) {
  const text = await response.text();
  const events = parseSseJsonEvents(text);

  if (!events.length) {
    return parseMaybeJson(text);
  }

  const finishedEvent = [...events].reverse().find((event) => event.event === "workflow_finished") || events.at(-1);
  const data = isObject(finishedEvent.data) ? finishedEvent.data : {};

  return {
    task_id: normalizeText(finishedEvent.task_id),
    workflow_run_id: normalizeText(finishedEvent.workflow_run_id || data.workflow_run_id || data.id),
    data: {
      ...data,
      workflow_run_id: normalizeText(finishedEvent.workflow_run_id || data.workflow_run_id)
    }
  };
}

function parseSseJsonEvents(text) {
  return String(text || "")
    .split(/\r?\n\r?\n/u)
    .map((block) =>
      block
        .split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim()
    )
    .filter((data) => data && data !== "[DONE]")
    .map((data) => parseMaybeJson(data))
    .filter(isObject);
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(String(value || "").trim());
  } catch (_error) {
    return null;
  }
}

function safeErrorMessage(payload) {
  return normalizeText(payload?.message || payload?.error || payload?.code || "unknown_error")
    .replace(/[A-Za-z0-9_-]{24,}/g, "<redacted>");
}

function assertNoUnsafeReferences(value, label) {
  assert.doesNotMatch(value, /SCORING_DIFY_API_KEY|DIFY_API_KEY/u, `${label} leaked env name`);
  assert.doesNotMatch(value, /Bearer\s+[A-Za-z0-9._-]+/u, `${label} leaked bearer token`);
  assert.doesNotMatch(value, /[A-Z]:\\/u, `${label} leaked Windows absolute path`);
  assert.doesNotMatch(value, /127\.0\.0\.1|localhost/u, `${label} leaked machine-local URL`);
  assert.doesNotMatch(value, /"href"\s*:/u, `${label} leaked href field`);
  assert.doesNotMatch(value, /"path"\s*:/u, `${label} leaked path field`);
}

function normalizeUrl(value) {
  return normalizeText(value).replace(/\/+$/u, "");
}

function normalizeApiPath(value) {
  const normalized = normalizeText(value) || "/workflows/run";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
