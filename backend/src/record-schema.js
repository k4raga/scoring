const YES_NO_OPTIONS = [
  { value: false, label: "Нет" },
  { value: true, label: "Да" }
];

const CRITERIA_GROUP_OPTIONS = [
  { value: "price", label: "Ценовые" },
  { value: "nonPrice", label: "Неценовые" },
  { value: "hardRequirements", label: "Требования без веса" }
];

const CRITERIA_KIND_OPTIONS = [
  { value: "основной", label: "основной" },
  { value: "критерий", label: "критерий" },
  { value: "блок-фактор", label: "блок-фактор" }
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

const EDITOR_SECTIONS = [
  {
    id: "general",
    title: "Общая информация",
    fields: [
      field("customer", "Заказчик", "text"),
      field("title", "Предмет закупки", "text"),
      field("shortTitle", "Предмет кратко", "text"),
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
  const criteriaRows = normalizeCriteriaRows(record.criteriaRows ?? record.criteria);

  return {
    sections: [
      ...EDITOR_SECTIONS.map((section) => ({
        ...section,
        fields: section.fields.map((item) => withValue(item, record))
      })),
      {
        id: "criteria",
        title: "Критерии выбора подрядчика",
        rowSchema: CRITERIA_ROW_SCHEMA,
        rows: criteriaRows
      }
    ],
    criteriaRowSchema: CRITERIA_ROW_SCHEMA
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
