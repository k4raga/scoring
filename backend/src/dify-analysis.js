import fs from "node:fs";
import path from "node:path";
import { getLocalAnalysisWorkspaceRoot, getProjectRoot } from "./paths.js";
import { normalizeSelectionCriteriaRows } from "./record-schema.js";

const CONTRACT_VERSION = "dify-ai-pass.v1";
const DEFAULT_DIFY_API_PATH = "/workflows/run";
const DEFAULT_DIFY_INPUT_KEY = "scoring_payload";
const DEFAULT_DIFY_RESPONSE_MODE = "blocking";
const DEFAULT_DIFY_TIMEOUT_MS = 95_000;
const DEFAULT_MAX_DOCUMENTS = 40;
const DEFAULT_MAX_DOCUMENT_CHARS = 120_000;
const DEFAULT_MAX_JSON_ARTIFACT_CHARS = 80_000;
const DEFAULT_MAX_PAYLOAD_CHARS = 650_000;
const DOCUMENT_LINK_FIELDS = new Set([
  "documentsFolderHref",
  "googleDocumentsFolderHref",
  "requirementsDocumentUrl",
  "criteriaDocumentUrl",
  "technicalSpecificationUrl"
]);
const RECORD_PAYLOAD_FIELDS = [
  "id",
  "projectTitle",
  "customer",
  "title",
  "shortTitle",
  "sourceUrl",
  "etpUrl",
  "publishedAt",
  "deadlineAt",
  "nmc",
  "stage",
  "purchaseBy",
  "platform",
  "platformPayment",
  "applicationSecurity",
  "contractSecurity",
  "overallExecutionTerm",
  "contractTerm",
  "retrade",
  "antiDumpingMeasures",
  "creative",
  "creativeLinkUrl",
  "notes",
  "summary",
  "year",
  "month",
  "dayKey"
];
const ALLOWED_RECORD_PATCH_FIELDS = new Set([
  "customer",
  "projectTitle",
  "title",
  "shortTitle",
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
  "notes",
  "summary",
  "selectionCriteriaRows"
]);
const FORBIDDEN_KEY_PATTERNS = [
  /api[_-]?key/iu,
  /authorization/iu,
  /bearer/iu,
  /password/iu,
  /secret/iu,
  /token/iu,
  /href$/iu,
  /url$/iu,
  /path$/iu,
  /runroot/iu,
  /markdownpath/iu,
  /sourcepath/iu
];

export function getDifyConfig(env = process.env) {
  const baseUrl = normalizeBaseUrl(env.SCORING_DIFY_API_BASE_URL || env.DIFY_API_BASE_URL);
  const apiKey = normalizeOptionalText(env.SCORING_DIFY_API_KEY || env.DIFY_API_KEY);
  const apiPath = normalizeApiPath(env.SCORING_DIFY_API_PATH || env.DIFY_API_PATH || DEFAULT_DIFY_API_PATH);
  const payloadInputKey = normalizeOptionalText(env.SCORING_DIFY_PAYLOAD_INPUT_KEY || env.DIFY_PAYLOAD_INPUT_KEY) || DEFAULT_DIFY_INPUT_KEY;
  const responseMode = normalizeDifyResponseMode(env.SCORING_DIFY_RESPONSE_MODE || env.DIFY_RESPONSE_MODE);
  const timeoutMs = readPositiveInt(env.SCORING_DIFY_TIMEOUT_MS || env.DIFY_TIMEOUT_MS, DEFAULT_DIFY_TIMEOUT_MS);

  return {
    baseUrl,
    apiKey,
    apiPath,
    payloadInputKey,
    responseMode,
    timeoutMs,
    maxDocuments: readPositiveInt(env.SCORING_DIFY_MAX_DOCUMENTS, DEFAULT_MAX_DOCUMENTS),
    maxDocumentChars: readPositiveInt(env.SCORING_DIFY_MAX_DOCUMENT_CHARS, DEFAULT_MAX_DOCUMENT_CHARS),
    maxJsonArtifactChars: readPositiveInt(env.SCORING_DIFY_MAX_JSON_ARTIFACT_CHARS, DEFAULT_MAX_JSON_ARTIFACT_CHARS),
    maxPayloadChars: readPositiveInt(env.SCORING_DIFY_MAX_PAYLOAD_CHARS, DEFAULT_MAX_PAYLOAD_CHARS),
    debugPayload: readBooleanEnv(env.SCORING_DIFY_DEBUG_PAYLOAD)
  };
}

export function getDifyProviderDescriptor(env = process.env) {
  const config = getDifyConfig(env);
  const configured = Boolean(config.baseUrl && config.apiKey);

  return {
    id: "dify",
    label: "Dify AI-pass",
    status: configured ? "configured" : "not_configured",
    transport: "remote",
    supportsPageEvidence: true,
    supportsDocumentExtraction: true,
    responseMode: config.responseMode,
    configured,
    missing: configured
      ? []
      : [
          config.baseUrl ? "" : "SCORING_DIFY_API_BASE_URL",
          config.apiKey ? "" : "SCORING_DIFY_API_KEY"
        ].filter(Boolean)
  };
}

export async function runDifyAnalysisPass({ job, record, env = process.env, fetchImpl = fetch } = {}) {
  if (!isObject(job) || !normalizeOptionalText(job.id)) {
    throw createDifyError("invalid_job_payload", "analysis_job_payload_is_required", { httpStatus: 400 });
  }

  if (!isObject(record) || !normalizeOptionalText(record.id)) {
    throw createDifyError("record_payload_required", "record_payload_required", { httpStatus: 400 });
  }

  const config = getDifyConfig(env);

  if (!config.baseUrl || !config.apiKey) {
    throw createDifyError("dify_not_configured", "Dify API is not configured", {
      httpStatus: 503,
      details: {
        missing: getDifyProviderDescriptor(env).missing
      }
    });
  }

  const startedAt = Date.now();
  const payloadBuild = buildDifyPayload({ record, job, config });

  writeDebugPayloadIfEnabled({ config, job, payload: payloadBuild.payload });

  const difyResponse = await requestDifyWorkflow({
    config,
    payload: payloadBuild.payload,
    user: buildDifyUser(record, job),
    fetchImpl
  });
  const normalized = normalizeDifyWorkflowResponse(difyResponse.payload);
  const durationMs = Date.now() - startedAt;
  const warnings = uniqueStrings([
    ...payloadBuild.warnings,
    ...normalized.warnings
  ]);
  const metadata = {
    ...(isObject(normalized.metadata) ? normalized.metadata : {}),
    dify: {
      provider: "dify",
      contractVersion: CONTRACT_VERSION,
      responseMode: config.responseMode,
      status: normalized.status,
      taskId: normalizeOptionalText(difyResponse.payload?.task_id),
      workflowRunId: normalizeOptionalText(difyResponse.payload?.workflow_run_id || difyResponse.payload?.data?.workflow_run_id || difyResponse.payload?.data?.id),
      workflowId: normalizeOptionalText(difyResponse.payload?.data?.workflow_id),
      elapsedTime: difyResponse.payload?.data?.elapsed_time ?? null,
      totalTokens: difyResponse.payload?.data?.total_tokens ?? null,
      totalSteps: difyResponse.payload?.data?.total_steps ?? null,
      durationMs
    },
    payloadSummary: payloadBuild.summary,
    responseDiagnostics: normalized.diagnostics
  };
  const recordPatch = { ...normalized.recordPatch };

  if (normalized.selectionCriteriaRows.length) {
    recordPatch.selectionCriteriaRows = normalized.selectionCriteriaRows;
  }

  return {
    warnings,
    result: {
      analysisMetadata: metadata,
      metadata,
      fields: {},
      recordPatch,
      selectionCriteriaRows: normalized.selectionCriteriaRows,
      documentFindings: normalized.documentFindings,
      warnings
    },
    adapter: {
      status: "completed",
      provider: "dify",
      payloadSummary: payloadBuild.summary,
      responseDiagnostics: normalized.diagnostics,
      warnings
    }
  };
}

export function buildDifyPayload({ record, job = {}, config = getDifyConfig() } = {}) {
  const warnings = [];
  const recordPayload = buildRecordPayload(record);
  const documents = collectDifyDocuments(record, config, warnings);
  const payload = {
    context: {
      contractVersion: CONTRACT_VERSION,
      language: "ru",
      recordId: normalizeOptionalText(record?.id),
      jobId: normalizeOptionalText(job?.id)
    },
    record: recordPayload,
    selectionCriteriaRows: Array.isArray(record?.selectionCriteriaRows) ? record.selectionCriteriaRows : [],
    documents,
    instructions: buildDifyInstructions()
  };
  const compacted = enforcePayloadSize(payload, config, warnings);

  return {
    payload: compacted.payload,
    warnings: uniqueStrings(warnings),
    summary: buildPayloadSummary(compacted.payload, warnings)
  };
}

export function normalizeDifyWorkflowResponse(rawResponse) {
  const outputs = extractWorkflowOutputs(rawResponse);
  const contractSource = extractContractSource(outputs);
  const parsed = parseMaybeJson(contractSource);

  if (!isObject(parsed)) {
    throw createDifyError("dify_invalid_json_contract", "Dify response does not contain a valid JSON contract", {
      httpStatus: 502,
      details: {
        outputKeys: isObject(outputs) ? Object.keys(outputs) : [],
        responseStatus: normalizeOptionalText(rawResponse?.data?.status || rawResponse?.status)
      }
    });
  }

  const normalized = normalizeDifyContract(parsed);
  const responseStatus = normalizeOptionalText(rawResponse?.data?.status || rawResponse?.status || normalized.status || "succeeded");

  if (responseStatus && !["succeeded", "completed", "success"].includes(responseStatus)) {
    throw createDifyError("dify_workflow_failed", normalizeOptionalText(rawResponse?.data?.error) || "Dify workflow failed", {
      httpStatus: 502,
      details: {
        responseStatus
      }
    });
  }

  return {
    ...normalized,
    status: responseStatus || "succeeded",
    diagnostics: {
      outputKeys: isObject(outputs) ? Object.keys(outputs) : [],
      contractKeys: Object.keys(parsed),
      validationStatus: "valid"
    }
  };
}

export function normalizeDifyContract(contract) {
  if (!isObject(contract)) {
    throw createDifyError("dify_contract_invalid", "Dify contract payload must be an object", { httpStatus: 502 });
  }

  const warnings = Array.isArray(contract.warnings)
    ? contract.warnings.map(normalizeOptionalText).filter(Boolean)
    : [];
  const { recordPatch, rejectedFields } = normalizeDifyRecordPatch(contract.recordPatch);
  const rawSelectionRows =
    Array.isArray(contract.selectionCriteriaRows)
      ? contract.selectionCriteriaRows
      : Array.isArray(contract.recordPatch?.selectionCriteriaRows)
        ? contract.recordPatch.selectionCriteriaRows
        : [];
  let selectionCriteriaRows = [];

  if (rawSelectionRows.length) {
    try {
      selectionCriteriaRows = normalizeSelectionCriteriaRows(rawSelectionRows, { requireCoverage: true });
    } catch (error) {
      throw createDifyError(
        normalizeOptionalText(error?.code) || "dify_selection_criteria_invalid",
        normalizeOptionalText(error?.message) || "Dify selection criteria are invalid",
        { httpStatus: 502 }
      );
    }
  }

  if (rejectedFields.length) {
    warnings.push(`dify_record_patch_fields_rejected:${rejectedFields.join(",")}`);
  }

  const documentFindings = (Array.isArray(contract.documentFindings) ? contract.documentFindings : [])
    .map(normalizeDocumentFinding)
    .filter(Boolean);

  if (Object.keys(recordPatch).length && !documentFindings.length) {
    warnings.push("dify_evidence_missing");
  }

  return {
    status: normalizeOptionalText(contract.status) || "succeeded",
    recordPatch,
    selectionCriteriaRows,
    documentFindings,
    warnings: uniqueStrings(warnings),
    metadata: isObject(contract.metadata) ? sanitizeJsonValue(contract.metadata) : {}
  };
}

export function normalizeDifyRecordPatch(patch) {
  const result = {};
  const rejectedFields = [];

  if (!isObject(patch)) {
    return {
      recordPatch: result,
      rejectedFields
    };
  }

  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_RECORD_PATCH_FIELDS.has(key)) {
      rejectedFields.push(key);
      continue;
    }

    if (key === "selectionCriteriaRows") {
      continue;
    }

    result[key] = value;
  }

  return {
    recordPatch: result,
    rejectedFields
  };
}

async function requestDifyWorkflow({ config, payload, user, fetchImpl }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}${config.apiPath}`, {
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
        user
      }),
      signal: controller.signal
    });
    const responsePayload = await readJsonResponse(response);

    if (!response.ok) {
      throw createDifyError("dify_api_request_failed", normalizeDifyApiError(response, responsePayload), {
        httpStatus: 502,
        details: {
          status: response.status,
          error: sanitizeJsonValue(responsePayload)
        }
      });
    }

    return {
      payload: responsePayload
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createDifyError("dify_api_timeout", "Dify API request timed out", { httpStatus: 504 });
    }

    if (error?.code) {
      throw error;
    }

    throw createDifyError("dify_api_request_failed", normalizeOptionalText(error?.message) || "Dify API request failed", {
      httpStatus: 502
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRecordPayload(record) {
  const payload = {};

  for (const field of RECORD_PAYLOAD_FIELDS) {
    if (DOCUMENT_LINK_FIELDS.has(field)) {
      continue;
    }

    if (record?.[field] !== undefined) {
      payload[field] = record[field];
    }
  }

  return payload;
}

function collectDifyDocuments(record, config, warnings) {
  const markdownCandidates = collectMarkdownDocumentCandidates(record);
  const jsonCandidates = collectJsonArtifactCandidates(record);
  const byDocumentId = new Map();

  for (const markdownCandidate of markdownCandidates) {
    const documentId = normalizeOptionalText(markdownCandidate.documentId || markdownCandidate.id);

    if (!documentId || byDocumentId.has(documentId)) {
      continue;
    }

    const markdownPath = resolveAllowedMarkdownPath(markdownCandidate);
    let markdown = "";

    if (markdownPath && fs.existsSync(markdownPath)) {
      markdown = fs.readFileSync(markdownPath, "utf-8");
    }

    if (markdown.length > config.maxDocumentChars) {
      markdown = markdown.slice(0, config.maxDocumentChars);
      warnings.push(`dify_document_markdown_truncated:${documentId}`);
    }

    byDocumentId.set(documentId, {
      documentId,
      title: normalizeOptionalText(markdownCandidate.label || markdownCandidate.title || markdownCandidate.fileName || markdownCandidate.name || documentId),
      kind: normalizeOptionalText(markdownCandidate.kind || "normalized_markdown"),
      sourceFileName: normalizeOptionalText(markdownCandidate.sourceFileName || markdownCandidate.fileName || markdownCandidate.name),
      extractionStatus: normalizeOptionalText(markdownCandidate.status),
      markdown,
      jsonArtifacts: []
    });
  }

  for (const jsonCandidate of jsonCandidates) {
    const artifactPath = resolveAllowedJsonArtifactPath(record, jsonCandidate);
    let jsonArtifact = null;
    let serialized = "";

    if (artifactPath && fs.existsSync(artifactPath)) {
      serialized = fs.readFileSync(artifactPath, "utf-8");
      if (serialized.length > config.maxJsonArtifactChars) {
        serialized = serialized.slice(0, config.maxJsonArtifactChars);
        warnings.push(`dify_json_artifact_truncated:${normalizeOptionalText(jsonCandidate.artifactKey || jsonCandidate.documentId)}`);
      }

      try {
        jsonArtifact = sanitizeJsonValue(JSON.parse(serialized));
      } catch (_error) {
        jsonArtifact = serialized;
      }
    }

    const artifactKey = normalizeOptionalText(jsonCandidate.artifactKey || jsonCandidate.documentId || jsonCandidate.label);
    const documentId = normalizeOptionalText(jsonCandidate.documentId || jsonCandidate.sourceDocumentId || `artifact-${artifactKey}`);
    const targetDocumentId = documentId.startsWith("artifact-") ? documentId : documentId || `artifact-${artifactKey}`;
    const entry = byDocumentId.get(targetDocumentId) || {
      documentId: targetDocumentId,
      title: normalizeOptionalText(jsonCandidate.label || jsonCandidate.fileName || artifactKey || targetDocumentId),
      kind: normalizeOptionalText(jsonCandidate.kind || "json_artifact"),
      sourceFileName: normalizeOptionalText(jsonCandidate.fileName),
      extractionStatus: normalizeOptionalText(jsonCandidate.status),
      markdown: "",
      jsonArtifacts: []
    };

    if (jsonArtifact !== null) {
      entry.jsonArtifacts.push({
        artifactKey,
        title: normalizeOptionalText(jsonCandidate.label || artifactKey),
        content: jsonArtifact
      });
    }

    byDocumentId.set(targetDocumentId, entry);
  }

  const documents = [...byDocumentId.values()]
    .filter((document) => document.markdown || document.jsonArtifacts.length)
    .slice(0, config.maxDocuments);

  if (byDocumentId.size > documents.length) {
    warnings.push(`dify_documents_omitted:${byDocumentId.size - documents.length}`);
  }

  if (!documents.length) {
    warnings.push("dify_documents_content_missing");
  }

  return documents;
}

function collectMarkdownDocumentCandidates(record) {
  const artifacts = record?.documentArtifacts?.normalizedMarkdown;
  const workflowExtractionDocuments = record?.workflow?.extraction?.documents;
  const workflowAnalysisDocuments = record?.workflow?.analysis?.documents;
  const recordDocuments = Array.isArray(record?.documents) ? record.documents : [];

  return [
    ...(Array.isArray(artifacts) ? artifacts : []),
    ...(recordDocuments.filter((document) => document?.kind === "normalized_markdown" || document?.group === "normalizedMarkdown")),
    ...(Array.isArray(workflowExtractionDocuments) ? workflowExtractionDocuments : []),
    ...(Array.isArray(workflowAnalysisDocuments) ? workflowAnalysisDocuments : [])
  ].map((document) => {
    const extraction = isObject(document?.extraction) ? document.extraction : {};

    return {
      ...document,
      documentId: normalizeOptionalText(document?.documentId || document?.id),
      href: normalizeOptionalText(document?.href || extraction.markdownHref || document?.markdownHref || document?.mdHref),
      path: normalizeOptionalText(document?.path || extraction.markdownPath || document?.markdownPath || document?.mdPath),
      extraction
    };
  });
}

function collectJsonArtifactCandidates(record) {
  const artifacts = record?.documentArtifacts?.jsonArtifacts;
  const documents = Array.isArray(record?.documents)
    ? record.documents.filter((document) => document?.kind === "json_artifact" || document?.group === "jsonArtifacts")
    : [];
  const workflowArtifacts = [
    record?.workflow?.extraction?.artifacts,
    record?.workflow?.analysis?.artifacts
  ];
  const artifactDocuments = [];

  for (const sourceArtifacts of workflowArtifacts) {
    if (!isObject(sourceArtifacts)) {
      continue;
    }

    for (const [artifactKey, value] of Object.entries(sourceArtifacts)) {
      if (!normalizeOptionalText(artifactKey) || !/\.json(?:$|[?#])/iu.test(normalizeOptionalText(value))) {
        continue;
      }

      artifactDocuments.push({
        kind: "json_artifact",
        artifactKey,
        documentId: `artifact-${artifactKey}`,
        label: artifactKey,
        href: normalizeOptionalText(value)
      });
    }
  }

  return uniqueArtifacts([
    ...(Array.isArray(artifacts) ? artifacts : []),
    ...documents,
    ...artifactDocuments
  ]);
}

function enforcePayloadSize(payload, config, warnings) {
  let nextPayload = payload;
  let serialized = JSON.stringify(nextPayload);

  if (serialized.length <= config.maxPayloadChars) {
    return {
      payload: nextPayload
    };
  }

  warnings.push("dify_payload_truncated");
  const documents = nextPayload.documents.map((document) => ({
    ...document,
    markdown: truncateText(document.markdown, Math.max(5_000, Math.floor(config.maxDocumentChars / 2))),
    jsonArtifacts: document.jsonArtifacts.map((artifact) => ({
      ...artifact,
      content: truncateJsonArtifactContent(artifact.content, Math.max(2_000, Math.floor(config.maxJsonArtifactChars / 2)))
    }))
  }));
  nextPayload = {
    ...nextPayload,
    documents
  };
  serialized = JSON.stringify(nextPayload);

  while (serialized.length > config.maxPayloadChars && nextPayload.documents.length > 1) {
    nextPayload = {
      ...nextPayload,
      documents: nextPayload.documents.slice(0, -1)
    };
    warnings.push("dify_payload_document_omitted_for_size");
    serialized = JSON.stringify(nextPayload);
  }

  return {
    payload: nextPayload
  };
}

function buildPayloadSummary(payload, warnings) {
  const documents = Array.isArray(payload.documents) ? payload.documents : [];

  return {
    contractVersion: payload.context?.contractVersion || CONTRACT_VERSION,
    recordId: normalizeOptionalText(payload.context?.recordId),
    documentCount: documents.length,
    documents: documents.map((document) => ({
      documentId: normalizeOptionalText(document.documentId),
      title: normalizeOptionalText(document.title),
      kind: normalizeOptionalText(document.kind),
      markdownChars: String(document.markdown || "").length,
      jsonArtifactCount: Array.isArray(document.jsonArtifacts) ? document.jsonArtifacts.length : 0
    })),
    warningCount: warnings.length,
    warnings: uniqueStrings(warnings)
  };
}

function buildDifyInstructions() {
  return {
    expectedOutput: {
      recordPatch: "object with allowed scoring card fields only",
      selectionCriteriaRows: "array of rows: group, title, weightPercent, coverageStatus, coverageNote, sourceExcerpt",
      documentFindings: "array of evidence: field/target, documentId, quote/excerpt, reason/note, confidence",
      warnings: "array of warning strings",
      metadata: "object without secrets or links"
    },
    allowedPatchFields: [...ALLOWED_RECORD_PATCH_FIELDS],
    selectionCriteriaEnums: {
      group: ["price", "nonPrice", "requirement"],
      coverageStatus: ["full", "partial", "none"]
    }
  };
}

function extractWorkflowOutputs(rawResponse) {
  if (isObject(rawResponse?.data?.outputs)) {
    return rawResponse.data.outputs;
  }

  if (isObject(rawResponse?.outputs)) {
    return rawResponse.outputs;
  }

  return rawResponse;
}

function extractContractSource(outputs) {
  if (!isObject(outputs)) {
    return outputs;
  }

  for (const key of ["result", "scoring_result", "scoringResult", "json", "output"]) {
    if (outputs[key] !== undefined) {
      return outputs[key];
    }
  }

  if (["recordPatch", "selectionCriteriaRows", "documentFindings", "warnings", "metadata"].some((key) => outputs[key] !== undefined)) {
    return outputs;
  }

  const entries = Object.values(outputs);
  return entries.length === 1 ? entries[0] : outputs;
}

function parseMaybeJson(value) {
  if (isObject(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (_error) {
    const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/iu);

    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (_fencedError) {
        // fall through
      }
    }

    const objectMatch = normalized.match(/\{[\s\S]*\}/u);

    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (_objectError) {
        return null;
      }
    }
  }

  return null;
}

function normalizeDocumentFinding(value) {
  if (!isObject(value)) {
    return null;
  }

  const target = normalizeOptionalText(value.target || value.field);
  const documentId = normalizeOptionalText(value.documentId);
  const quote = normalizeOptionalText(value.quote || value.excerpt);
  const note = normalizeOptionalText(value.reason || value.note);

  if (!target && !documentId && !quote && !note) {
    return null;
  }

  return {
    target,
    field: normalizeOptionalText(value.field || target),
    documentId,
    quote,
    excerpt: quote,
    note,
    confidence: normalizeConfidence(value.confidence)
  };
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 20) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }

  if (!isObject(value)) {
    if (typeof value === "string" && looksLikeForbiddenReference(value)) {
      return "";
    }

    return value;
  }

  const result = {};

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenKey(key)) {
      continue;
    }

    result[key] = sanitizeJsonValue(item, depth + 1);
  }

  return result;
}

function resolveAllowedMarkdownPath(document) {
  const rawPath = normalizeOptionalText(document.path || document.extraction?.markdownPath);
  const rawHref = normalizeOptionalText(document.href || document.extraction?.markdownHref);
  const candidates = [rawPath, rawHref].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveExtractorArtifactPath(candidate);

    if (resolved && isMarkdownPath(resolved)) {
      return resolved;
    }
  }

  return "";
}

function resolveAllowedJsonArtifactPath(record, artifact) {
  const candidates = [
    normalizeOptionalText(artifact.path),
    normalizeOptionalText(artifact.href),
    resolveArtifactKeyValue(record, artifact.artifactKey)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveExtractorArtifactPath(candidate);

    if (resolved && /\.json$/iu.test(path.basename(resolved))) {
      return resolved;
    }
  }

  return "";
}

function resolveArtifactKeyValue(record, artifactKey) {
  const normalizedArtifactKey = normalizeOptionalText(artifactKey);

  if (!normalizedArtifactKey) {
    return "";
  }

  for (const artifacts of [record?.workflow?.extraction?.artifacts, record?.workflow?.analysis?.artifacts]) {
    if (isObject(artifacts) && normalizeOptionalText(artifacts[normalizedArtifactKey])) {
      return normalizeOptionalText(artifacts[normalizedArtifactKey]);
    }
  }

  return "";
}

function resolveExtractorArtifactPath(value) {
  const runsRoot = process.env.SCORING_EXTRACTOR_RUNS_ROOT
    ? path.resolve(process.env.SCORING_EXTRACTOR_RUNS_ROOT)
    : path.resolve(getProjectRoot(), "artifacts", "scoring-extractor", "runs");
  const normalizedValue = normalizeOptionalText(value);
  let candidatePath = "";

  if (!normalizedValue) {
    return "";
  }

  const artifactRelative = extractArtifactRelativePath(normalizedValue);

  if (artifactRelative) {
    candidatePath = path.resolve(runsRoot, artifactRelative);
  } else if (path.isAbsolute(normalizedValue)) {
    candidatePath = path.resolve(normalizedValue);
  } else {
    return "";
  }

  const relativeFromRuns = path.relative(runsRoot, candidatePath);

  if (!relativeFromRuns || relativeFromRuns.startsWith("..") || path.isAbsolute(relativeFromRuns)) {
    return "";
  }

  return candidatePath;
}

function extractArtifactRelativePath(value) {
  try {
    const parsed = new URL(value, "http://localhost");
    const match = decodeURIComponent(parsed.pathname).match(/^\/artifacts\/(.+)$/u);
    return match ? match[1] : "";
  } catch (_error) {
    const normalized = value.replaceAll("\\", "/");
    const match = normalized.match(/^\/?artifacts\/(.+)$/u);
    return match ? decodeURIComponent(match[1]) : "";
  }
}

function writeDebugPayloadIfEnabled({ config, job, payload }) {
  if (!config.debugPayload) {
    return;
  }

  const debugRoot = path.join(getLocalAnalysisWorkspaceRoot(), "dify-debug");
  fs.mkdirSync(debugRoot, { recursive: true });
  const fileName = `${sanitizeFileSegment(job?.id || Date.now())}.payload.json`;
  fs.writeFileSync(path.join(debugRoot, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function normalizeDifyApiError(response, payload) {
  return normalizeOptionalText(payload?.message || payload?.error || payload?.code) || `dify_api_${response.status}`;
}

function truncateJsonArtifactContent(value, maxChars) {
  if (typeof value === "string") {
    return truncateText(value, maxChars);
  }

  const serialized = JSON.stringify(value);

  if (serialized.length <= maxChars) {
    return value;
  }

  return {
    truncated: true,
    text: serialized.slice(0, maxChars)
  };
}

function truncateText(value, maxChars) {
  const text = String(value || "");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function buildDifyUser(record, job) {
  return `scoring:${normalizeOptionalText(record?.id) || "record"}:${normalizeOptionalText(job?.id) || "job"}`;
}

function normalizeBaseUrl(value) {
  return normalizeOptionalText(value).replace(/\/+$/u, "");
}

function normalizeApiPath(value) {
  const normalized = normalizeOptionalText(value) || DEFAULT_DIFY_API_PATH;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeDifyResponseMode(value) {
  const normalized = normalizeOptionalText(value).toLowerCase();
  return ["blocking", "streaming"].includes(normalized) ? normalized : DEFAULT_DIFY_RESPONSE_MODE;
}

function readPositiveInt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function readBooleanEnv(value) {
  const normalized = normalizeOptionalText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeConfidence(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
}

function uniqueArtifacts(items) {
  const seen = new Set();
  const result = [];

  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeOptionalText(item?.documentId || item?.artifactKey || item?.href || item?.path || item?.fileName || item?.label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeOptionalText).filter(Boolean))];
}

function isMarkdownPath(value) {
  return /\.md(?:own)?$/iu.test(path.basename(value));
}

function isForbiddenKey(key) {
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
}

function looksLikeForbiddenReference(value) {
  const normalized = String(value || "").trim();
  return /(?:^|[/\\])(?:users|home|tmp|var|app|data)[/\\]/iu.test(normalized) ||
    /^[a-z]:\\/iu.test(normalized) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)/iu.test(normalized) ||
    /^\/(?:api\/records|assets\/storage|artifacts)\//iu.test(normalized);
}

function sanitizeFileSegment(value) {
  return normalizeOptionalText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `dify-${Date.now()}`;
}

function createDifyError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = options.httpStatus || 500;
  error.details = options.details ?? null;
  return error;
}

function normalizeOptionalText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
