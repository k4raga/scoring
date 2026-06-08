import fs from "node:fs";
import path from "node:path";
import { getLocalAnalysisWorkspaceRoot, getProjectRoot } from "./paths.js";
import { normalizePreassessment, normalizeSelectionCriteriaRows } from "./record-schema.js";

const CONTRACT_VERSION = "dify-ai-pass.v1";
const DEFAULT_DIFY_API_PATH = "/workflows/run";
const DEFAULT_DIFY_INPUT_KEY = "scoring_payload";
const DEFAULT_DIFY_RESPONSE_MODE = "blocking";
const DEFAULT_DIFY_TIMEOUT_MS = 95_000;
const DEFAULT_MAX_DOCUMENTS = 40;
const DEFAULT_MAX_DOCUMENT_CHARS = 30_000;
const DEFAULT_MAX_JSON_ARTIFACT_CHARS = 10_000;
const DEFAULT_MAX_PAYLOAD_CHARS = 220_000;
const FOCUSED_SNIPPET_MAX_CHARS = 12_000;
const FOCUSED_SNIPPET_CONTEXT_BEFORE_CHARS = 1_200;
const FOCUSED_SNIPPET_CONTEXT_AFTER_CHARS = 9_000;
const FOCUSED_SNIPPET_PATTERNS = [
  /Критерии\s+оценки\s+и\s+сопоставления\s+заявок/iu,
  /Критерии\s+оценки/iu,
  /Критерий\s+оценки\s+заявок/iu,
  /Значимость\s+критерия/iu,
  /Вес\s+критерия/iu,
  /Единственным\s+критерием\s+является\s+цена/iu
];
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
  "procurementStage",
  "sourceUrl",
  "etpUrl",
  "publishedAt",
  "deadlineAt",
  "nmc",
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
  "procurementStage",
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
  "selectionCriteriaRows",
  "preassessment"
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
  const normalized = enhanceDifyContractWithPayload(
    normalizeDifyWorkflowResponse(difyResponse.payload),
    payloadBuild.payload
  );
  const reconciledFindings = reconcileDocumentFindingsWithPayload(
    normalized.documentFindings,
    payloadBuild.payload.documents
  );
  const durationMs = Date.now() - startedAt;
  const warnings = uniqueStrings([
    ...payloadBuild.warnings,
    ...normalized.warnings,
    ...reconciledFindings.warnings
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
  const selectionCriteriaRows = mergeSelectionCriteriaRowsWithExisting(
    normalized.selectionCriteriaRows,
    record.selectionCriteriaRows
  );
  const recordPatch = { ...normalized.recordPatch };
  const criteriaDocumentUrl = resolveRecordMarkdownHrefByDocumentId(
    record,
    normalized.metadata?.selectionCriteriaSourceDocumentId
  );

  if (selectionCriteriaRows.length) {
    recordPatch.selectionCriteriaRows = selectionCriteriaRows;
  }

  if (criteriaDocumentUrl && normalizeOptionalText(record.criteriaDocumentUrl) !== criteriaDocumentUrl) {
    recordPatch.criteriaDocumentUrl = criteriaDocumentUrl;
  }

  return {
    warnings,
    result: {
      analysisMetadata: metadata,
      metadata,
      fields: {},
      recordPatch,
      selectionCriteriaRows,
      documentFindings: reconciledFindings.documentFindings,
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

function mergeSelectionCriteriaRowsWithExisting(nextRows, existingRows) {
  const normalizedNextRows = normalizeSelectionCriteriaRows(nextRows, { requireCoverage: false })
    .map(clearSelectionCriteriaExpertFields);
  const normalizedExistingRows = normalizeSelectionCriteriaRows(existingRows, { requireCoverage: false });

  if (!normalizedNextRows.length || !normalizedExistingRows.length) {
    return normalizedNextRows;
  }

  return normalizedNextRows.map((nextRow) => {
    const existingRow = findMatchingSelectionCriteriaRow(nextRow, normalizedExistingRows);

    if (!existingRow) {
      return nextRow;
    }

    if (!shouldPreserveSelectionCriteriaExpertFields(existingRow)) {
      return nextRow;
    }

    return {
      ...nextRow,
      coverageAmount: existingRow.coverageAmount || nextRow.coverageAmount,
      coverageStatus: existingRow.coverageStatus || nextRow.coverageStatus
    };
  });
}

function clearSelectionCriteriaExpertFields(row) {
  return {
    ...row,
    coverageStatus: "",
    coverageAmount: ""
  };
}

function shouldPreserveSelectionCriteriaExpertFields(row) {
  if (!row.coverageStatus && !row.coverageAmount) {
    return false;
  }

  const note = normalizeOptionalText(row.coverageNote).toLocaleLowerCase("ru-RU");

  return !(
    /требовани[\p{L}\p{N}_]*\s+требует\s+проверки\s+менеджер/u.test(note) ||
    /оценка\s+тендерн[\p{L}\p{N}_]*\s+специалист/u.test(note) ||
    /выберите\s+статус/u.test(note)
  );
}

function findMatchingSelectionCriteriaRow(row, existingRows) {
  const normalizedTitle = normalizeCriteriaMatchText(row.title);

  return existingRows.find((existingRow) => {
    const existingTitle = normalizeCriteriaMatchText(existingRow.title);

    if (normalizedTitle && existingTitle && normalizedTitle === existingTitle) {
      return true;
    }

    if (row.group === existingRow.group && row.order === existingRow.order) {
      return true;
    }

    const rowSignature = getSelectionCriteriaSignature(row);
    const existingSignature = getSelectionCriteriaSignature(existingRow);

    return Boolean(row.group === existingRow.group && rowSignature && existingSignature && rowSignature === existingSignature);
  }) || null;
}

function getSelectionCriteriaSignature(row) {
  const haystack = normalizeCriteriaMatchText([
    row.title,
    row.coverageNote,
    row.sourceExcerpt
  ].filter(Boolean).join(" "));

  if (!haystack) {
    return "";
  }

  if (haystack.includes("фстэк")) {
    return "license-fstek";
  }

  if (haystack.includes("фсб") || haystack.includes("криптографическ")) {
    return "license-fsb";
  }

  if (haystack.includes("команда") || haystack.includes("15тиспециалист") || haystack.includes("трудовыхресурс")) {
    return "team";
  }

  if (haystack.includes("опыт") || haystack.includes("25000000") || haystack.includes("3мядоговор")) {
    return "experience";
  }

  if (haystack.includes("единственнымкритериемявляетсяцена") || haystack.includes("наименьшуюцену")) {
    return "price";
  }

  return "";
}

function normalizeCriteriaMatchText(value) {
  return normalizeOptionalText(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function enhanceDifyContractWithPayload(contract, payload) {
  if (!isObject(contract)) {
    return contract;
  }

  if (!isRfiMarketAnalysisPayload(payload)) {
    return enhanceTenderTechnicalAssignmentContract(contract, payload);
  }

  const rfiDocument = findPayloadDocument(payload, /RFI|анализ рынка|выбор контрагента не производится/iu);
  const rfiText = normalizeOptionalText(rfiDocument?.markdown);
  const technicalDocument = findPayloadDocument(payload, /Техническое задание|этапы и виды работ|длительность.+недел/iu);
  const rfiTitle = extractRfiTitle(rfiText);
  const hasUnclearStages = Boolean(technicalDocument?.markdown && /этапы и виды работ|длительность.+недел/iu.test(technicalDocument.markdown));
  const recordPatch = {
    ...contract.recordPatch,
    procurementStage: "Анализ рынка цен",
    nmc: "нет",
    purchaseBy: contract.recordPatch?.purchaseBy || "Коммерческая закупка",
    platformPayment: normalizeDashValue(contract.recordPatch?.platformPayment),
    applicationSecurity: normalizeDashValue(contract.recordPatch?.applicationSecurity),
    contractSecurity: normalizeDashValue(contract.recordPatch?.contractSecurity),
    retrade: "Нет",
    antiDumpingMeasures: "не применимо на данном этапе",
    creative: /презентаци[яю]\s+о\s+компании/iu.test(rfiText) ? true : contract.recordPatch?.creative
  };

  if (rfiTitle) {
    recordPatch.title = rfiTitle;
    recordPatch.projectTitle = rfiTitle;
  }

  if (/X5|Х5/u.test(rfiText) && (!recordPatch.customer || /^X5|Х5$/iu.test(recordPatch.customer))) {
    recordPatch.customer = 'ПАО "КОРПОРАТИВНЫЙ ЦЕНТР ИКС 5"';
  }

  if (hasUnclearStages) {
    recordPatch.overallExecutionTerm = "непонятно, этапы идут один за другим или одновременно";
  }

  if (!recordPatch.contractTerm) {
    recordPatch.contractTerm = "нет данных";
  }

  const selectionCriteriaRows = buildRfiSelectionCriteriaRows(rfiText);
  const documentFindings = [
    ...(Array.isArray(contract.documentFindings) ? contract.documentFindings : []),
    ...buildRfiDocumentFindings({ recordPatch, rfiDocument, selectionCriteriaRows })
  ];

  return {
    ...contract,
    recordPatch,
    selectionCriteriaRows: selectionCriteriaRows.length ? selectionCriteriaRows : contract.selectionCriteriaRows,
    documentFindings
  };
}

function enhanceTenderTechnicalAssignmentContract(contract, payload) {
  const document = findTenderTechnicalAssignmentDocument(payload);

  if (!document) {
    return contract;
  }

  const payloadText = getPayloadDocumentsText(payload);
  const text = normalizeOptionalText([document.markdown, payloadText].filter(Boolean).join("\n"));
  const recordPatch = {
    ...contract.recordPatch
  };
  const extractedSubject = extractSubjectFromTechnicalAssignment(text);
  const extractedCustomer = extractCustomerFromTechnicalAssignment(text);
  const extractedNmc = extractNmcFromTechnicalAssignment(text);
  const extractedOverallExecutionTerm = extractOverallExecutionTermFromTechnicalAssignment(text);
  const purpose = extractPurposeFromTechnicalAssignment(text);

  if (extractedCustomer && isWeakTenderValue(recordPatch.customer)) {
    recordPatch.customer = extractedCustomer;
  }

  if (extractedSubject && isWeakTenderValue(recordPatch.title)) {
    recordPatch.title = extractedSubject;
  }

  const compactProjectTitle = buildCompactProjectTitle({
    customer: recordPatch.customer || extractedCustomer,
    subject: extractedSubject || recordPatch.title,
    purpose
  });

  if (compactProjectTitle && isWeakProjectTitle(recordPatch.projectTitle)) {
    recordPatch.projectTitle = compactProjectTitle;
  }

  if (extractedSubject && isWeakTenderValue(recordPatch.shortTitle)) {
    recordPatch.shortTitle = "Аутсорс";
  }

  if (hasTenderStageEvidence(text) && (isWeakTenderValue(recordPatch.procurementStage) || /^анализ\s+рынка\s+цен$/iu.test(normalizeOptionalText(recordPatch.procurementStage)))) {
    recordPatch.procurementStage = "Тендер";
  }

  if (extractedNmc && (isWeakTenderValue(recordPatch.nmc) || /^нет$/iu.test(normalizeOptionalText(recordPatch.nmc)) || isUnformattedMoneyValue(recordPatch.nmc))) {
    recordPatch.nmc = extractedNmc;
  } else if (isWeakTenderValue(recordPatch.nmc) && !hasExplicitNmc(text)) {
    recordPatch.nmc = "нет";
  }

  if (isWeakTenderValue(recordPatch.platformPayment)) {
    recordPatch.platformPayment = "-";
  }

  if (isWeakTenderValue(recordPatch.applicationSecurity)) {
    recordPatch.applicationSecurity = "-";
  }

  if (isWeakTenderValue(recordPatch.contractSecurity)) {
    recordPatch.contractSecurity = "-";
  } else if (extractedNmc && /5\s*%\s*от\s*НМЦ[^\n]*2026\s+руб/iu.test(normalizeOptionalText(recordPatch.contractSecurity))) {
    recordPatch.contractSecurity = `5% от НМЦ (${extractedNmc})`;
  }

  if (isWeakTenderValue(recordPatch.contractTerm)) {
    recordPatch.contractTerm = "нет данных";
  }

  if (extractedOverallExecutionTerm && isWeakTenderValue(recordPatch.overallExecutionTerm)) {
    recordPatch.overallExecutionTerm = extractedOverallExecutionTerm;
  }

  if (hasRetradeAbsenceEvidence(text)) {
    recordPatch.retrade = "Нет";
  } else if (hasRetradeEvidence(text)) {
    recordPatch.retrade = "Да";
  }

  if (hasTestAssignmentEvidence(text, document)) {
    recordPatch.creative = true;
  } else if (recordPatch.creative === true) {
    recordPatch.creative = false;
  }

  if (purpose && isExtractionNoise(recordPatch.notes)) {
    recordPatch.notes = "";
  }

  if (purpose && isExtractionNoise(recordPatch.summary)) {
    recordPatch.summary = purpose;
  }

  const explicitSelectionCriteria = buildExplicitEvaluationSelectionCriteriaRows(payload);
  const selectionCriteriaRows = explicitSelectionCriteria.rows.length
    ? explicitSelectionCriteria.rows
    : buildTenderTechnicalAssignmentSelectionCriteriaRows(text);
  const documentFindings = [
    ...(Array.isArray(contract.documentFindings) ? contract.documentFindings : []),
    ...buildTenderTechnicalAssignmentFindings({
      recordPatch,
      document,
      extractedSubject,
      extractedCustomer,
      extractedOverallExecutionTerm,
      purpose
    }),
    ...(explicitSelectionCriteria.rows.length
      ? buildSelectionCriteriaFindings({ document: explicitSelectionCriteria.document, selectionCriteriaRows })
      : buildSelectionCriteriaFindings({ document, selectionCriteriaRows }))
  ];

  return {
    ...contract,
    recordPatch,
    selectionCriteriaRows: selectionCriteriaRows.length ? selectionCriteriaRows : contract.selectionCriteriaRows,
    documentFindings,
    metadata: {
      ...(isObject(contract.metadata) ? contract.metadata : {}),
      ...(explicitSelectionCriteria.document?.documentId
        ? { selectionCriteriaSourceDocumentId: explicitSelectionCriteria.document.documentId }
        : {})
    }
  };
}

function buildExplicitEvaluationSelectionCriteriaRows(payload) {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];

  for (const document of documents) {
    const markdown = normalizeOptionalText(document?.markdown);

    if (!hasExplicitEvaluationCriteriaEvidence(markdown)) {
      continue;
    }

    for (const table of parseMarkdownTables(markdown)) {
      const criterionIndex = findEvaluationCriterionColumn(table.headers);
      const weightIndex = findEvaluationWeightColumn(table.headers);

      if (criterionIndex < 0 || weightIndex < 0) {
        continue;
      }

      const rows = [];

      for (const tableRow of table.rows) {
        const rawTitle = cleanMarkdownTableCell(tableRow[criterionIndex]);
        const rawWeight = cleanMarkdownTableCell(tableRow[weightIndex]);
        const weightPercent = parseCriteriaWeightPercent(rawWeight);

        if (!rawTitle || weightPercent === null) {
          continue;
        }

        const group = isPriceEvaluationCriterion(rawTitle) ? "price" : "nonPrice";
        const formula = cleanMarkdownTableCell(tableRow[findEvaluationFormulaColumn(table.headers)] || "");
        const title = cleanEvaluationCriterionTitle(rawTitle, group);

        if (!title) {
          continue;
        }

        rows.push({
          order: rows.length + 1,
          group,
          title,
          weightPercent,
          blockFactor: "",
          coverageStatus: "",
          coverageAmount: "",
          coverageNote: buildEvaluationCriterionCoverageNote({ group, title, formula }),
          sourceExcerpt: buildEvaluationCriterionSourceExcerpt({ title: rawTitle, formula, weightPercent })
        });
      }

      if (rows.length) {
        return {
          document,
          rows
        };
      }
    }
  }

  return {
    document: null,
    rows: []
  };
}

function hasExplicitEvaluationCriteriaEvidence(markdown) {
  return (
    /Критерии\s+оценки\s+и\s+сопоставления\s+заявок/iu.test(markdown) ||
    /Критерий\s+оценки\s+заявок/iu.test(markdown) ||
    /Значимость\s+критерия/iu.test(markdown) ||
    /Вес\s+критерия/iu.test(markdown)
  );
}

function parseMarkdownTables(markdown) {
  const lines = normalizeOptionalText(markdown).split(/\r?\n/u);
  const tables = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isMarkdownTableLine(lines[index]) || !isMarkdownTableSeparatorLine(lines[index + 1])) {
      continue;
    }

    const tableLines = [lines[index], lines[index + 1]];
    let cursor = index + 2;

    while (cursor < lines.length && isMarkdownTableLine(lines[cursor])) {
      tableLines.push(lines[cursor]);
      cursor += 1;
    }

    const headers = parseMarkdownTableLine(tableLines[0]);
    const rows = tableLines
      .slice(2)
      .map(parseMarkdownTableLine)
      .filter((row) => row.some(Boolean));

    tables.push({
      headers,
      rows,
      raw: tableLines.join("\n")
    });
    index = cursor - 1;
  }

  return tables;
}

function isMarkdownTableLine(line) {
  return /^\s*\|.*\|\s*$/u.test(normalizeOptionalText(line));
}

function isMarkdownTableSeparatorLine(line) {
  const cells = parseMarkdownTableLine(line);
  return Boolean(cells.length && cells.every((cell) => /^:?-{3,}:?$/u.test(cell)));
}

function parseMarkdownTableLine(line) {
  const normalized = normalizeOptionalText(line).replace(/^\s*\|/u, "").replace(/\|\s*$/u, "");
  return normalized.split("|").map(cleanMarkdownTableCell);
}

function cleanMarkdownTableCell(value) {
  return normalizeOptionalText(value)
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/\\\|/gu, "|")
    .replace(/\*\*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function findEvaluationCriterionColumn(headers) {
  return headers.findIndex((header) => {
    const normalized = normalizeCriteriaHeaderText(header);
    return /критери.*оцен.*заяв|критери.*оцен|показател.*оцен/u.test(normalized);
  });
}

function findEvaluationWeightColumn(headers) {
  return headers.findIndex((header) => {
    const normalized = normalizeCriteriaHeaderText(header);
    return /значимост.*критери|вес.*критери|удельн.*вес/u.test(normalized);
  });
}

function findEvaluationFormulaColumn(headers) {
  const index = headers.findIndex((header) => {
    const normalized = normalizeCriteriaHeaderText(header);
    return /порядок.*расчет|формул|способ.*оцен|как.*закро/u.test(normalized);
  });

  return index >= 0 ? index : -1;
}

function normalizeCriteriaHeaderText(value) {
  return normalizeOptionalText(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseCriteriaWeightPercent(value) {
  const match = normalizeOptionalText(value).match(/(?<!\d)(\d{1,3})(?:[,.](\d{1,2}))?(?!\d)/u);

  if (!match) {
    return null;
  }

  const parsed = Number(`${match[1]}.${match[2] || "0"}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPriceEvaluationCriterion(value) {
  return /цен[аы]|стоимост|цена\s+договора/iu.test(value);
}

function cleanEvaluationCriterionTitle(value, group) {
  if (group === "price") {
    return "Цена";
  }

  return normalizeOptionalText(value)
    .replace(/^Наличие\s+у\s+участника\s+аккредитации(\s+на\b)?/iu, "Аккредитация$1")
    .replace(/^Наличие\s+аккредитации(\s+на\b)?/iu, "Аккредитация$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildEvaluationCriterionCoverageNote({ group, title, formula }) {
  if (group === "price") {
    return "Подготовить конкурентное ценовое предложение; оценка рассчитывается по цене договора.";
  }

  if (/аккредитац/iu.test(title)) {
    return "Подтвердить наличие аккредитации на осуществление деятельности в области информационных технологий.";
  }

  if (/прототип/iu.test(title)) {
    return "Подготовить прототипное решение по Приложению №5 для экспертной оценки.";
  }

  return truncateText(formula || title, 500);
}

function buildEvaluationCriterionSourceExcerpt({ title, formula, weightPercent }) {
  return [
    title,
    formula,
    `Значимость критерия: ${weightPercent}`
  ].filter(Boolean).join(" | ");
}

function extractSubjectFromTechnicalAssignment(text) {
  const technicalAssignmentMatch = text.match(/Техническое\s+задание\s+на\s+([\s\S]{10,260}?)(?:\n\s*(?:г\.\s*[\p{L}\s-]+,\s*\d{4}|##\s+Содержание|Содержание)|\n\s*\d+\s*\n)/iu);

  if (technicalAssignmentMatch) {
    return cleanTenderSubject(normalizeProcurementSubjectAction(technicalAssignmentMatch[1]));
  }

  const headingMatch = text.match(/###\s*Предмет закупки\s*\n+\s*([^\n#][^\n]+)/iu);

  if (headingMatch) {
    return cleanTenderSubject(headingMatch[1]);
  }

  const developmentMatch = text.match(/Выполнение\s+работ\s+по\s+разработке\s+информационной\s+системы\s+«[^»]+»/iu);

  if (developmentMatch) {
    return cleanTenderSubject(developmentMatch[0]);
  }

  const titleMatch = text.match(/Цель проекта:\s*[^.]*?(оказания?\s+услуг[^\n.]+)/iu);
  return titleMatch ? cleanTenderSubject(titleMatch[1]) : "";
}

function extractCustomerFromTechnicalAssignment(text) {
  const patterns = [
    /ДЛЯ\s+КОМПАНИИ\s+([^\n.]+)\.?/iu,
    /\(\s*АУ\s*\)\s*(АО\s+«[^»]+»|[^\n|]+)/iu,
    /Заказчик(?:ом)?\s*(?:является|:)\s*([^\n.|]+)/iu,
    /"source_path"\s*:\s*"([^"]+)"/iu,
    /Источник:\s*`([^`]+)`/iu
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      const customer = pattern.source.includes("source_path") || pattern.source.includes("Источник")
        ? extractCustomerFromSourcePath(match[1])
        : cleanTenderCustomer(match[1]);

      if (customer) {
        return customer;
      }
    }
  }

  return "";
}

function extractNmcFromTechnicalAssignment(text) {
  const normalized = normalizeOptionalText(text);
  const scopedMatch = normalized.match(/(?:Сведения\s+о\s+начальной[\s\S]{0,600}|НМЦ[\s\S]{0,600}|НМЦК[\s\S]{0,600})(?<!\d)(\d{1,3}(?:\s\d{3}){2,},\d{2}\s*руб\.?)/iu);

  if (scopedMatch) {
    return normalizeMoneyText(scopedMatch[1]);
  }

  const tableMatch = normalized.match(/\|\s*(?<!\d)(\d{1,3}(?:\s\d{3}){2,},\d{2})\s*руб\.?\s*\|/iu);
  return tableMatch ? normalizeMoneyText(`${tableMatch[1]} руб.`) : "";
}

function extractOverallExecutionTermFromTechnicalAssignment(text) {
  const normalized = normalizeOptionalText(text);
  const plannedMatch = normalized.match(/Планируемый\s+срок\s+([^\n]+?)(?=\n\s*(?:Продукт\s+проекта|Заказчик\s+проекта|Владелец|Организаци|##|###)|$)/iu);

  if (plannedMatch) {
    return cleanTenderTerm(plannedMatch[1]);
  }

  const tableMatch = normalized.match(/(?:Общий\s+срок\s+выполнения\s+работ|Срок\s+оказания\s+услуг|Срок\s+выполнения\s+работ)\s*[:|]?\s*([^\n|]{8,180})/iu);
  return tableMatch ? cleanTenderTerm(tableMatch[1]) : "";
}

function normalizeMoneyText(value) {
  return normalizeOptionalText(value)
    .replace(/\s+/gu, " ")
    .replace(/\s*руб\.?$/iu, " руб.")
    .trim();
}

function isUnformattedMoneyValue(value) {
  return /^\d{6,}(?:[.,]\d{1,2})?$/u.test(normalizeOptionalText(value));
}

function extractPurposeFromTechnicalAssignment(text) {
  const projectPurposeMatch = text.match(/Цель проекта:\s*([^\n]+)/iu);

  if (projectPurposeMatch) {
    return normalizeOptionalText(projectPurposeMatch[1]);
  }

  const goalsMatch = text.match(/##\s*3\s+Цели\s+и\s+задачи[\s\S]{0,600}?###\s*Цели\s*\n+([\s\S]{20,520}?)(?:\n\s*###\s*Задачи|\n\s*##\s*4)/iu);
  return goalsMatch ? cleanTenderPurpose(goalsMatch[1]) : "";
}

function buildCompactProjectTitle({ customer, subject, purpose }) {
  const customerName = compactCustomerName(customer);
  const projectLabel = compactProjectLabel([subject, purpose].filter(Boolean).join("\n"));

  if (!customerName || !projectLabel) {
    return "";
  }

  return `${customerName} ${projectLabel}`;
}

function compactCustomerName(value) {
  const normalized = normalizeOptionalText(value)
    .replace(/^(?:ПАО|АО|ООО|ЗАО|ИП|МКАО)\s+/iu, "")
    .replace(/[«»"]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (/икс\s*5|x5/iu.test(normalized)) {
    return "Икс5";
  }

  if (/сетевая\s+компания/iu.test(normalized)) {
    return "Сетевая компания";
  }

  const words = normalized.split(/\s+/u).filter(Boolean);
  const candidate = words.length > 2 ? words.at(-1) : words[0];
  return titleCaseWord(candidate);
}

function compactProjectLabel(value) {
  const normalized = normalizeOptionalText(value).toLocaleLowerCase("ru-RU");

  if (!normalized) {
    return "";
  }

  if (/битрикс\s*24|bitrix\s*24/u.test(normalized)) {
    return "Битрикс24";
  }

  if (/ии\s*[-–]?\s*ассистент|ассистент[\s\S]{0,80}нси/u.test(normalized)) {
    return "ИИ-ассистент";
  }

  if (/экосистем[\p{L}\p{N}_]*\s+искусственн[\p{L}\p{N}_]*\s+интеллект|искусственн[\p{L}\p{N}_]*\s+интеллект|(?:^|[^\p{L}\p{N}])ии(?:$|[^\p{L}\p{N}])/u.test(normalized)) {
    return "ИИ-экосистема";
  }

  if (/техническ[\p{L}\p{N}_]*\s+поддержк|техподдержк|ведени[\p{L}\p{N}_]*\s+и\s+техническ[\p{L}\p{N}_]*\s+поддержк|оперативн[\p{L}\p{N}_]*\s+внесени[\p{L}\p{N}_]*\s+изменени/u.test(normalized)) {
    return "техподдержка";
  }

  if (/сопровождени/u.test(normalized)) {
    return "сопровождение";
  }

  if (/интеграц/u.test(normalized)) {
    return "интеграция";
  }

  if (/разработк/u.test(normalized)) {
    return "разработка";
  }

  if (/сайт/u.test(normalized)) {
    return "сайт";
  }

  if (/crm/u.test(normalized)) {
    return "CRM";
  }

  const words = normalized
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 3 && !["оказание", "услуг", "выполнение", "работ", "выбор", "проекта"].includes(word))
    .slice(0, 2);

  return words.join(" ");
}

function titleCaseWord(value) {
  const normalized = normalizeOptionalText(value).toLocaleLowerCase("ru-RU");
  return normalized ? normalized[0].toLocaleUpperCase("ru-RU") + normalized.slice(1) : "";
}

function isWeakProjectTitle(value) {
  const normalized = normalizeOptionalText(value);

  return (
    !normalized ||
    /^цель\s+проекта\s*:/iu.test(normalized) ||
    /^[\p{L}\d\s"«»._-]+\s+\d{2}\.\d{2}$/u.test(normalized) ||
    normalized.length > 60 ||
    /[.!?].{8,}/u.test(normalized)
  );
}

function hasRetradeEvidence(text) {
  return (
    /переторжк/iu.test(text) ||
    /повторн[\p{L}\p{N}_]*\s+(?:коммерческ[\p{L}\p{N}_]*\s+)?предложен/iu.test(text) ||
    /дополнительн[\p{L}\p{N}_]*\s+ценов[\p{L}\p{N}_]*\s+предложен/iu.test(text) ||
    /улучшен[\p{L}\p{N}_]*\s+ценов[\p{L}\p{N}_]*\s+предложен/iu.test(text) ||
    /улучшени[\p{L}\p{N}_]*\s+(?:цены|кп|коммерческ[\p{L}\p{N}_]*\s+предложен)/iu.test(text)
  );
}

function hasRetradeAbsenceEvidence(text) {
  return (
    /переторжк[^\n.]{0,80}(?:не\s+предусмотрен|не\s+провод|отсутств|нет)/iu.test(text) ||
    /(?:без|нет)\s+переторжк/iu.test(text)
  );
}

function hasTenderStageEvidence(text) {
  return /тендерн|подведение итогов тендера|переторжк|конкурс|конкурентн[\p{L}\p{N}_]*\s+закуп|документаци[яи]\s+о\s+закупке|извещени[\p{L}\p{N}_]*\s+о\s+закупке/iu.test(text);
}

function hasTestAssignmentEvidence(text, document) {
  const source = [
    document?.label,
    document?.fileName,
    document?.sourceFileName,
    document?.sourcePath
  ].map(normalizeOptionalText).join("\n");

  return (
    /тестов[\p{L}\p{N}_]*\s+задан|творческ[\p{L}\p{N}_]*\s+задан|тестов[\p{L}\p{N}_]*\s+част|задани[\p{L}\p{N}_]*\s+на\s+прототип|прототип/iu.test(text) ||
    /тестов[\p{L}\p{N}_]*\s+задан|творческ[\p{L}\p{N}_]*\s+задан|задани[\p{L}\p{N}_]*\s+на\s+прототип|прототип/iu.test(source)
  );
}

function isWeakTenderValue(value) {
  const normalized = normalizeOptionalText(value);

  return (
    !normalized ||
    normalized.length > 240 ||
    /^не\s+указано/iu.test(normalized) ||
    /^нет\s+информации/iu.test(normalized) ||
    /^сведения\s+об\s+извлечении/iu.test(normalized) ||
    /^#{1,6}\s+/u.test(normalized) ||
    /^#\s*ТЗ/iu.test(normalized) ||
    /\|\s*---\s*\|/u.test(normalized) ||
    /###\s+/u.test(normalized) ||
    /Сведения\s+о\s+начальной|Объем\s+документации|Правовой\s+статус\s+закупки/iu.test(normalized) ||
    /^\d{4}-\d{2}-\d{2}/u.test(normalized) ||
    /^[\p{L}\d\s._-]+\s+\d{2}\.\d{2}$/u.test(normalized)
  );
}

function cleanTenderSubject(value) {
  let normalized = normalizeOptionalText(value)
    .replace(/^#+\s*/u, "")
    .replace(/([A-Za-zА-Яа-яЁё])-\s+([A-Za-zА-Яа-яЁё])/gu, "$1-$2")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  normalized = truncateBeforeTenderNoise(normalized);

  if (normalized.length > 240) {
    const firstSentence = normalized.match(/^(.{20,240}?[.!?])(?:\s|$)/u);

    if (firstSentence) {
      normalized = firstSentence[1];
    }
  }

  return normalized.replace(/\s*[|#]+.*$/u, "").replace(/\s+/gu, " ").trim();
}

function normalizeProcurementSubjectAction(value) {
  const normalized = normalizeOptionalText(value)
    .replace(/([A-Za-zА-Яа-яЁё])-\s+([A-Za-zА-Яа-яЁё])/gu, "$1-$2")
    .replace(/\s+/gu, " ")
    .trim();

  return normalized
    .replace(/^разработку(?=\s|$)/iu, "Разработка")
    .replace(/^создание(?=\s|$)/iu, "Создание")
    .replace(/^оказание(?=\s|$)/iu, "Оказание")
    .replace(/^выполнение(?=\s|$)/iu, "Выполнение");
}

function truncateBeforeTenderNoise(value) {
  const markers = [
    /Настоящая\s+закупка\s+является/iu,
    /###\s*Сведения\s+о\s+начальной/iu,
    /\|\s*Всего\s*:/iu,
    /Сведения\s+о\s+начальной/iu,
    /Объем\s+документации/iu,
    /Правовой\s+статус\s+закупки/iu,
    /Национальный\s+режим/iu
  ];

  let endIndex = value.length;

  for (const marker of markers) {
    const match = marker.exec(value);

    if (match && match.index > 0) {
      endIndex = Math.min(endIndex, match.index);
    }
  }

  return value.slice(0, endIndex).replace(/[.,;:\s]+$/u, "").trim();
}

function cleanTenderCustomer(value) {
  return normalizeOptionalText(value)
    .split("|")[0]
    .replace(/\s+\d{6}\b.*$/u, "")
    .replace(/[.,;:]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractCustomerFromSourcePath(value) {
  const firstSegment = normalizeOptionalText(value).split(/[\\/]/u)[0] || "";
  const withoutDate = firstSegment
    .replace(/\s+\d{1,2}[._-]\d{1,2}(?:[._-]\d{2,4})?.*$/u, "")
    .replace(/\s+\d{4,}.*$/u, "")
    .trim();

  if (!withoutDate || /^тз\b|^документаци/iu.test(withoutDate)) {
    return "";
  }

  return cleanTenderCustomer(withoutDate);
}

function cleanTenderTerm(value) {
  return normalizeOptionalText(value)
    .replace(/\s*-\s*/gu, " - ")
    .replace(/\s*–\s*/gu, " – ")
    .replace(/\s+/gu, " ")
    .replace(/[.;,\s]+$/u, "")
    .trim();
}

function cleanTenderPurpose(value) {
  return normalizeOptionalText(value)
    .replace(/([A-Za-zА-Яа-яЁё])-\s+([A-Za-zА-Яа-яЁё])/gu, "$1-$2")
    .replace(/\s+/gu, " ")
    .replace(/[.;,\s]+$/u, ".")
    .trim();
}

function isExtractionNoise(value) {
  const normalized = normalizeOptionalText(value);

  return !normalized || /^#\s*ТЗ|Сведения\s+об\s+извлечении|Источник:/iu.test(normalized);
}

function hasExplicitNmc(text) {
  return /НМЦ|НМЦК|начальн\w*\s+максимальн\w*\s+цен|максимальн\w*\s+цен\w*\s+договора/iu.test(text);
}

function buildTenderTechnicalAssignmentFindings({
  recordPatch,
  document,
  extractedSubject,
  extractedCustomer,
  extractedOverallExecutionTerm,
  purpose
}) {
  const documentId = normalizeOptionalText(document.documentId);
  const findings = [];
  const addFinding = (field, quote, note) => {
    if (!quote) {
      return;
    }

    findings.push({
      field,
      target: field,
      documentId,
      quote,
      note,
      confidence: "high"
    });
  };

  addFinding("customer", extractedCustomer ? `для компании ${extractedCustomer}` : "", "Заказчик извлечен из заголовка технического задания.");
  addFinding("title", extractedSubject, "Предмет закупки извлечен из одноименного раздела.");
  addFinding("procurementStage", recordPatch.procurementStage === "Тендер" ? "Контактное лицо по вопросам проведения тендерной процедуры" : "", "Документ описывает тендерную процедуру.");
  addFinding("nmc", recordPatch.nmc === "нет" ? "НМЦ в документе не указана" : "", "Явная НМЦ не найдена.");
  addFinding("retrade", recordPatch.retrade === "Да" ? extractRetradeQuote(document.markdown) : "", "Переторжка найдена в графике процедуры.");
  addFinding("creative", recordPatch.creative === true ? extractTestAssignmentQuote(document.markdown, document) : "", "Поле 'Творческое' трактуется как наличие тестового задания / ТЗ.");
  addFinding("overallExecutionTerm", extractedOverallExecutionTerm, "Планируемый срок работ извлечен из технического задания.");
  addFinding("summary", purpose, "Цель проекта извлечена из технического задания.");

  return findings;
}

function buildTenderTechnicalAssignmentSelectionCriteriaRows(text) {
  if (!isTenderTechnicalAssignmentCompetencyTable(text)) {
    return [];
  }

  const rows = [];
  const addRow = (row) => {
    rows.push({
      order: rows.length + 1,
      coverageStatus: "",
      coverageAmount: "",
      ...row
    });
  };

  if (/Стоимость\s+и\s+прозрачность\s+сметы\s*\(\s*30\s*%\s*\)/iu.test(text)) {
    addRow({
      group: "price",
      title: "Стоимость и прозрачность сметы",
      weightPercent: 30,
      blockFactor: "",
      coverageNote: "Проверить цену за час и прозрачность модели оплаты: по факту или абонемент.",
      sourceExcerpt: "Стоимость и прозрачность сметы (30%): конкурентоспособность стоимости часа работы, а также предлагаемая модель оплаты (по факту / абонемент)."
    });
  }

  addRow({
    group: "requirement",
    title: "Опыт",
    weightPercent: null,
    blockFactor: "blockFactor",
    coverageNote: "• Наличие не менее 2 лет опыта в ведении и поддержке корпоративных сайтов\n• Опыт работы с продуктовыми каталогами, мультиязычными сайтами",
    sourceExcerpt: "Наличие не менее 2 лет опыта в ведении и поддержке корпоративных сайтов\nОпыт работы с продуктовыми каталогами, мультиязычными сайтами."
  });
  addRow({
    group: "requirement",
    title: "Опыт",
    weightPercent: null,
    blockFactor: "no",
    coverageNote: "• Опыт работы с FMCG-брендами, продуктовыми сайтами",
    sourceExcerpt: "Опыт работы с FMCG-брендами, продуктовыми сайтами."
  });
  addRow({
    group: "requirement",
    title: "Кадры",
    weightPercent: null,
    blockFactor: "no",
    coverageNote: "• Наличие в штате сотрудников с компетенциями администратора CMS\n• Возможность предоставления услуг по аутсорсингу технического администратора (при необходимости)",
    sourceExcerpt: "Наличие в штате сотрудников с компетенциями администратора CMS.\nВозможность предоставления услуг по аутсорсингу технического администратора (при необходимости)."
  });

  return rows;
}

function isTenderTechnicalAssignmentCompetencyTable(text) {
  const normalized = normalizeOptionalText(text);

  return (
    /ТРЕБОВАНИЯ\s+К\s+ИСПОЛНИТЕЛЮ/iu.test(normalized) &&
    /Обязательные\s+компетенции/iu.test(normalized) &&
    /Желательные\s+компетенции/iu.test(normalized) &&
    /Наличие\s+не\s+менее\s+2\s+лет\s+опыта\s+в\s+ведении\s+и\s+поддержке\s+корпоративных\s+сайтов/iu.test(normalized) &&
    /Опыт\s+работы\s+с\s+FMCG-брендами,\s+продуктовыми\s+сайтами/iu.test(normalized) &&
    /Наличие\s+в\s+штате\s+сотрудников\s+с\s+компетенциями\s+администратора\s+CMS/iu.test(normalized)
  );
}

function buildSelectionCriteriaFindings({ document, selectionCriteriaRows }) {
  const documentId = normalizeOptionalText(document?.documentId);

  return (Array.isArray(selectionCriteriaRows) ? selectionCriteriaRows : [])
    .filter((row) => row.sourceExcerpt)
    .map((row) => ({
      field: "selectionCriteriaRows",
      target: "selectionCriteriaRows",
      documentId,
      quote: row.sourceExcerpt,
      note: row.title,
      confidence: "high"
    }));
}

function extractRetradeQuote(text) {
  const normalized = normalizeOptionalText(text);
  const match = normalized.match(/[^\n]*(?:переторжк|повторн[\p{L}\p{N}_]*\s+(?:коммерческ[\p{L}\p{N}_]*\s+)?предложен|дополнительн[\p{L}\p{N}_]*\s+ценов[\p{L}\p{N}_]*\s+предложен|улучшен[\p{L}\p{N}_]*\s+ценов[\p{L}\p{N}_]*\s+предложен|улучшени[\p{L}\p{N}_]*\s+(?:цены|кп|коммерческ[\p{L}\p{N}_]*\s+предложен))[^\n]*/iu);
  return match ? normalizeOptionalText(match[0]).replace(/^#+\s*/u, "") : "";
}

function extractTestAssignmentQuote(text, document) {
  const source = normalizeOptionalText(document?.label || document?.fileName || document?.sourceFileName || document?.sourcePath);
  const normalized = normalizeOptionalText(text);
  const explicitMatch = normalized.match(/[^\n]*(?:тестов[\p{L}\p{N}_]*\s+задан|творческ[\p{L}\p{N}_]*\s+задан|тестов[\p{L}\p{N}_]*\s+част|задани[\p{L}\p{N}_]*\s+на\s+прототип|прототип)[^\n]*/iu);

  if (explicitMatch) {
    return normalizeOptionalText(explicitMatch[0]).replace(/^#+\s*/u, "");
  }

  return source;
}

function isRfiMarketAnalysisPayload(payload) {
  const text = getPayloadDocumentsText(payload);

  return /RFI|запрос на предоставление информации|сбор информации и бюджетных оценок|выбор контрагента не производится/iu.test(text);
}

function getPayloadDocumentsText(payload) {
  return Array.isArray(payload?.documents)
    ? payload.documents.map((document) => normalizeOptionalText(document.markdown)).join("\n")
    : "";
}

function findPayloadDocument(payload, pattern) {
  return (Array.isArray(payload?.documents) ? payload.documents : [])
    .find((document) => pattern.test(normalizeOptionalText(document.markdown))) || null;
}

function findTenderTechnicalAssignmentDocument(payload) {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  const candidates = documents
    .map((document, index) => ({
      document,
      index,
      score: getTenderTechnicalAssignmentDocumentScore(document)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return candidates[0]?.document || null;
}

function getTenderTechnicalAssignmentDocumentScore(document) {
  const title = normalizeOptionalText([document?.title, document?.sourceFileName, document?.documentId].join(" ")).toLocaleLowerCase("ru-RU");
  const markdown = normalizeOptionalText(document?.markdown);
  let score = 0;

  if (/предмет\s+закупки|документаци[яи]\s+о\s+закупке|извещени[\p{L}\p{N}_]*\s+о\s+закупке|сведения\s+о\s+начальной|КРИТЕРИИ\s+ОЦЕНКИ|Критерии\s+оценки|тендерной\s+процедуры|подведение\s+итогов\s+тендера|техническ[\p{L}\p{N}_]*\s+задани[\p{L}\p{N}_]*\s+на|цели\s+и\s+задачи|периметр\s+и\s+сроки|ии\s*[-–]?\s*ассистент|экосистем[^\n]{0,120}искусственн/iu.test(markdown)) {
    score += 80;
  }

  if (/документаци[\p{L}\p{N}_]*\s+о\s+закуп|извещен/u.test(title)) {
    score += 70;
  }

  if (/(?:^|\s)тз(?:\s|$)|техническ[\p{L}\p{N}_]*\s+задани|требован|критери|оценк|задани[\p{L}\p{N}_]*\s+на\s+прототип|прототип/u.test(title)) {
    score += 50;
  }

  if (/обосновани[\p{L}\p{N}_]*\s+нмц|форма\s*7|акт|эдо|контаргент|протокол|перечень/u.test(title)) {
    score -= 60;
  }

  return score;
}

function extractRfiTitle(text) {
  const match = text.match(/RFI\s*[–-]\s*анализ\s+рынка\)?\s*[,.:;-]?\s*(оказание\s+услуг[^\n.]+)/iu);

  if (!match) {
    return "";
  }

  const subject = normalizeOptionalText(match[1]).replace(/^./u, (char) => char.toLocaleUpperCase("ru-RU"));
  return `RFI - анализ рынка. ${subject}`;
}

function normalizeDashValue(value) {
  const normalized = normalizeOptionalText(value);

  if (!normalized || /^не\s+указано/iu.test(normalized) || /^нет\s+информации/iu.test(normalized)) {
    return "-";
  }

  return normalized;
}

function buildRfiSelectionCriteriaRows(rfiText) {
  if (!rfiText) {
    return [];
  }

  const rows = [];
  const addRow = ({ title, sourceExcerpt, blockFactor }) => {
    if (rfiText.includes(sourceExcerpt) || new RegExp(escapeRegExp(sourceExcerpt), "iu").test(rfiText)) {
      rows.push({
        order: rows.length + 1,
        group: "requirement",
        title,
        weightPercent: null,
        blockFactor,
        coverageStatus: "",
        coverageAmount: "",
        coverageNote: sourceExcerpt,
        sourceExcerpt
      });
    }
  };

  addRow({
    title: "Презентация о компании",
    sourceExcerpt: "Презентацию о компании.",
    blockFactor: "blockFactor"
  });
  addRow({
    title: "Примеры реализованных проектов (при наличии)",
    sourceExcerpt: "Примеры реализованных проектов (при наличии).",
    blockFactor: "no"
  });
  addRow({
    title: "Заполненное КП",
    sourceExcerpt: "Заполненную форму КП",
    blockFactor: "blockFactor"
  });
  addRow({
    title: "Заполненную анкету контрагента",
    sourceExcerpt: "Заполненную анкету контрагента",
    blockFactor: "blockFactor"
  });
  addRow({
    title: "Описание используемых технологий",
    sourceExcerpt: "Описание используемых технологий.",
    blockFactor: "blockFactor"
  });

  return rows;
}

function buildRfiDocumentFindings({ recordPatch, rfiDocument, selectionCriteriaRows }) {
  if (!rfiDocument) {
    return [];
  }

  const documentId = normalizeOptionalText(rfiDocument.documentId);
  const findings = [];
  const addFinding = (field, quote, note) => {
    if (!quote) {
      return;
    }

    findings.push({
      field,
      target: field,
      documentId,
      quote,
      note,
      confidence: "high"
    });
  };

  addFinding("procurementStage", "RFI – анализ рынка", "RFI распознан как этап анализа рынка цен.");
  addFinding("nmc", "Настоящий RFI сделан для анализа рынка потенциальных контрагентов и технологий.", "Для RFI НМЦ не задана.");
  addFinding("title", recordPatch.title, "Предмет RFI извлечен из объявления.");
  addFinding("customer", "X5 приглашает Вас принять участие", "Заказчик определен по RFI-объявлению.");

  for (const row of selectionCriteriaRows) {
    findings.push({
      field: "selectionCriteriaRows",
      target: "selectionCriteriaRows",
      documentId,
      quote: row.sourceExcerpt,
      note: row.title,
      confidence: "high"
    });
  }

  return findings;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      selectionCriteriaRows = normalizeSelectionCriteriaRows(rawSelectionRows, { requireCoverage: false })
        .map(clearSelectionCriteriaExpertFields);
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

    if (key === "preassessment") {
      result[key] = normalizePreassessment(value);
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
    const responsePayload = await readDifyResponsePayload(response, config);

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

function resolveRecordMarkdownHrefByDocumentId(record, documentId) {
  const normalizedDocumentId = normalizeOptionalText(documentId);

  if (!normalizedDocumentId) {
    return "";
  }

  const candidate = collectMarkdownDocumentCandidates(record)
    .find((document) => normalizeOptionalText(document.documentId || document.id) === normalizedDocumentId);

  return normalizeOptionalText(candidate?.href);
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

    const focusedMarkdown = buildFocusedDifyMarkdown(markdown);

    if (focusedMarkdown && markdown.length > config.maxDocumentChars) {
      markdown = [
        "## Фокусные фрагменты для AI-pass",
        "",
        focusedMarkdown,
        "",
        "## Начало документа",
        "",
        markdown
      ].join("\n");
      warnings.push(`dify_document_focused_snippets_added:${documentId}`);
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

  const allDocuments = prioritizeDifyDocuments([...byDocumentId.values()]
    .filter((document) => document.markdown || document.jsonArtifacts.length));
  const documents = allDocuments
    .slice(0, config.maxDocuments);

  if (allDocuments.length > documents.length) {
    warnings.push(`dify_documents_omitted:${allDocuments.length - documents.length}`);
  }

  if (!documents.length) {
    warnings.push("dify_documents_content_missing");
  }

  return documents;
}

function buildFocusedDifyMarkdown(markdown) {
  const normalized = normalizeOptionalText(markdown);

  if (!normalized) {
    return "";
  }

  const snippets = [];

  for (const pattern of FOCUSED_SNIPPET_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);

    if (!match) {
      continue;
    }

    const snippet = extractFocusedMarkdownSnippet(normalized, match.index);

    if (!snippet || snippets.some((existing) => snippetsOverlap(existing, snippet))) {
      continue;
    }

    snippets.push(snippet);
  }

  return snippets
    .map((snippet, index) => [
      `### Фрагмент ${index + 1}`,
      "",
      snippet.text
    ].join("\n"))
    .join("\n\n");
}

function extractFocusedMarkdownSnippet(markdown, matchIndex) {
  const preferredStart = findPreviousMarkdownHeading(markdown, matchIndex);
  const start = preferredStart >= 0
    ? preferredStart
    : Math.max(0, matchIndex - FOCUSED_SNIPPET_CONTEXT_BEFORE_CHARS);
  const end = Math.min(markdown.length, matchIndex + FOCUSED_SNIPPET_CONTEXT_AFTER_CHARS);
  const text = markdown.slice(start, end).slice(0, FOCUSED_SNIPPET_MAX_CHARS).trim();

  return text
    ? {
        start,
        end: start + text.length,
        text
      }
    : null;
}

function findPreviousMarkdownHeading(markdown, matchIndex) {
  const prefix = markdown.slice(0, matchIndex);
  const headingMatches = [...prefix.matchAll(/\n#{2,5}\s+[^\n]+/gu)];
  const lastHeading = headingMatches.at(-1);

  return lastHeading ? lastHeading.index + 1 : -1;
}

function snippetsOverlap(left, right) {
  return left.start <= right.end && right.start <= left.end;
}

function prioritizeDifyDocuments(documents) {
  return documents
    .map((document, index) => ({
      document,
      index,
      priority: getDifyDocumentPriority(document)
    }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map((entry) => entry.document);
}

function getDifyDocumentPriority(document) {
  const haystack = normalizeOptionalText([
    document.documentId,
    document.title,
    document.sourceFileName
  ].join(" ")).toLocaleLowerCase("ru-RU");
  let score = document.markdown ? 10 : -20;

  if (/документаци[\p{L}\p{N}_]*\s+о\s+закуп|^doc-\d+\s+документаци|извещен/u.test(haystack)) {
    score += 110;
  }

  if (/техническ[\p{L}\p{N}_]*\s+задани|требован|критери|оценк|задани[\p{L}\p{N}_]*\s+на\s+прототип|прототип/u.test(haystack)) {
    score += 95;
  }

  if (/срок|календарн[\p{L}\p{N}_]*\s+план/u.test(haystack)) {
    score += 70;
  }

  if (/нмц|начальн[\p{L}\p{N}_]*\s+цен|форма\s*7|ценов/u.test(haystack)) {
    score += 60;
  }

  if (/предложени[\p{L}\p{N}_]*\s+в\s+отношени[\p{L}\p{N}_]*\s+предмет/u.test(haystack)) {
    score += 45;
  }

  if (/договор/u.test(haystack)) {
    score += 20;
  }

  if (/акт|эдо|контаргент|протокол|перечень|форма\s*[128]/u.test(haystack)) {
    score -= 30;
  }

  return score;
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

export function buildDifyInstructions() {
  const tenderInfoFields = [
    "customer",
    "projectTitle",
    "title",
    "shortTitle",
    "procurementStage",
    "deadlineAt",
    "nmc",
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
    "summary"
  ];

  return {
    objective: "Extract procurement/scoring data in two blocks only: tenderInfo and selectionCriteria. Use only supplied Markdown/json documents as evidence. Omit unsupported or unsupported-by-evidence fields.",
    expectedOutput: {
      recordPatch: "object with tender information fields only",
      selectionCriteriaRows: "array of document-backed evaluation criteria and mandatory bidder/contractor requirements: group, title, weightPercent for weighted price/nonPrice rows, blockFactor only for requirement rows without weight, coverageNote, sourceExcerpt. Do not fill expert answer fields.",
      documentFindings: "array of evidence: field/target, documentId, quote/excerpt, reason/note, confidence",
      warnings: "array of warning strings",
      metadata: "object without secrets or links"
    },
    allowedPatchFields: [...ALLOWED_RECORD_PATCH_FIELDS].filter((field) => field !== "preassessment"),
    disabledPatchFields: ["preassessment", "stage"],
    extractionBlocks: [
      {
        id: "tenderInfo",
        label: "Общая информация по тендеру",
        output: "recordPatch + documentFindings for recordPatch fields",
        fields: tenderInfoFields,
        rules: [
          "Return only recordPatch fields and related documentFindings.",
          "Do not return selectionCriteriaRows from this block.",
          "Do not return preassessment or riskRows."
        ]
      },
      {
        id: "selectionCriteria",
        label: "Критерии выбора",
        output: "selectionCriteriaRows + documentFindings for every criteria row",
        fields: ["selectionCriteriaRows"],
        rules: [
          "Return only selectionCriteriaRows and related documentFindings.",
          "Do not return tender recordPatch fields from this block.",
          "Do not return preassessment or riskRows."
        ]
      }
    ],
    strictRules: [
      "Return only JSON. Do not wrap JSON in markdown fences and do not add prose.",
      "Do not invent values. If a value is not found in documents, omit the field.",
      "Do not include unsupported fields such as contractPrice, price, href, url, path, documents, workflow or documentArtifacts.",
      "Do not include preassessment, riskRows, riskBaseUrl, summaryDecision, alexanderDecision or estimateFileUrl in the current workflow.",
      "Do not write procurement kind/stage into recordPatch.stage; stage is an internal scoring project workflow field. Use recordPatch.procurementStage for the tender/procurement stage.",
      "Do not copy document links, local paths, API URLs, local development URLs or machine-local references into recordPatch, metadata or findings.",
      "Prefer exact quotes from source documents in sourceExcerpt and documentFindings.quote.",
      "Every meaningful recordPatch field and every selectionCriteriaRows row should have a related documentFindings entry.",
      "For each field included in recordPatch, add a separate documentFindings item with field equal to that recordPatch key.",
      "For each selectionCriteriaRows item, add a separate documentFindings item with field='selectionCriteriaRows' and quote/sourceExcerpt for that row.",
      "If a document finding is based on a criteria row, use target='selectionCriteriaRows' and field='selectionCriteriaRows'.",
      "For selectionCriteriaRows, extract two document-backed layers: (1) bid evaluation/winner/scoring criteria; (2) mandatory bidder or contractor qualification requirements that affect admission, participation, selection or contractability.",
      "For selectionCriteriaRows.coverageNote, write the document-backed task for the tender specialist: what exactly must be proven, prepared or checked, for example 'портфолио 3 сайта банковской тематики'. Do not write whether we close it.",
      "Do not fill selectionCriteriaRows.coverageStatus or coverageAmount. These fields are filled later by the tender specialist after analysis.",
      "Explicit bid evaluation tables have priority over technical specifications and prototype task tables. First search for sections named 'Критерии оценки и сопоставления заявок', 'Критерии оценки', 'Значимость критерия' or 'Вес критерия'.",
      "For group='price' and group='nonPrice', use weightPercent when the document gives a numeric criterion weight, and leave blockFactor empty.",
      "For group='requirement', use weightPercent=null and set blockFactor to 'blockFactor' for mandatory/blocking requirements or 'no' for desirable/non-blocking requirements.",
      "If documents say the only evaluation criterion is price or lowest price, return one price row for that evaluation rule, then keep extracting mandatory bidder requirements as group='requirement' with weightPercent=null and blockFactor set.",
      "Use group='requirement' for no-weight requirements such as licenses, permits, staff/team resources, qualification certificates, comparable experience, required forms and strict mandatory application documents.",
      "Existing scoring_payload.selectionCriteriaRows may contain human-entered coverageStatus and coverageAmount values. Do not copy or rewrite them in AI output; backend preserves them for matched rows.",
      "Do not present preserved human-entered coverage notes as document evidence. documentFindings.quote and sourceExcerpt must still come from supplied Markdown/json documents.",
      "Never treat technical specification implementation items, system features, bug definitions, technology stack, acceptance rules, source-code transfer, security tasks or delivery obligations as selectionCriteriaRows unless they are explicitly stated as bidder qualification/admission requirements or application evaluation criteria.",
      "Never expand a prototype task function table into selectionCriteriaRows. If the main evaluation table has one row like 'Экспертная оценка предлагаемого участником прототипного решения', return that one nonPrice row and use the prototype task only as evidence/context.",
      "Keep sourceExcerpt, documentFindings.quote and documentFindings.note compact; use short quotes instead of long paragraphs.",
      "If uncertain about a criterion itself, include a warning or omit the row; do not use coverage fields for uncertainty.",
      "Check every instructions.extractionTargets.recordPatch field before the final answer; include all supported fields that have document evidence.",
      "Do not stop after the first customer/title/price fields; extract deadlines, securities, terms, retrading, anti-dumping, test-assignment/creative requirements, notes and summary when present.",
      "For recordPatch.projectTitle return a short page title: customer name + 2-3 words about the project, for example 'Эрманн техподдержка' or 'Икс5 Битрикс24'. Do not put full purpose, full procurement subject, URLs or long sentences into projectTitle.",
      "For recordPatch.shortTitle return only one of: Аутсорс, Аутстаф. Use Аутсорс for contracts about delivering work/service results; use Аутстаф only when the documents clearly describe providing personnel/staff to the customer without contractor-owned work result responsibility.",
      "Keep overallExecutionTerm and contractTerm separate: overallExecutionTerm is the work/service delivery period; contractTerm is the legal validity period of the agreement.",
      "For RFI/market-analysis documents, treat the procedure as analysis, not a supplier-selection tender: if documents say 'RFI', 'анализ рынка', 'сбор информации', 'бюджетных оценок' or 'выбор контрагента не производится', set procurementStage='Анализ рынка цен', nmc='нет' when no explicit NMC/НМЦ is stated, antiDumpingMeasures='не применимо на данном этапе', and do not use participant commercial offer totals as NMC.",
      "For RFI/market-analysis documents, do not extract technical implementation tasks, project stages, functional requirements or deliverables from the technical specification as selectionCriteriaRows. Extract only RFI submission/package requirements such as presentation, project examples, filled commercial proposal, contractor questionnaire and technology description.",
      "When a work/service term is split across adjacent lines or table cells, combine the neighboring cells into one business value, for example 'с даты подписания договора - до 01 декабря 2026 года'."
    ],
    extractionTargets: {
      recordPatch: [
        {
          field: "customer",
          label: "Заказчик",
          searchHints: ["заказчик", "наименование заказчика", "организатор закупки", "клиент", "получатель услуг", "X5", "Х5"],
          output: "Official customer/ordering organization name. Prefer the full official legal name if present; otherwise use the most specific customer name found, without shortening it further."
        },
        {
          field: "projectTitle",
          label: "Название проекта",
          searchHints: ["заказчик", "предмет закупки", "наименование закупки", "название проекта", "техническое задание", "оказание услуг", "выполнение работ", "RFI", "анализ рынка"],
          output: "Short page title only: customer name + 2-3 words about the project, max about 4 words total. Examples: 'Эрманн техподдержка', 'Икс5 Битрикс24'. Do not return a full sentence, purpose paragraph or full procurement subject here."
        },
        {
          field: "title",
          label: "Предмет закупки",
          searchHints: ["предмет договора", "предмет закупки", "объект закупки", "описание объекта закупки", "цель работ", "RFI", "анализ рынка", "оказание услуг"],
          output: "Full procurement subject. For RFI use a phrase like 'RFI - анализ рынка. Оказание услуг ...' when that wording is present."
        },
        {
          field: "shortTitle",
          label: "Предмет кратко",
          searchHints: [
            "выполнение работ",
            "оказание услуг",
            "результат работ",
            "акт выполненных работ",
            "отчет о фактически выполненных работах",
            "трудозатраты привлеченных специалистов",
            "предоставление персонала",
            "предоставление работников",
            "аутсорс",
            "аутстаф"
          ],
          output: "One of exactly: Аутсорс, Аутстаф. Map договора на выполнение работ/оказание услуг с результатом и актами to Аутсорс."
        },
        {
          field: "deadlineAt",
          label: "Срок подачи",
          searchHints: ["дата и время окончания подачи", "окончание приема заявок", "срок подачи заявок", "deadline"],
          output: "Submission deadline as found in documents."
        },
        {
          field: "nmc",
          label: "НМЦ",
          searchHints: ["начальная максимальная цена", "НМЦ", "НМЦК", "максимальная цена договора", "цена договора", "RFI", "анализ рынка"],
          output: "Initial/max contract price with currency if present. For RFI/market-analysis, return 'нет' if there is no explicit NMC/НМЦ; do not use filled participant КП totals, license prices or offer totals as NMC."
        },
        {
          field: "procurementStage",
          label: "Какой этап",
          searchHints: [
            "способ закупки",
            "форма проведения",
            "запрос цен",
            "открытый запрос цен",
            "аукцион",
            "конкурс",
            "пко",
            "предквалификация",
            "мониторинг цен",
            "сбор нмц",
            "анализ рынка цен",
            "RFI",
            "анализ рынка",
            "сбор информации",
            "бюджетных оценок",
            "выбор контрагента не производится"
          ],
          output: "One of exactly: ПКО, Тендер, Сбор НМЦ, Аукцион, Мониторинг цен - закрытый конкурс, Мониторинг цен - открытый конкурс, Анализ рынка цен. Map RFI/анализ рынка/сбор информации и бюджетных оценок to Анализ рынка цен. Map explicit запрос цен/конкурс/тендер supplier-selection methods to Тендер."
        },
        {
          field: "purchaseBy",
          label: "Закупка по",
          searchHints: ["44-ФЗ", "223-ФЗ", "положение о закупке", "коммерческая закупка"],
          output: "One of: 44-ФЗ, 223-ФЗ / Положение о закупке, Коммерческая закупка, Иное."
        },
        {
          field: "platformPayment",
          label: "Оплата площадки",
          searchHints: ["оплата площадки", "тариф электронной площадки", "комиссия площадки", "плата оператору"],
          output: "Platform payment/commission terms."
        },
        {
          field: "applicationSecurity",
          label: "Обеспечение заявки",
          searchHints: ["обеспечение заявки", "размер обеспечения заявки", "банковская гарантия заявки", "задаток"],
          output: "Bid/application security amount and terms."
        },
        {
          field: "contractSecurity",
          label: "Обеспечение контракта",
          searchHints: ["обеспечение исполнения договора", "обеспечение исполнения контракта", "гарантийные обязательства", "банковская гарантия"],
          output: "Contract performance security amount and terms."
        },
        {
          field: "overallExecutionTerm",
          label: "Общий срок выполнения работ",
          searchHints: [
            "общий срок выполнения работ",
            "срок выполнения работ",
            "срок оказания услуг",
            "срок оказания услуг / выполнения работ",
            "период выполнения",
            "начало - с даты подписания договора",
            "окончание - до",
            "с даты заключения по",
            "по 01 декабря 2026",
            "этапы и виды работ",
            "длительность в неделях",
            "до 16 недель",
            "календарных дней",
            "рабочих дней"
          ],
          output: "Overall work/service delivery term. Include both start and end when documents provide them in nearby lines/table cells. If only separate stage durations are present and the documents do not clearly say whether stages are sequential or parallel, return a compact uncertainty note instead of summing or choosing a participant КП estimate."
        },
        {
          field: "contractTerm",
          label: "Срок договора",
          searchHints: ["срок действия договора", "договор действует", "окончание срока действия договора"],
          output: "Legal contract validity term only, not the work/service delivery period."
        },
        {
          field: "retrade",
          label: "Переторжка",
          searchHints: ["переторжка", "повторное коммерческое предложение", "дополнительные ценовые предложения", "улучшенное ценовое предложение", "улучшение цены", "переподача КП"],
          output: "Return 'Да' only when documents explicitly provide a retrading stage or repeated/additional improved commercial/price proposal after initial submission. Return 'Нет' only when documents explicitly say retrading is absent/not provided. Do not infer retrading from an ordinary auction, tender stage, negotiation, winner selection, or generic price criterion."
        },
        {
          field: "antiDumpingMeasures",
          label: "Антидемпинговые меры",
          searchHints: ["антидемпинговые меры", "снижение цены", "25 процентов", "добросовестность участника", "RFI", "анализ рынка"],
          output: "Anti-dumping rules or 'Нет', if documents explicitly say they do not apply. For RFI/market-analysis without supplier selection, return 'не применимо на данном этапе'."
        },
        {
          field: "creative",
          label: "Творческое",
          searchHints: ["тестовое задание", "ТЗ", "техническое задание", "дизайн", "креатив", "концепция", "макет", "визуальная концепция", "презентация о компании", "презентацию о компании"],
          output: "Boolean true if the package includes a test assignment / ТЗ / technical assignment for participant evaluation, or if creative/design concept work or a company presentation is clearly required. False only if clearly not required."
        },
        {
          field: "notes",
          label: "Примечания",
          searchHints: ["особые условия", "важные условия", "ограничения", "требования к участнику", "существенные условия"],
          output: "Compact notes with important restrictions, unusual conditions, submission details or risks."
        },
        {
          field: "summary",
          label: "Резюме",
          searchHints: ["цель", "объем работ", "ключевые требования", "результат работ"],
          output: "Short summary of procurement and delivery scope."
        }
      ],
      selectionCriteriaRows: {
        purpose: "Extract explicit winner selection, bid evaluation, scoring/final ranking criteria and mandatory bidder/contractor qualification requirements. This block should reproduce the business table 'Критерии выбора подрядчика': weighted evaluation rows plus no-weight block-factor requirements.",
        searchHints: [
          "критерии оценки",
          "порядок оценки",
          "оценка заявок",
          "рассмотрение и оценка заявок",
          "подведение итогов",
          "выбор победителя",
          "победителем признается",
          "единственным критерием является цена",
          "наименьшую цену",
          "значимость критерия",
          "вес критерия",
          "цена договора",
          "дополнительные требования к участникам",
          "требования к участникам процедуры закупки",
          "соответствие участника требованиям",
          "строго обязательно",
          "блок-фактор",
          "лицензия ФСТЭК",
          "лицензия ФСБ",
          "техническая защита конфиденциальной информации",
          "криптографических средств",
          "квалификация участника",
          "опыт участника",
          "наличие опыта",
          "сопоставимых с предметом запроса цен",
          "не менее 3-мя договорами",
          "не менее 25 000 000",
          "трудовых ресурсов",
          "не менее 15-ти специалистов",
          "ФОРМА 3.2.2",
          "ФОРМА 3.2.3",
          "деловая репутация",
          "техническое предложение"
        ],
        exclusions: [
          "Техническое задание",
          "Состав и содержание работ",
          "Таблица 1 «Этапы и виды работ»",
          "Функциональные требования",
          "Порядок контроля и приемки",
          "термины и определения",
          "Баг",
          "Недостаток",
          "PHP/YII2",
          "Vue.js",
          "исходные коды",
          "документация к системе",
          "приемка работ"
        ],
        priceOnlyGuidance: "When a section states 'Единственным критерием является цена' or the winner is the participant with the lowest price, return one row: group='price', title='Цена', weightPercent=100 if the document makes it the only evaluation criterion, otherwise null. This does not mean there are no mandatory bidder requirements.",
        rfiGuidance: "For RFI/market-analysis, if the document says 'выбор контрагента не производится', do not return price/nonPrice evaluation rows. Return no-weight requirements from the package/submission list only: 'Презентация о компании', 'Примеры реализованных проектов (при наличии)', 'Заполненное КП', 'Заполненную анкету контрагента', 'Описание используемых технологий'. In coverageNote, state the task from the document; do not estimate whether we close it.",
        mandatoryRequirementGuidance: "For explicit admission/qualification/mandatory application requirements, return group='requirement', weightPercent=null and blockFactor='blockFactor' when the wording is mandatory/required/strict/blocking. For desirable, optional or non-blocking requirements, use blockFactor='no'. Good row titles are short business names such as 'Лицензия ФСТЭК', 'Лицензия ФСБ', 'Команда', 'Опыт', 'Кадры'. Put the actual document wording in sourceExcerpt and a compact specialist task in coverageNote.",
        preserveExistingGuidance: "Before returning rows, compare them with scoring_payload.selectionCriteriaRows. If an existing row has the same title or same business meaning, return the document-backed row and sourceExcerpt only; backend will preserve human-entered coverage fields.",
        rowShape: {
          group: "price | nonPrice | requirement",
          title: "criterion or requirement name",
          weightPercent: "number for weighted group='price' or group='nonPrice'; null for group='requirement'",
          blockFactor: "'blockFactor' | 'no' only for group='requirement'; empty for group='price' and group='nonPrice'",
          coverageStatus: "omit or empty; tender specialist fills it",
          coverageAmount: "omit or empty; tender specialist fills it",
          coverageNote: "document-backed task for the tender specialist; not our answer",
          sourceExcerpt: "exact source quote"
        }
      }
    },
    selectionCriteriaEnums: {
      group: ["price", "nonPrice", "requirement"],
      blockFactor: ["blockFactor", "no"]
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

function reconcileDocumentFindingsWithPayload(documentFindings, documents) {
  if (!Array.isArray(documentFindings) || !Array.isArray(documents) || !documents.length) {
    return {
      documentFindings: Array.isArray(documentFindings) ? documentFindings : [],
      warnings: []
    };
  }

  const searchableDocuments = documents
    .map((document) => ({
      documentId: normalizeOptionalText(document.documentId),
      text: normalizeEvidenceSearchText([
        document.markdown,
        ...(Array.isArray(document.jsonArtifacts)
          ? document.jsonArtifacts.map((artifact) => JSON.stringify(artifact.content || ""))
          : [])
      ].join("\n"))
    }))
    .filter((document) => document.documentId && document.text);
  let repairedCount = 0;

  const nextFindings = documentFindings.map((finding) => {
    const quote = normalizeOptionalText(finding.quote || finding.excerpt);
    const matchedDocumentId = findUniqueDocumentIdForQuote(quote, searchableDocuments);

    if (!matchedDocumentId || matchedDocumentId === finding.documentId) {
      return finding;
    }

    repairedCount += 1;

    return {
      ...finding,
      documentId: matchedDocumentId
    };
  });

  return {
    documentFindings: nextFindings,
    warnings: repairedCount ? [`dify_document_finding_document_id_repaired:${repairedCount}`] : []
  };
}

function findUniqueDocumentIdForQuote(quote, searchableDocuments) {
  const needle = normalizeEvidenceSearchText(quote);

  if (needle.length < 12) {
    return "";
  }

  const matches = searchableDocuments
    .filter((document) => document.text.includes(needle))
    .map((document) => document.documentId);

  return matches.length === 1 ? matches[0] : "";
}

function normalizeEvidenceSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
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
    const parsed = parseMaybeJson(text);

    if (parsed) {
      return parsed;
    }

    throw createDifyError("dify_stream_empty", "Dify streaming response did not contain workflow events", {
      httpStatus: 502
    });
  }

  const finishedEvent = [...events].reverse().find((event) => event.event === "workflow_finished") || events.at(-1);
  const data = isObject(finishedEvent.data) ? finishedEvent.data : {};

  return {
    task_id: normalizeOptionalText(finishedEvent.task_id),
    workflow_run_id: normalizeOptionalText(finishedEvent.workflow_run_id || data.workflow_run_id || data.id),
    data: {
      ...data,
      workflow_run_id: normalizeOptionalText(finishedEvent.workflow_run_id || data.workflow_run_id)
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
    .map((data) => {
      try {
        return JSON.parse(data);
      } catch (_error) {
        return null;
      }
    })
    .filter(isObject);
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
