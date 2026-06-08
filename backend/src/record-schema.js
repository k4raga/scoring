const YES_NO_OPTIONS = [
  { value: false, label: "Нет" },
  { value: true, label: "Да" }
];

const CRITERIA_GROUP_OPTIONS = [
  { value: "price", label: "Ценовые" },
  { value: "nonPrice", label: "Неценовые" },
  { value: "hardRequirements", label: "Требования без веса" }
];

const SELECTION_CRITERIA_GROUP_OPTIONS = [
  { value: "price", label: "Ценовой критерий" },
  { value: "nonPrice", label: "Неценовой критерий" },
  { value: "requirement", label: "Требования без веса" }
];

const SELECTION_CRITERIA_COVERAGE_OPTIONS = [
  { value: "full", label: "Полностью закрываем" },
  { value: "partial", label: "Частично закрываем" },
  { value: "none", label: "Не закрываем" }
];

const SELECTION_CRITERIA_BLOCK_FACTOR_OPTIONS = [
  { value: "blockFactor", label: "Блок-фактор" },
  { value: "no", label: "Нет" }
];

const PREASSESSMENT_CRITICALITY_OPTIONS = [
  { value: "unknown", label: "Не указано" },
  { value: "critical", label: "Критично" },
  { value: "notCritical", label: "Не критично" }
];

const PREASSESSMENT_SUMMARY_DECISION_OPTIONS = [
  { value: "estimate", label: "Оценка" },
  { value: "decline", label: "Не участвуем" }
];

const CRITERIA_KIND_OPTIONS = [
  { value: "основной", label: "основной" },
  { value: "критерий", label: "критерий" },
  { value: "блок-фактор", label: "блок-фактор" }
];

const SHORT_TITLE_OPTIONS = [
  { value: "Аутсорс", label: "Аутсорс" },
  { value: "Аутстаф", label: "Аутстаф" }
];
const PURCHASE_BY_UNKNOWN = "Нет информации";
const PURCHASE_BY_OPTIONS = [
  { value: PURCHASE_BY_UNKNOWN, label: PURCHASE_BY_UNKNOWN },
  { value: "44-ФЗ", label: "44-ФЗ" },
  { value: "223-ФЗ / Положение о закупке", label: "223-ФЗ / Положение о закупке" },
  { value: "Коммерческая закупка", label: "Коммерческая закупка" },
  { value: "Иное", label: "Иное" }
];
const LEGACY_INVALID_PURCHASE_BY = new Set(["", "Техническое задание", "Загрузка архива", "Демо-данные"]);
const PROCUREMENT_STAGE_OPTIONS = [
  { value: "ПКО", label: "ПКО" },
  { value: "Тендер", label: "Тендер" },
  { value: "Сбор НМЦ", label: "Сбор НМЦ" },
  { value: "Аукцион", label: "Аукцион" },
  { value: "Мониторинг цен - закрытый конкурс", label: "Мониторинг цен - закрытый конкурс" },
  { value: "Мониторинг цен - открытый конкурс", label: "Мониторинг цен - открытый конкурс" },
  { value: "Анализ рынка цен", label: "Анализ рынка цен" }
];

const EDITOR_SECTIONS = [
  {
    id: "general",
    title: "Общая информация",
    fields: [
      field("customer", "Заказчик", "text"),
      field("title", "Предмет закупки", "text"),
      field("shortTitle", "Предмет кратко", "select", { options: SHORT_TITLE_OPTIONS }),
      field("procurementStage", "Какой этап", "select", { options: PROCUREMENT_STAGE_OPTIONS }),
      field("sourceUrl", "Ссылка на извещение", "url"),
      field("etpUrl", "Ссылка на ЭТП", "url"),
      field("documentsFolderHref", "Папка с документами на рассмотрение", "url"),
      field("googleDocumentsFolderHref", "Папка Google с документами", "url"),
      field("deadlineAt", "Срок подачи", "datetime")
    ]
  },
  {
    id: "tender",
    title: "Информация по тендеру",
    fields: [
      field("nmc", "НМЦ", "text"),
      field("stage", "Этап", "text"),
      field("purchaseBy", "Закупка по", "select", { options: PURCHASE_BY_OPTIONS }),
      field("platformPayment", "Оплата площадки", "text"),
      field("applicationSecurity", "Обеспечение заявки", "text"),
      field("contractSecurity", "Обеспечение контракта", "text"),
      field("overallExecutionTerm", "Общий срок выполнения работ", "text"),
      field("contractTerm", "Срок договора", "text"),
      field("retrade", "Переторжка", "text"),
      field("antiDumpingMeasures", "Антидемпинговые меры", "text"),
      field("creative", "Творческое", "select", { options: YES_NO_OPTIONS }),
      field("requirementsDocumentUrl", "Документ с требованиями", "url"),
      field("criteriaDocumentUrl", "Документ с критериями выбора", "url"),
      field("technicalSpecificationUrl", "Документ с ТЗ", "url"),
      field("notes", "Примечания", "textarea")
    ]
  },
  {
    id: "system",
    title: "Системные данные",
    fields: [
      field("workflow.projectFolder", "Папка проекта", "text", { readOnly: true }),
      field("workflow.codexRun.status", "Статус локального Codex run", "text", { readOnly: true }),
      field("workflow.codexRun.runRoot", "Папка Codex run", "text", { readOnly: true }),
      field("workflow.codexRun.scriptPath", "Скрипт run", "text", { readOnly: true })
    ]
  }
];

const CRITERIA_ROW_SCHEMA = [
  field("group", "Группа", "select", { options: CRITERIA_GROUP_OPTIONS }),
  field("title", "Наименование", "text"),
  field("description", "Пояснение/основание", "textarea"),
  field("kind", "Тип", "text"),
  field("note", "Комментарий", "text")
];

export function buildEditorSchema(record) {
  return {
    sections: EDITOR_SECTIONS.map((section) => ({
      ...section,
      fields: section.fields.map((item) => withValue(item, record))
    })),
    criteriaRowSchema: CRITERIA_ROW_SCHEMA,
    selectionCriteriaRowSchema: buildSelectionCriteriaRowSchema(),
    preassessmentRiskRowSchema: buildPreassessmentRiskRowSchema()
  };
}

export function buildEditableSections(record) {
  return buildEditorSchema(record).sections;
}

export function buildCriteriaRowSchema() {
  return CRITERIA_ROW_SCHEMA;
}

export function getCriteriaKindOptions() {
  return CRITERIA_KIND_OPTIONS;
}

export function getCriteriaGroupOptions() {
  return CRITERIA_GROUP_OPTIONS;
}

export function buildSelectionCriteriaRowSchema() {
  return [
    field("group", "Группа", "select", { options: SELECTION_CRITERIA_GROUP_OPTIONS }),
    field("title", "Критерий / требование", "text"),
    field("weightPercent", "Вес, %", "number"),
    field("blockFactor", "Блок-фактор / нет", "select", { options: SELECTION_CRITERIA_BLOCK_FACTOR_OPTIONS }),
    field("coverageStatus", "Закрытие", "select", { options: SELECTION_CRITERIA_COVERAGE_OPTIONS }),
    field("coverageAmount", "На сколько закрываем", "textarea"),
    field("coverageNote", "Как закрываем", "textarea"),
    field("sourceExcerpt", "Источник / выдержка", "textarea")
  ];
}

export function getSelectionCriteriaGroupOptions() {
  return SELECTION_CRITERIA_GROUP_OPTIONS;
}

export function getSelectionCriteriaCoverageOptions() {
  return SELECTION_CRITERIA_COVERAGE_OPTIONS;
}

export function buildPreassessmentRiskRowSchema() {
  return [
    field("parameter", "Параметр", "text"),
    field("managerComment", "Комментарий менеджера", "textarea"),
    field("criticality", "Критично/Не критично", "select", { options: PREASSESSMENT_CRITICALITY_OPTIONS }),
    field("riskBaseRef", "Ссылка на риск", "text"),
    field("sourceKey", "Ключ источника", "text")
  ];
}

export function getPreassessmentCriticalityOptions() {
  return PREASSESSMENT_CRITICALITY_OPTIONS;
}

export function getPreassessmentSummaryDecisionOptions() {
  return PREASSESSMENT_SUMMARY_DECISION_OPTIONS;
}

export function getProcurementStageOptions() {
  return PROCUREMENT_STAGE_OPTIONS;
}

export function getShortTitleOptions() {
  return SHORT_TITLE_OPTIONS;
}

export function normalizeShortTitle(value) {
  const normalized = String(value || "").trim();

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

  if (/оказани[ея]\s+услуг|выполнени[ея]\s+работ|техническ[а-я]+\s+поддержк|ведени[ея]\s+сайт/u.test(lowered)) {
    return "Аутсорс";
  }

  return "";
}

export function normalizeProcurementStage(value) {
  const normalized = String(value || "").trim();

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

export function normalizeSelectionCriteriaRows(input, options = {}) {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.rows)
      ? input.rows
      : [];
  const rows = [];

  for (const [index, row] of source.entries()) {
    const normalized = normalizeSelectionCriteriaRow(row, index, options);

    if (normalized) {
      rows.push(normalized);
    }
  }

  return rows
    .sort((left, right) => left.order - right.order)
    .map((row, index) => ({ ...row, order: index + 1 }));
}

export function normalizePreassessment(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  return {
    riskRows: normalizePreassessmentRiskRows(source.riskRows ?? source.rows ?? source.risks),
    riskBaseUrl: normalizeTextValue(source.riskBaseUrl ?? source.riskBaseHref ?? source.riskBaseLink),
    summaryDecision: normalizePreassessmentSummaryDecision(source.summaryDecision ?? source.decision ?? source.result),
    alexanderDecision: normalizePreassessmentSummaryDecision(source.alexanderDecision ?? source.responsibleDecision ?? source.alexander),
    estimateFileUrl: normalizeTextValue(source.estimateFileUrl ?? source.estimateFileHref ?? source.estimateFile)
  };
}

export function normalizePreassessmentRiskRows(input) {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.rows)
      ? input.rows
      : [];
  const rows = [];

  for (const [index, row] of source.entries()) {
    const normalized = normalizePreassessmentRiskRow(row, index);

    if (normalized) {
      rows.push(normalized);
    }
  }

  return rows
    .sort((left, right) => left.order - right.order)
    .map((row, index) => ({ ...row, order: index + 1 }));
}

export function normalizeCriteriaRows(input) {
  if (Array.isArray(input)) {
    return input.map((row) => normalizeCriteriaRow(row)).filter(Boolean);
  }

  if (!input || typeof input !== "object") {
    return [];
  }

  if (Array.isArray(input.rows)) {
    return input.rows.map((row) => normalizeCriteriaRow(row)).filter(Boolean);
  }

  const rows = [];
  rows.push(...normalizeCriteriaGroupRows(input.price, "price"));
  rows.push(...normalizeCriteriaGroupRows(input.nonPrice, "nonPrice"));
  rows.push(...normalizeCriteriaGroupRows(input.hardRequirements, "hardRequirements"));
  return rows;
}

export function buildLegacyCriteriaGroups(criteriaRows) {
  const rows = normalizeCriteriaRows(criteriaRows);
  return {
    price: rows.filter((row) => normalizeCriteriaGroup(row.group) === "price").map(stringifyCriteriaRow),
    nonPrice: rows.filter((row) => normalizeCriteriaGroup(row.group) === "nonPrice").map(stringifyCriteriaRow),
    hardRequirements: rows
      .filter((row) => normalizeCriteriaGroup(row.group) === "hardRequirements")
      .map(stringifyCriteriaRow)
  };
}

export function normalizeYesNo(value) {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["да", "yes", "true", "1"].includes(normalized)) {
      return true;
    }

    if (["нет", "no", "false", "0"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

export function normalizePurchaseBy(value) {
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

export function stringifyCriteriaRow(row) {
  return [row.title || "", row.description || "", row.kind || "", row.note || ""].filter(Boolean).join(" | ");
}

function field(key, label, type, extra = {}) {
  return { key, label, type, ...extra };
}

function withValue(fieldDefinition, record) {
  return {
    ...fieldDefinition,
    value: getPathValue(record, fieldDefinition.key),
    readOnly: Boolean(fieldDefinition.readOnly)
  };
}

function getPathValue(record, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    return current[segment];
  }, record);
}

function normalizeCriteriaGroupRows(input, fallbackGroup) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((row) => normalizeCriteriaRow(row, fallbackGroup)).filter(Boolean);
}

function normalizeCriteriaRow(row, fallbackGroup = "nonPrice") {
  if (typeof row === "string") {
    const title = row.trim();
    return title
      ? {
          group: fallbackGroup,
          title,
          description: "",
          kind: getDefaultCriteriaKind(fallbackGroup),
          note: ""
        }
      : null;
  }

  if (!row || typeof row !== "object") {
    return null;
  }

  const title = String(row.title ?? row.name ?? row.label ?? row.value ?? "").trim();
  const description = String(row.description ?? row.explanation ?? row.basis ?? "").trim();
  const group = normalizeCriteriaGroup(row.group ?? row.bucket ?? row.section ?? fallbackGroup, fallbackGroup);
  const kind = String(row.kind ?? row.type ?? row.subkind ?? "").trim() || getDefaultCriteriaKind(group);
  const note = String(row.note ?? row.comment ?? row.notes ?? "").trim();

  if (!title && !description && !note) {
    return null;
  }

  return {
    group,
    title,
    description,
    kind,
    note
  };
}

function normalizeSelectionCriteriaRow(row, index, options) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const title = String(row.title ?? row.name ?? row.label ?? "").trim();
  const coverageNote = String(row.coverageNote ?? row.note ?? row.description ?? "").trim();
  const coverageAmount = String(row.coverageAmount ?? row.coverageScope ?? row.coverageLevel ?? "").trim();
  const sourceExcerpt = String(row.sourceExcerpt ?? row.source ?? row.sourceText ?? "").trim();
  const weightPercent = normalizeWeightPercent(row.weightPercent ?? row.weight ?? row.weightPct);
  const blockFactor = normalizeSelectionCriteriaBlockFactor(row.blockFactor ?? row.isBlockFactor ?? row.blockingFactor);
  const hasContent = Boolean(title || coverageNote || coverageAmount || sourceExcerpt || weightPercent !== null || blockFactor);

  if (!hasContent) {
    return null;
  }

  const coverageStatus = normalizeCoverageStatus(row.coverageStatus ?? row.coverage ?? row.status);
  const group = normalizeSelectionCriteriaGroup(row.group ?? row.type ?? row.kind);

  return {
    order: normalizeOrder(row.order, index),
    group,
    title,
    weightPercent: group === "price" || group === "nonPrice" ? weightPercent : null,
    blockFactor: group === "requirement" ? blockFactor : "",
    coverageStatus,
    coverageAmount,
    coverageNote,
    sourceExcerpt
  };
}

function normalizePreassessmentRiskRow(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const parameter = normalizeTextValue(row.parameter ?? row.title ?? row.name ?? row.label);
  const managerComment = normalizeTextValue(row.managerComment ?? row.comment ?? row.note ?? row.notes ?? row.description);
  const criticality = normalizePreassessmentCriticality(row.criticality ?? row.status ?? row.isCritical);
  const riskBaseRef = normalizeTextValue(row.riskBaseRef ?? row.riskBaseId ?? row.riskRef);
  const sourceKey = normalizeTextValue(row.sourceKey ?? row.source ?? row.sourceId);
  const hasContent = Boolean(parameter || managerComment || riskBaseRef || sourceKey || criticality !== "unknown");

  if (!hasContent) {
    return null;
  }

  return {
    order: normalizeOrder(row.order, index),
    parameter,
    managerComment,
    criticality,
    riskBaseRef,
    sourceKey
  };
}

function normalizeOrder(value, index) {
  const order = Number(value);
  return Number.isFinite(order) && order > 0 ? order : index + 1;
}

function normalizeWeightPercent(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(String(value).replace("%", "").replace(",", ".").trim());

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, numeric));
}

function normalizeSelectionCriteriaGroup(value) {
  const normalized = String(value ?? "").trim();
  const lowered = normalized.toLowerCase().replace(/[-_\s]+/g, "");

  if (["price", "ценовой", "ценовойкритерий", "ценовые"].includes(lowered)) {
    return "price";
  }

  if (["nonprice", "non_price", "неценовой", "неценовойкритерий", "неценовые"].includes(lowered)) {
    return "nonPrice";
  }

  if (["requirement", "requirements", "hardrequirements", "требование", "дополнительноетребование", "требования"].includes(lowered)) {
    return "requirement";
  }

  return "nonPrice";
}

function normalizeCoverageStatus(value) {
  const normalized = String(value ?? "").trim();
  const lowered = normalized.toLowerCase().replace(/[-_\s]+/g, "");

  if (["full", "yes", "closed", "полностью", "полностьюзакрываем", "закрываем"].includes(lowered)) {
    return "full";
  }

  if (["partial", "partly", "частично", "частичнозакрываем"].includes(lowered)) {
    return "partial";
  }

  if (["none", "no", "notcovered", "незакрываем", "незакрыто", "нет"].includes(lowered)) {
    return "none";
  }

  return "";
}

function normalizeSelectionCriteriaBlockFactor(value) {
  const normalized = String(value ?? "").trim();
  const lowered = normalized.toLocaleLowerCase("ru-RU").replace(/[-_\s]+/g, "");

  if (!lowered) {
    return "";
  }

  if (["blockfactor", "блокфактор", "блок-фактор", "да", "yes", "true", "1"].includes(lowered)) {
    return "blockFactor";
  }

  if (["no", "false", "0", "нет", "неблокфактор"].includes(lowered)) {
    return "no";
  }

  return "";
}

function normalizePreassessmentCriticality(value) {
  if (value === true) {
    return "critical";
  }

  if (value === false) {
    return "notCritical";
  }

  const normalized = String(value ?? "").trim();
  const lowered = normalized.toLowerCase().replace(/[-_\s]+/g, "");

  if (["critical", "crit", "yes", "критично", "критичный", "критическая"].includes(lowered)) {
    return "critical";
  }

  if (["notcritical", "noncritical", "no", "некритично", "некритичный", "некритическая"].includes(lowered)) {
    return "notCritical";
  }

  return "unknown";
}

function normalizePreassessmentSummaryDecision(value) {
  const normalized = String(value ?? "").trim();
  const lowered = normalized.toLowerCase().replace(/[-_\s]+/g, "");

  if (["estimate", "evaluation", "оценка", "беремвоценку", "берёмвоценку", "оставитьвоценке", "оставитьвоценку"].includes(lowered)) {
    return "estimate";
  }

  if (["decline", "nobid", "no", "неучаствуем", "неучастие", "отказ", "отказаться", "отказотучастия"].includes(lowered)) {
    return "decline";
  }

  return "";
}

function normalizeTextValue(value) {
  return String(value ?? "").trim();
}

function getDefaultCriteriaKind(group) {
  if (group === "price") {
    return "основной";
  }

  if (group === "hardRequirements") {
    return "блок-фактор";
  }

  return "критерий";
}

function normalizeCriteriaGroup(value, fallback = "nonPrice") {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }

  const lowered = normalized.toLowerCase();

  if (["price", "ценовые"].includes(lowered)) {
    return "price";
  }

  if (["nonprice", "non_price", "неценовые"].includes(lowered)) {
    return "nonPrice";
  }

  if (
    [
      "hardrequirements",
      "hard_requirements",
      "требованиябезвеса",
      "требования без веса"
    ].includes(lowered.replace(/[-_\s]+/g, ""))
  ) {
    return "hardRequirements";
  }

  const option = CRITERIA_GROUP_OPTIONS.find((item) => item.value.toLowerCase() === lowered);
  return option ? option.value : fallback;
}
