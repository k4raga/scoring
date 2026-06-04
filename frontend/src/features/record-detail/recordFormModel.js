import { getCanonicalStageLabel } from "../../uiStage.js";

export const RISK_BASE_URL = "https://docs.google.com/spreadsheets/d/1vRWazbT1FUDv6o4Sq208-_pC7cdxptJBy2PoZyc27sY/edit?gid=423778694#gid=423778694";

const PURCHASE_BY_UNKNOWN = "Нет информации";
const PURCHASE_BY_OPTIONS = [
  PURCHASE_BY_UNKNOWN,
  "44-ФЗ",
  "223-ФЗ / Положение о закупке",
  "Коммерческая закупка",
  "Иное"
];
const LEGACY_INVALID_PURCHASE_BY = new Set(["", "Техническое задание", "Загрузка архива", "Демо-данные"]);
const SHORT_TITLE_OPTIONS = [
  { value: "Аутсорс", label: "Аутсорс", tone: "outsourcing" },
  { value: "Аутстаф", label: "Аутстаф", tone: "outstaff" }
];
const PROCUREMENT_STAGE_OPTIONS = [
  { value: "ПКО", label: "ПКО", tone: "pko" },
  { value: "Тендер", label: "Тендер", tone: "tender" },
  { value: "Сбор НМЦ", label: "Сбор НМЦ", tone: "nmc" },
  { value: "Аукцион", label: "Аукцион", tone: "auction" },
  { value: "Мониторинг цен - закрытый конкурс", label: "Мониторинг цен - закрытый конкурс", tone: "monitoringClosed" },
  { value: "Мониторинг цен - открытый конкурс", label: "Мониторинг цен - открытый конкурс", tone: "monitoringOpen" },
  { value: "Анализ рынка цен", label: "Анализ рынка цен", tone: "marketAnalysis" }
];

export const SELECTION_CRITERIA_GROUP_OPTIONS = [
  { value: "price", label: "Ценовой критерий" },
  { value: "nonPrice", label: "Неценовой критерий" },
  { value: "requirement", label: "Дополнительное требование" }
];

export const SELECTION_CRITERIA_COVERAGE_OPTIONS = [
  { value: "full", label: "Полностью закрываем" },
  { value: "partial", label: "Частично закрываем" },
  { value: "none", label: "Не закрываем" }
];

export const PREASSESSMENT_CRITICALITY_OPTIONS = [
  { value: "unknown", label: "Не указано" },
  { value: "critical", label: "Критично" },
  { value: "notCritical", label: "Не критично" }
];

export const PREASSESSMENT_SUMMARY_DECISION_OPTIONS = [
  { value: "", label: "Не выбрано" },
  { value: "estimate", label: "Оценка" },
  { value: "decline", label: "Не участвуем" }
];

export function createEmptyForm() {
  return {
    customer: "",
    projectTitle: "",
    title: "",
    shortTitle: "",
    procurementStage: "",
    sourceUrl: "",
    etpUrl: "",
    documentsFolderHref: "",
    googleDocumentsFolderHref: "",
    deadlineAt: "",
    nmc: "",
    purchaseBy: PURCHASE_BY_UNKNOWN,
    platformPayment: "",
    applicationSecurity: "",
    contractSecurity: "",
    overallExecutionTerm: "",
    contractTerm: "",
    retrade: "Нет",
    antiDumpingMeasures: "Нет",
    creative: false,
    creativeLinkUrl: "",
    requirementsDocumentUrl: "",
    criteriaDocumentUrl: "",
    technicalSpecificationUrl: "",
    notes: "",
    stage: "",
    selectionCriteriaRows: [],
    preassessment: createEmptyPreassessment(),
    documentWiki: createEmptyDocumentWiki()
  };
}

export function buildFormState(record) {
  return {
    customer: String(record?.customer || ""),
    projectTitle: String(record?.projectTitle || record?.title || ""),
    title: String(record?.title || ""),
    shortTitle: normalizeShortTitleValue(record?.shortTitle),
    procurementStage: normalizeProcurementStageValue(record?.procurementStage),
    sourceUrl: String(record?.sourceUrl || ""),
    etpUrl: String(record?.etpUrl || ""),
    documentsFolderHref: String(record?.documentsFolderHref || ""),
    googleDocumentsFolderHref: String(record?.googleDocumentsFolderHref || ""),
    deadlineAt: String(record?.deadlineAt || ""),
    nmc: String(record?.nmc || ""),
    purchaseBy: normalizePurchaseByValue(record?.purchaseBy),
    platformPayment: String(record?.platformPayment || ""),
    applicationSecurity: String(record?.applicationSecurity || ""),
    contractSecurity: String(record?.contractSecurity || ""),
    overallExecutionTerm: String(record?.overallExecutionTerm || ""),
    contractTerm: String(record?.contractTerm || ""),
    retrade: String(record?.retrade || "Нет"),
    antiDumpingMeasures: String(record?.antiDumpingMeasures || "Нет"),
    creative: normalizeCreativeValue(record?.creative) ?? false,
    creativeLinkUrl: String(record?.creativeLinkUrl || ""),
    requirementsDocumentUrl: String(record?.requirementsDocumentUrl || ""),
    criteriaDocumentUrl: String(record?.criteriaDocumentUrl || ""),
    technicalSpecificationUrl: String(record?.technicalSpecificationUrl || ""),
    notes: String(record?.notes || ""),
    stage: getCanonicalStageLabel(record?.stage, record?.status),
    selectionCriteriaRows: (record?.selectionCriteriaRows || []).map((row, index) =>
      createSelectionCriteriaRow(row, index)
    ),
    preassessment: createPreassessmentState(record?.preassessment),
    documentWiki: normalizeDocumentWikiConfig(record?.documentWiki)
  };
}

export function createSelectionCriteriaRow(row = {}, index = 0) {
  const group = normalizeSelectionCriteriaGroupValue(row.group);

  return {
    rowId: createRowId(),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index + 1,
    group,
    title: String(row.title || ""),
    weightPercent: group === "requirement" || row.weightPercent === null || row.weightPercent === undefined ? "" : String(row.weightPercent),
    coverageStatus: Object.prototype.hasOwnProperty.call(row, "coverageStatus")
      ? normalizeSelectionCriteriaCoverageValue(row.coverageStatus)
      : "",
    coverageNote: String(row.coverageNote || ""),
    sourceExcerpt: String(row.sourceExcerpt || "")
  };
}

export function createPreassessmentRiskRow(row = {}, index = 0) {
  return {
    rowId: createRowId(),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index + 1,
    parameter: String(row.parameter || ""),
    managerComment: String(row.managerComment || ""),
    criticality: normalizePreassessmentCriticalityValue(row.criticality),
    riskBaseRef: String(row.riskBaseRef || ""),
    sourceKey: String(row.sourceKey || "")
  };
}

export function serializeForm(form) {
  return JSON.stringify({
    ...form,
    selectionCriteriaRows: form.selectionCriteriaRows.map(({ group, title, weightPercent, coverageStatus, coverageNote, sourceExcerpt }, index) => ({
      order: index + 1,
      group,
      title,
      weightPercent: group === "requirement" ? "" : weightPercent,
      coverageStatus,
      coverageNote,
      sourceExcerpt
    })),
    preassessment: serializePreassessment(form.preassessment),
    documentWiki: normalizeDocumentWikiConfig(form.documentWiki)
  });
}

export function buildSavePayload(form) {
  return {
    customer: form.customer,
    projectTitle: form.projectTitle,
    title: form.title,
    shortTitle: form.shortTitle,
    procurementStage: form.procurementStage,
    sourceUrl: form.sourceUrl,
    etpUrl: form.etpUrl,
    documentsFolderHref: form.documentsFolderHref,
    googleDocumentsFolderHref: form.googleDocumentsFolderHref,
    deadlineAt: fromDateTimeLocalValue(form.deadlineAt),
    nmc: form.nmc,
    purchaseBy: form.purchaseBy,
    platformPayment: form.platformPayment,
    applicationSecurity: form.applicationSecurity,
    contractSecurity: form.contractSecurity,
    overallExecutionTerm: form.overallExecutionTerm,
    contractTerm: form.contractTerm,
    retrade: form.retrade,
    antiDumpingMeasures: form.antiDumpingMeasures,
    creative: form.creative,
    creativeLinkUrl: form.creativeLinkUrl,
    requirementsDocumentUrl: form.requirementsDocumentUrl,
    criteriaDocumentUrl: form.criteriaDocumentUrl,
    technicalSpecificationUrl: form.technicalSpecificationUrl,
    notes: form.notes,
    stage: form.stage,
    documentWiki: normalizeDocumentWikiConfig(form.documentWiki),
    preassessment: serializePreassessment(form.preassessment),
    selectionCriteriaRows: form.selectionCriteriaRows.map(({ group, title, weightPercent, coverageStatus, coverageNote, sourceExcerpt }, index) => ({
      order: index + 1,
      group,
      title,
      weightPercent: group === "requirement" ? null : normalizeWeightPercentValue(weightPercent),
      coverageStatus,
      coverageNote,
      sourceExcerpt
    }))
  };
}

export function normalizeDocumentWikiConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const overrides = {};

  for (const [blockId, override] of Object.entries(source.overrides || {})) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      continue;
    }

    overrides[String(blockId)] = {
      title: String(override.title || ""),
      visible: override.visible === false ? false : true,
      order: Number.isFinite(Number(override.order)) ? Number(override.order) : null
    };
  }

  return {
    version: 1,
    overrides,
    manualBlocks: (Array.isArray(source.manualBlocks) ? source.manualBlocks : []).map((block, index) => ({
      id: String(block?.id || `manual-${index + 1}`),
      type: normalizeDocumentBlockType(block?.type || "manual"),
      title: String(block?.title || "Ручной блок"),
      href: String(block?.href || ""),
      body: String(block?.body || ""),
      visible: block?.visible === false ? false : true,
      order: Number.isFinite(Number(block?.order)) ? Number(block.order) : 1000 + index
    }))
  };
}

export function getPurchaseByOptions(currentValue) {
  return getPurchaseBySelectOptions(currentValue).map((option) => option.value);
}

export function getPurchaseBySelectOptions(currentValue, schemaOptions = []) {
  const normalizedValue = normalizePurchaseByValue(currentValue);
  const options = normalizeSelectOptions(schemaOptions, PURCHASE_BY_OPTIONS.map((option) => ({ value: option, label: option })));
  const knownValues = new Set(options.map((option) => option.value));

  if (normalizedValue && !knownValues.has(normalizedValue)) {
    options.push({ value: normalizedValue, label: normalizedValue });
  }

  return options;
}

export function getShortTitleSelectOptions(currentValue, schemaOptions = []) {
  const normalizedValue = normalizeShortTitleValue(currentValue);
  const options = normalizeSelectOptions(schemaOptions, SHORT_TITLE_OPTIONS);
  const knownValues = new Set(options.map((option) => option.value));

  if (normalizedValue && !knownValues.has(normalizedValue)) {
    options.push({ value: normalizedValue, label: normalizedValue });
  }

  return options;
}

export function getProcurementStageSelectOptions(currentValue, schemaOptions = []) {
  const normalizedValue = normalizeProcurementStageValue(currentValue);
  const options = normalizeSelectOptions(schemaOptions, PROCUREMENT_STAGE_OPTIONS);
  const knownValues = new Set(options.map((option) => option.value));

  if (normalizedValue && !knownValues.has(normalizedValue)) {
    options.push({ value: normalizedValue, label: normalizedValue });
  }

  return options;
}

export function getRecordEditorOptions(record) {
  const editorSchema = record?.editorSchema && typeof record.editorSchema === "object" ? record.editorSchema : {};

  return {
    shortTitleOptions: normalizeSelectOptions(
      getSectionFieldOptions(editorSchema.sections, "shortTitle"),
      SHORT_TITLE_OPTIONS
    ),
    procurementStageOptions: normalizeSelectOptions(
      getSectionFieldOptions(editorSchema.sections, "procurementStage"),
      PROCUREMENT_STAGE_OPTIONS
    ),
    purchaseByOptions: normalizeSelectOptions(
      getSectionFieldOptions(editorSchema.sections, "purchaseBy"),
      PURCHASE_BY_OPTIONS.map((option) => ({ value: option, label: option }))
    ),
    selectionCriteriaGroupOptions: normalizeSelectOptions(
      getRowSchemaFieldOptions(editorSchema.selectionCriteriaRowSchema, "group"),
      SELECTION_CRITERIA_GROUP_OPTIONS
    ),
    selectionCriteriaCoverageOptions: normalizeSelectOptions(
      getRowSchemaFieldOptions(editorSchema.selectionCriteriaRowSchema, "coverageStatus"),
      SELECTION_CRITERIA_COVERAGE_OPTIONS
    ),
    preassessmentCriticalityOptions: normalizeSelectOptions(
      getRowSchemaFieldOptions(editorSchema.preassessmentRiskRowSchema, "criticality"),
      PREASSESSMENT_CRITICALITY_OPTIONS
    ),
    preassessmentSummaryDecisionOptions: PREASSESSMENT_SUMMARY_DECISION_OPTIONS
  };
}

export function isMeaningfulSelectionCriteriaRow(row) {
  return Boolean(
    String(row?.title || "").trim() ||
    String(row?.coverageNote || "").trim() ||
    String(row?.sourceExcerpt || "").trim() ||
    String(row?.weightPercent || "").trim()
  );
}

export function mapCreativeToToggle(value) {
  if (value === true) {
    return "true";
  }

  return "false";
}

export function mapToggleToCreative(value) {
  return value === "true";
}

function createEmptyPreassessment() {
  return {
    riskRows: [],
    riskBaseUrl: "",
    summaryDecision: "",
    alexanderDecision: "",
    estimateFileUrl: ""
  };
}

function createPreassessmentState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    riskRows: (Array.isArray(source.riskRows) ? source.riskRows : []).map((row, index) =>
      createPreassessmentRiskRow(row, index)
    ),
    riskBaseUrl: String(source.riskBaseUrl || ""),
    summaryDecision: normalizePreassessmentSummaryDecisionValue(source.summaryDecision),
    alexanderDecision: normalizePreassessmentSummaryDecisionValue(source.alexanderDecision),
    estimateFileUrl: String(source.estimateFileUrl || "")
  };
}

function createEmptyDocumentWiki() {
  return {
    version: 1,
    overrides: {},
    manualBlocks: []
  };
}

function serializePreassessment(preassessment) {
  const source = createPreassessmentState(preassessment);

  return {
    riskRows: source.riskRows.map(({ parameter, managerComment, criticality, riskBaseRef, sourceKey }, index) => ({
      order: index + 1,
      parameter,
      managerComment,
      criticality,
      riskBaseRef,
      sourceKey
    })),
    riskBaseUrl: source.riskBaseUrl,
    summaryDecision: source.summaryDecision,
    alexanderDecision: source.alexanderDecision,
    estimateFileUrl: source.estimateFileUrl
  };
}

function createRowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePurchaseByValue(value) {
  const normalized = String(value ?? "").trim();

  if (LEGACY_INVALID_PURCHASE_BY.has(normalized)) {
    return PURCHASE_BY_UNKNOWN;
  }

  if (/223\s*[-–]?\s*фз/i.test(normalized)) {
    return "223-ФЗ / Положение о закупке";
  }

  if (/44\s*[-–]?\s*фз/i.test(normalized)) {
    return "44-ФЗ";
  }

  return normalized || PURCHASE_BY_UNKNOWN;
}

function normalizeShortTitleValue(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "";
  }

  if (SHORT_TITLE_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }

  const lowered = normalized.toLocaleLowerCase("ru-RU");

  if (/аутстаф|outstaff/u.test(lowered)) {
    return "Аутстаф";
  }

  if (/аутсорс|outsourc/u.test(lowered)) {
    return "Аутсорс";
  }

  return normalized;
}

function normalizeProcurementStageValue(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "";
  }

  if (PROCUREMENT_STAGE_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }

  const lowered = normalized.toLocaleLowerCase("ru-RU");

  if (/пко|предквалификац/u.test(lowered)) {
    return "ПКО";
  }

  if (/сбор\s*нмц|сбор\s*нмцк/u.test(lowered)) {
    return "Сбор НМЦ";
  }

  if (/аукцион/u.test(lowered)) {
    return "Аукцион";
  }

  if (/мониторинг\s*цен/u.test(lowered) && /закрыт/u.test(lowered)) {
    return "Мониторинг цен - закрытый конкурс";
  }

  if (/мониторинг\s*цен/u.test(lowered) && /открыт/u.test(lowered)) {
    return "Мониторинг цен - открытый конкурс";
  }

  if (/анализ\s*рынка\s*цен/u.test(lowered)) {
    return "Анализ рынка цен";
  }

  if (/тендер|запрос\s*цен|конкурс|закупк/u.test(lowered)) {
    return "Тендер";
  }

  return "";
}

function normalizeSelectionCriteriaGroupValue(value) {
  const normalized = String(value || "").trim();
  return SELECTION_CRITERIA_GROUP_OPTIONS.some((option) => option.value === normalized) ? normalized : "nonPrice";
}

function normalizeSelectionCriteriaCoverageValue(value) {
  const normalized = String(value || "").trim();
  return SELECTION_CRITERIA_COVERAGE_OPTIONS.some((option) => option.value === normalized) ? normalized : "";
}

function normalizePreassessmentCriticalityValue(value) {
  const normalized = String(value || "").trim();
  return PREASSESSMENT_CRITICALITY_OPTIONS.some((option) => option.value === normalized) ? normalized : "unknown";
}

function normalizePreassessmentSummaryDecisionValue(value) {
  const normalized = String(value || "").trim();
  const lowered = normalized.toLowerCase().replace(/[-_\s]+/g, "");

  if (["estimate", "evaluation", "оценка", "беремвоценку", "берёмвоценку", "оставитьвоценке", "оставитьвоценку"].includes(lowered)) {
    return "estimate";
  }

  if (["decline", "nobid", "no", "неучаствуем", "неучастие", "отказ", "отказаться", "отказотучастия"].includes(lowered)) {
    return "decline";
  }

  return "";
}

function normalizeWeightPercentValue(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
}

function normalizeCreativeValue(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["да", "true", "yes", "1"].includes(normalized)) {
    return true;
  }

  if (["нет", "false", "no", "0"].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizeDocumentBlockType(value) {
  const normalized = String(value || "").trim();

  if (["source", "wiki", "manual", "fallback", "diagnostic"].includes(normalized)) {
    return normalized;
  }

  return "manual";
}

function fromDateTimeLocalValue(value) {
  return value ? value.replace("T", " ") : "";
}

function getSectionFieldOptions(sections, fieldKey) {
  for (const section of Array.isArray(sections) ? sections : []) {
    const fieldDefinition = (Array.isArray(section?.fields) ? section.fields : [])
      .find((field) => field?.key === fieldKey);

    if (fieldDefinition) {
      return fieldDefinition.options;
    }
  }

  return [];
}

function getRowSchemaFieldOptions(fields, fieldKey) {
  const fieldDefinition = (Array.isArray(fields) ? fields : [])
    .find((field) => field?.key === fieldKey);

  return fieldDefinition?.options || [];
}

function normalizeSelectOptions(options, fallbackOptions = []) {
  const source = Array.isArray(options) && options.length ? options : fallbackOptions;
  const fallbackByValue = new Map(
    (Array.isArray(fallbackOptions) ? fallbackOptions : [])
      .filter((option) => option && typeof option === "object" && !Array.isArray(option))
      .map((option) => [String(option.value), option])
  );
  const result = [];
  const seen = new Set();

  for (const option of source) {
    const value = option && typeof option === "object" && !Array.isArray(option)
      ? option.value
      : option;

    if (value === undefined || value === null) {
      continue;
    }

    const key = String(value);

    if (seen.has(key)) {
      continue;
    }

    const label = option && typeof option === "object" && !Array.isArray(option)
      ? option.label
      : option;
    const fallbackOption = fallbackByValue.get(key);

    seen.add(key);
    result.push({
      value,
      label: String(label ?? value),
      tone: option?.tone || fallbackOption?.tone
    });
  }

  return result;
}
