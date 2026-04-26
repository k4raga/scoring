import fs from "node:fs";
import { getDataFilePath } from "./paths.js";
import {
  buildEditableSections,
  buildEditorSchema,
  buildLegacyCriteriaGroups,
  normalizeCriteriaRows,
  normalizePurchaseBy,
  normalizeYesNo
} from "./record-schema.js";
import { repairTextEncoding } from "./text-repair.js";

const DATA_FILE = getDataFilePath();

function normalizeRecord(record) {
  const publishedAt = normalizeText(record.publishedAt) || new Date().toISOString().slice(0, 10);
  const date = new Date(publishedAt);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const documents = normalizeDocuments(record.documents);
  const archiveDocument = documents.find((document) => document.kind === "archive") || documents[0] || null;
  const criteriaRows = normalizeCriteriaRows(record.criteriaRows ?? record.criteria);
  const uploadSummary = normalizeUploadSummary(record.summary, archiveDocument?.fileName);
  const notes = normalizeDisplayText(normalizeUploadSummary(record.notes, archiveDocument?.fileName)) || uploadSummary;
  const summary = uploadSummary || notes || "Описание пока не заполнено.";
  const sourceUrl = normalizeText(record.sourceUrl);
  const etpUrl = normalizeText(record.etpUrl);
  const documentsFolderHref =
    normalizeText(record.documentsFolderHref) || archiveDocument?.href || sourceUrl || etpUrl;
  const googleDocumentsFolderHref =
    normalizeText(record.googleDocumentsFolderHref) || documentsFolderHref || archiveDocument?.href || sourceUrl;
  const requirementsDocumentUrl =
    normalizeText(record.requirementsDocumentUrl) || archiveDocument?.href || documentsFolderHref || sourceUrl;
  const criteriaDocumentUrl =
    normalizeText(record.criteriaDocumentUrl) || archiveDocument?.href || documentsFolderHref || sourceUrl;
  const technicalSpecificationUrl =
    normalizeText(record.technicalSpecificationUrl) || archiveDocument?.href || documentsFolderHref || sourceUrl;

  const normalizedBase = {
    ...record,
    publishedAt,
    deadlineAt: normalizeDateTime(record.deadlineAt),
    projectTitle: normalizeDisplayText(record.projectTitle) || normalizeDisplayText(record.title),
    title: normalizeDisplayText(record.title),
    shortTitle: normalizeDisplayText(record.shortTitle) || normalizeDisplayText(record.title),
    customer: normalizeDisplayText(record.customer),
    region: normalizeDisplayText(record.region),
    platform: normalizeDisplayText(record.platform),
    purchaseBy: normalizePurchaseBy(record.purchaseBy),
    sourceUrl,
    etpUrl,
    documentsFolderHref: documentsFolderHref || "",
    googleDocumentsFolderHref: googleDocumentsFolderHref || "",
    nmc: normalizeDisplayText(record.nmc) || normalizeDisplayText(record.priceStatus),
    status: normalizeDisplayText(record.status) || "Нужен анализ",
    stage: normalizeDisplayText(record.stage) || "Скоринг",
    priceStatus: normalizeDisplayText(record.priceStatus) || normalizeDisplayText(record.nmc) || "Не заполнено",
    executionWindow: normalizeDisplayText(record.executionWindow) || normalizeDisplayText(record.overallExecutionTerm) || "Не заполнено",
    description: normalizeDisplayText(record.description),
    contractor: normalizeDisplayText(record.contractor) || normalizeDisplayText(record.executor) || normalizeDisplayText(record.supplier),
    platformPayment: normalizeDisplayText(record.platformPayment),
    applicationSecurity: normalizeDisplayText(record.applicationSecurity),
    contractSecurity: normalizeDisplayText(record.contractSecurity),
    overallExecutionTerm: normalizeDisplayText(record.overallExecutionTerm) || normalizeDisplayText(record.executionWindow),
    contractTerm: normalizeDisplayText(record.contractTerm),
    retrade: normalizeDisplayText(record.retrade),
    antiDumpingMeasures: normalizeDisplayText(record.antiDumpingMeasures),
    notes,
    creative: normalizeCreativeValue(record.creative),
    requirementsDocumentUrl: requirementsDocumentUrl || "",
    criteriaDocumentUrl: criteriaDocumentUrl || "",
    technicalSpecificationUrl: technicalSpecificationUrl || "",
    summary,
    criteriaRows,
    criteria: buildLegacyCriteriaGroups(criteriaRows),
    documents,
    workflow: {
      codingFile: normalizeText(record.workflow?.codingFile) || "Не сформирован",
      bitrixTaskStatus: normalizeText(record.workflow?.bitrixTaskStatus) || "Не создана",
      pageStatus: normalizeText(record.workflow?.pageStatus) || "Не создана",
      projectFolder: normalizeText(record.workflow?.projectFolder),
      codexRun: {
        status: normalizeText(record.workflow?.codexRun?.status),
        method: normalizeText(record.workflow?.codexRun?.method),
        runRoot: normalizeText(record.workflow?.codexRun?.runRoot),
        scriptPath: normalizeText(record.workflow?.codexRun?.scriptPath)
      },
      analysis: normalizeWorkflowAnalysis(record.workflow?.analysis)
    },
    year,
    month,
    day,
    dayKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };

  const editorSchema = buildEditorSchema(normalizedBase);

  return {
    ...normalizedBase,
    editableSections: buildEditableSections(normalizedBase),
    editorSchema,
    excelSections: buildExcelSections(normalizedBase)
  };
}

function normalizeCreativeValue(value) {
  const normalized = normalizeYesNo(value);

  if (normalized !== null) {
    return normalized;
  }

  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();

    if (["да", "yes", "true", "1"].includes(candidate)) {
      return true;
    }

    if (["нет", "no", "false", "0"].includes(candidate)) {
      return false;
    }
  }

  return null;
}

function toCardSummary(record) {
  return {
    id: record.id,
    projectTitle: record.projectTitle,
    title: record.title,
    shortTitle: record.shortTitle,
    summary: record.summary,
    description: record.description,
    customer: record.customer,
    contractor: record.contractor,
    region: record.region,
    status: record.status,
    stage: record.stage,
    publishedAt: record.publishedAt,
    deadlineAt: record.deadlineAt,
    dayKey: record.dayKey,
    documentsCount: Array.isArray(record.documents) ? record.documents.length : 0
  };
}

function byPublishedDesc(left, right) {
  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
}

export function loadRawRecords() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

export function loadRecords() {
  return loadRawRecords().map(normalizeRecord).sort(byPublishedDesc);
}

export function saveRecords(records) {
  const normalized = records.map((record) => {
    const {
      year,
      month,
      day,
      dayKey,
      excelSections,
      editableSections,
      editorSchema,
      criteria,
      ...rest
    } = normalizeRecord(record);

    return rest;
  });

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
}

export function buildRecordId(publishedAt, title) {
  return `${publishedAt}-${slugify(title)}`;
}

export function buildProjectFolderParts(publishedAt, title) {
  const date = new Date(publishedAt);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const slug = slugify(title);

  return [year, month, `${year}-${month}-${day}-${slug}`];
}

export function getYears(records) {
  const map = new Map();

  for (const record of records) {
    if (!map.has(record.year)) {
      map.set(record.year, {
        year: record.year,
        totalRecords: 0,
        months: new Set(),
        latestPublishedAt: record.publishedAt
      });
    }

    const yearItem = map.get(record.year);
    yearItem.totalRecords += 1;
    yearItem.months.add(record.month);

    if (new Date(record.publishedAt) > new Date(yearItem.latestPublishedAt)) {
      yearItem.latestPublishedAt = record.publishedAt;
    }
  }

  return [...map.values()]
    .map((item) => ({
      year: item.year,
      totalRecords: item.totalRecords,
      monthCount: item.months.size,
      latestPublishedAt: item.latestPublishedAt
    }))
    .sort((left, right) => right.year - left.year);
}

export function getYearView(records, year) {
  const targetYear = Number(year);
  const yearRecords = records.filter((record) => record.year === targetYear);

  if (!yearRecords.length) {
    return null;
  }

  const months = Array.from({ length: 12 }, (_, index) => index + 1)
    .map((month) => {
      const monthRecords = yearRecords.filter((record) => record.month === month);
      const uniqueDays = new Set(monthRecords.map((record) => record.day));

      return {
        month,
        totalRecords: monthRecords.length,
        dayCount: uniqueDays.size,
        records: monthRecords.map(toCardSummary)
      };
    })
    .filter((item) => item.totalRecords > 0);

  return {
    year: targetYear,
    totalRecords: yearRecords.length,
    months
  };
}

export function getMonthView(records, year, month) {
  const targetYear = Number(year);
  const targetMonth = Number(month);
  const monthRecords = records.filter((record) => record.year === targetYear && record.month === targetMonth);

  const daysMap = new Map();

  for (const record of monthRecords) {
    if (!daysMap.has(record.day)) {
      daysMap.set(record.day, {
        day: record.day,
        dateLabel: record.dayKey,
        totalRecords: 0,
        records: []
      });
    }

    const dayItem = daysMap.get(record.day);
    dayItem.totalRecords += 1;
    dayItem.records.push(toCardSummary(record));
  }

  return {
    year: targetYear,
    month: targetMonth,
    totalRecords: monthRecords.length,
    projects: monthRecords.map(toCardSummary),
    days: [...daysMap.values()].sort((left, right) => left.day - right.day)
  };
}

export function getDayView(records, year, month, day) {
  const targetYear = Number(year);
  const targetMonth = Number(month);
  const targetDay = Number(day);

  const dayRecords = records.filter((record) => {
    return record.year === targetYear && record.month === targetMonth && record.day === targetDay;
  });

  if (!dayRecords.length) {
    return null;
  }

  const withDocumentsCount = dayRecords.filter((record) => record.documents.length > 0).length;
  const withSourceCount = dayRecords.filter((record) => Boolean(record.sourceUrl || record.etpUrl)).length;
  const readyForHandoffCount = dayRecords.filter((record) => {
    return /готов|подготов/i.test(record.stage) || /подготов/i.test(record.status);
  }).length;

  return {
    year: targetYear,
    month: targetMonth,
    day: targetDay,
    dayKey: dayRecords[0].dayKey,
    totalRecords: dayRecords.length,
    metrics: {
      withDocumentsCount,
      withSourceCount,
      readyForHandoffCount
    },
    records: dayRecords.map(toCardSummary)
  };
}

export function getRecordById(records, recordId) {
  return records.find((record) => record.id === recordId) ?? null;
}

export function getCurrentMonthDashboard(records, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthView = getMonthView(records, year, month);
  const currentMonthRecords = records.filter((record) => record.year === year && record.month === month);
  const readyForHandoffCount = currentMonthRecords.filter((record) => {
    return /готов|подготов/i.test(record.stage) || /подготов/i.test(record.status);
  }).length;
  const withDocumentsCount = currentMonthRecords.filter((record) => record.documents.length > 0).length;
  const archiveCount = currentMonthRecords.filter((record) => {
    return record.documents.some((document) => document.kind === "archive");
  }).length;

  return {
    now: now.toISOString(),
    current: {
      year,
      month,
      monthLabel: getMonthLabel(month),
      totalRecords: currentMonthRecords.length,
      projectCount: currentMonthRecords.length,
      dayCount: monthView.days.length,
      readyForHandoffCount,
      withDocumentsCount,
      archiveCount
    },
    monthView,
    years: getYears(records),
    latestRecords: records.slice(0, 5).map(toCardSummary)
  };
}

function buildExcelSections(record) {
  const criteriaRows = normalizeCriteriaRows(record.criteriaRows ?? record.criteria);
  const criteriaGroups = groupCriteriaRows(criteriaRows);

  return [
    {
      id: "general",
      title: "Общая информация",
      rows: [
        row("Заказчик", record.customer || "-"),
        row("Предмет закупки", record.title || "-"),
        row("Предмет кратко", record.shortTitle || "-"),
        row("Ссылка на извещение", record.sourceUrl || "-"),
        row("Ссылка на ЭТП", record.etpUrl || "-"),
        row("Папка с документами на рассмотрение", record.documentsFolderHref || "-"),
        row("Папка Google с документами", record.googleDocumentsFolderHref || "-"),
        row("Срок подачи", record.deadlineAt || "-")
      ]
    },
    {
      id: "amounts",
      title: "Информация по суммам",
      rows: [
        row("НМЦ", record.nmc || record.priceStatus || "-"),
        row("Оплата площадки", record.platformPayment || "-"),
        row("Обеспечение заявки", record.applicationSecurity || "-"),
        row("Обеспечение контракта", record.contractSecurity || "-")
      ]
    },
    {
      id: "tender",
      title: "Информация по тендеру",
      rows: [
        row("Этап", record.stage || "-"),
        row("Закупка по", record.purchaseBy || record.platform || "-"),
        row("Общий срок выполнения работ", record.overallExecutionTerm || record.executionWindow || "-"),
        row("Срок договора", record.contractTerm || "-"),
        row("Переторжка", record.retrade || "-"),
        row("Антидемпинговые меры", record.antiDumpingMeasures || "-"),
        row("Творческое", formatYesNo(record.creative)),
        row("Документ с требованиями", record.requirementsDocumentUrl || "-"),
        row("Документ с критериями выбора", record.criteriaDocumentUrl || "-"),
        row("Документ с ТЗ", record.technicalSpecificationUrl || "-"),
        row("Примечания", record.notes || record.summary || "-")
      ]
    },
    {
      id: "criteria",
      title: "Критерии выбора подрядчика",
      groups:
        criteriaGroups.length > 0
          ? criteriaGroups
          : [
              { title: "Ценовые", rows: [row("Ценовые", "-")] },
              { title: "Неценовые", rows: [row("Неценовые", "-")] },
              { title: "Требования без веса", rows: [row("Требования без веса", "-")] }
            ]
    }
  ];
}

function groupCriteriaRows(criteriaRows) {
  const groups = new Map([
    ["price", { title: "Ценовые", rows: [] }],
    ["nonPrice", { title: "Неценовые", rows: [] }],
    ["hardRequirements", { title: "Требования без веса", rows: [] }]
  ]);

  for (const criteriaRow of criteriaRows) {
    const groupKey = normalizeGroupKey(criteriaRow.group);
    const group = groups.get(groupKey) || groups.get("nonPrice");
    group.rows.push(
      row(
        criteriaRow.title || "Без названия",
        [
          criteriaRow.kind ? `Тип: ${criteriaRow.kind}` : "",
          criteriaRow.description ? `Основание: ${criteriaRow.description}` : "",
          criteriaRow.note ? `Комментарий: ${criteriaRow.note}` : ""
        ]
          .filter(Boolean)
          .join(" • ") || "-"
      )
    );
  }

  return [...groups.values()].map((group) => ({
    title: group.title,
    rows: group.rows.length ? group.rows : [row(group.title, "-")]
  }));
}

function normalizeGroupKey(value) {
  const text = normalizeText(value);
  if (text === "price" || text === "nonPrice" || text === "hardRequirements") {
    return text;
  }

  return "nonPrice";
}

function formatYesNo(value) {
  if (value === true) {
    return "Да";
  }

  if (value === false) {
    return "Нет";
  }

  return "-";
}

function row(label, value) {
  return { label, value };
}

function getMonthLabel(month) {
  return [
    "",
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь"
  ][month];
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return repairTextEncoding(String(value).trim());
}

function normalizeDisplayText(value) {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  return text.replace(/^(\s*)([\p{Ll}])/u, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("ru-RU")}`);
}

function normalizeDateTime(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeDocuments(documents) {
  return (Array.isArray(documents) ? documents : []).map((document) => ({
    ...document,
    label: normalizeText(document?.label),
    fileName: normalizeText(document?.fileName)
  }));
}

function normalizeUploadSummary(value, archiveFileName) {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  if (text.includes("Codex-run") && archiveFileName) {
    return `Архив ${normalizeText(archiveFileName)} загружен. Запущен локальный Codex-run.`;
  }

  return normalizeDisplayText(text);
}

function normalizeWorkflowAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return null;
  }

  return {
    status: normalizeText(analysis.status),
    service: normalizeText(analysis.service),
    runId: normalizeText(analysis.runId),
    runRoot: normalizeText(analysis.runRoot),
    normalizedDir: normalizeText(analysis.normalizedDir),
    documentIndex: normalizeText(analysis.documentIndex),
    stages: Array.isArray(analysis.stages)
      ? analysis.stages
          .filter((stage) => stage && typeof stage === "object" && !Array.isArray(stage))
          .map((stage) => ({
            name: normalizeText(stage.name),
            status: normalizeText(stage.status),
            at: normalizeText(stage.at),
            payload: stage.payload && typeof stage.payload === "object" && !Array.isArray(stage.payload) ? stage.payload : {}
          }))
      : []
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
