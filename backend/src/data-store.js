import fs from "node:fs";
import path from "node:path";
import { getDataFilePath } from "./paths.js";
import {
  buildEditableSections,
  buildEditorSchema,
  buildLegacyCriteriaGroups,
  normalizeCriteriaRows,
  normalizePreassessment,
  normalizeSelectionCriteriaRows,
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
  const documentArtifacts = buildDocumentArtifacts(record, documents, archiveDocument);
  const documentWiki = normalizeDocumentWikiConfig(record.documentWiki);
  const criteriaRows = normalizeCriteriaRows(record.criteriaRows ?? record.criteria);
  const selectionCriteriaRows = normalizeSelectionCriteriaRows(record.selectionCriteriaRows ?? record.selectionCriteria);
  const preassessment = normalizePreassessment(record.preassessment);
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
    selectionCriteriaRows,
    preassessment,
    documents,
    documentArtifacts,
    documentWiki,
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
      analysis: normalizeWorkflowAnalysis(record.workflow?.analysis),
      extraction: normalizeWorkflowExtraction(record.workflow?.extraction)
    },
    year,
    month,
    day,
    dayKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };

  const editorSchema = buildEditorSchema(normalizedBase);

  return {
    ...normalizedBase,
    documentBlocks: buildDocumentBlocks(normalizedBase),
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
  ensureDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function loadRecords() {
  return loadRawRecords().map(normalizeRecord).sort(byPublishedDesc);
}

export function saveRecords(records) {
  ensureDataFile();

  const normalized = records.map((record) => {
    const {
      year,
      month,
      day,
      dayKey,
      excelSections,
      editableSections,
      editorSchema,
      documentArtifacts,
      documentBlocks,
      criteria,
      ...rest
    } = normalizeRecord(record);

    return rest;
  });

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
}

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]\n", "utf-8");
  }
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
  const selectionCriteriaRows = normalizeSelectionCriteriaRows(record.selectionCriteriaRows);
  const selectionCriteriaGroups = groupSelectionCriteriaRows(selectionCriteriaRows);

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
      title: "Критерии выбора",
      groups:
        selectionCriteriaGroups.length > 0
          ? selectionCriteriaGroups
          : [
              { title: "Ценовые критерии", rows: [row("Ценовые критерии", "Не заполнено")] },
              { title: "Неценовые критерии", rows: [row("Неценовые критерии", "Не заполнено")] },
              { title: "Дополнительные требования", rows: [row("Дополнительные требования", "Не заполнено")] }
            ]
    }
  ];
}

function groupSelectionCriteriaRows(selectionCriteriaRows) {
  const groups = new Map([
    ["price", { title: "Ценовые критерии", rows: [] }],
    ["nonPrice", { title: "Неценовые критерии", rows: [] }],
    ["requirement", { title: "Дополнительные требования", rows: [] }]
  ]);

  for (const criteriaRow of selectionCriteriaRows) {
    const group = groups.get(criteriaRow.group) || groups.get("nonPrice");
    group.rows.push(
      row(
        criteriaRow.title || "Без названия",
        [
          criteriaRow.weightPercent !== null && criteriaRow.weightPercent !== undefined ? `Вес: ${criteriaRow.weightPercent}%` : "",
          criteriaRow.coverageStatus ? `Закрытие: ${formatCoverageStatus(criteriaRow.coverageStatus)}` : "",
          criteriaRow.coverageNote ? `Пояснение: ${criteriaRow.coverageNote}` : "",
          criteriaRow.sourceExcerpt ? `Источник: ${criteriaRow.sourceExcerpt}` : ""
        ]
          .filter(Boolean)
          .join(" • ") || "-"
      )
    );
  }

  return [...groups.values()].map((group) => ({
    title: group.title,
    rows: group.rows.length ? group.rows : [row(group.title, "Не заполнено")]
  }));
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

function formatCoverageStatus(value) {
  const labels = {
    full: "Полностью закрываем",
    partial: "Частично закрываем",
    none: "Не закрываем"
  };

  return labels[value] || value || "-";
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
    fileName: normalizeText(document?.fileName),
    href: normalizeText(document?.href),
    path: normalizeText(document?.path),
    kind: normalizeText(document?.kind),
    group: normalizeText(document?.group),
    documentId: normalizeText(document?.documentId)
  }));
}

function buildDocumentArtifacts(record, documents, archiveDocument) {
  const extraction = normalizeWorkflowExtraction(record.workflow?.extraction);
  const analysis = normalizeWorkflowAnalysis(record.workflow?.analysis);
  const sourceArchives = uniqueArtifacts([
    ...documents.filter((document) => document.kind === "archive"),
    archiveDocument?.kind === "archive" ? archiveDocument : null
  ].filter(Boolean).map((document) => ({
    ...document,
    kind: "archive",
    group: "sourceArchive",
    label: document.label || "Исходный архив"
  })));
  const normalizedMarkdown = uniqueArtifacts([
    ...documents.filter((document) => document.kind === "normalized_markdown" || document.group === "normalizedMarkdown"),
    ...extractMarkdownDocuments(extraction),
    ...extractMarkdownDocuments(analysis)
  ]);
  const originalDocuments = uniqueArtifacts([
    ...extractOriginalDocuments(extraction),
    ...extractOriginalDocuments(analysis)
  ]);
  const jsonArtifacts = uniqueArtifacts([
    ...documents.filter((document) => document.kind === "json_artifact" || document.group === "jsonArtifacts"),
    ...extractJsonArtifacts(extraction),
    ...extractJsonArtifacts(analysis)
  ]);
  const knowledgeArtifacts = uniqueArtifacts([
    ...documents.filter((document) => document.kind === "knowledge_html" || document.group === "knowledgeArtifacts"),
    ...extractKnowledgeArtifacts(record.id, extraction),
    ...extractKnowledgeArtifacts(record.id, analysis)
  ]);
  const fallbackDocuments = uniqueArtifacts([
    ...documents.filter((document) => document.kind === "fallback_document" || document.group === "fallbackDocuments"),
    ...extractFallbackDocuments(extraction),
    ...extractFallbackDocuments(analysis)
  ]);
  const legacyUploaded = uniqueArtifacts(documents.filter((document) => {
    return !["archive", "source_document", "normalized_markdown", "json_artifact", "knowledge_html", "fallback_document"].includes(document.kind);
  }));

  return {
    sourceArchives,
    originalDocuments,
    normalizedMarkdown,
    jsonArtifacts,
    knowledgeArtifacts,
    fallbackDocuments,
    legacyUploaded
  };
}

function extractOriginalDocuments(source) {
  return (Array.isArray(source?.documents) ? source.documents : [])
    .filter((document) => normalizeText(document?.sourceFileUrl || document?.href))
    .map((document) => ({
      kind: "source_document",
      group: "sourceDocuments",
      documentId: normalizeText(document.documentId || document.id),
      label: normalizeText(document.sourceFileName || document.fileName || document.name || document.documentId || document.id),
      fileName: normalizeText(document.sourceFileName || document.fileName || document.name),
      href: normalizeText(document.sourceFileUrl || document.href),
      sourcePath: normalizeText(document.sourcePath || document.relativePath),
      mimeType: normalizeText(document.sourceMimeType || document.mimeType),
      sizeBytes: Number(document.sourceSizeBytes || document.sizeBytes || 0),
      status: normalizeText(document.status)
    }));
}

function uniqueArtifacts(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const key = normalizeText(item.href) || normalizeText(item.path) || normalizeText(item.documentId) || normalizeText(item.fileName) || normalizeText(item.label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeDocumentWikiConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const overridesSource = source.overrides && typeof source.overrides === "object" && !Array.isArray(source.overrides)
    ? source.overrides
    : {};
  const overrides = {};

  for (const [blockId, override] of Object.entries(overridesSource)) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      continue;
    }

    const normalizedBlockId = normalizeText(blockId);

    if (!normalizedBlockId) {
      continue;
    }

    overrides[normalizedBlockId] = {
      title: normalizeText(override.title),
      visible: override.visible === false ? false : true,
      order: Number.isFinite(Number(override.order)) ? Number(override.order) : null
    };
  }

  const manualBlocks = (Array.isArray(source.manualBlocks) ? source.manualBlocks : [])
    .filter((block) => block && typeof block === "object" && !Array.isArray(block))
    .map((block, index) => ({
      id: normalizeText(block.id) || `manual-${index + 1}`,
      type: normalizeDocumentBlockType(block.type, "manual"),
      title: normalizeText(block.title) || "Ручной блок",
      href: normalizeText(block.href),
      body: normalizeText(block.body),
      visible: block.visible === false ? false : true,
      order: Number.isFinite(Number(block.order)) ? Number(block.order) : 1000 + index
    }));

  return {
    version: 1,
    overrides,
    manualBlocks
  };
}

function buildDocumentBlocks(record) {
  const documentWiki = normalizeDocumentWikiConfig(record.documentWiki);
  const artifacts = record.documentArtifacts && typeof record.documentArtifacts === "object" ? record.documentArtifacts : {};
  const generatedBlocks = [
    ...buildGeneratedBlocks(artifacts.sourceArchives, "source", "Исходный архив", 100),
    ...buildGeneratedBlocks(artifacts.originalDocuments, "source", "Оригинал документа", 200, record.id),
    ...buildGeneratedBlocks(artifacts.knowledgeArtifacts, "wiki", "База знаний", 300),
    ...buildGeneratedBlocks(artifacts.normalizedMarkdown, "wiki", "Wiki/MD документ", 400, record.id),
    ...buildGeneratedBlocks(artifacts.fallbackDocuments, "fallback", "Требуется fallback", 700),
    ...buildGeneratedBlocks(artifacts.legacyUploaded, "source", "Загруженный файл", 800),
    ...buildGeneratedBlocks(artifacts.jsonArtifacts, "diagnostic", "Служебный артефакт", 900)
  ];
  const blocks = [
    ...generatedBlocks.map((block) => applyDocumentBlockOverride(block, documentWiki.overrides[block.id])),
    ...documentWiki.manualBlocks.map((block) => ({
      id: block.id,
      source: "manual",
      type: normalizeDocumentBlockType(block.type, "manual"),
      title: block.title,
      subtitle: block.body ? "Ручная заметка" : "Ручная ссылка",
      href: block.href,
      body: block.body,
      visible: block.visible,
      order: block.order,
      editable: true,
      removable: true
    }))
  ].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "ru-RU"));

  return {
    version: 1,
    knowledgeBase: {
      target: "Quartz",
      renderer: "quartz-compatible",
      projectId: normalizeText(record.id),
      projectTitle: normalizeText(record.projectTitle || record.title || record.id),
      publishPath: buildKnowledgePublishPath(record)
    },
    blocks,
    groups: groupDocumentBlocks(blocks)
  };
}

function buildGeneratedBlocks(items, type, fallbackTitle, baseOrder, recordId = "") {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const documentId = normalizeText(item.documentId || item.artifactKey || item.id);
    const href = normalizeText(item.href || item.sourceHref);
    const blockId = buildDocumentBlockId(type, item, index);
    const title = normalizeText(item.label || item.sourceFileName || item.fileName || item.artifactKey) || fallbackTitle;
    const route = type === "wiki" && documentId && item.kind === "normalized_markdown" && recordId
      ? `/records/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(documentId)}`
      : type === "source" && documentId && item.kind === "source_document" && recordId
        ? `/api/records/${encodeURIComponent(recordId)}/source-documents/${encodeURIComponent(documentId)}`
        : "";

    return {
      id: blockId,
      source: "generated",
      type: normalizeDocumentBlockType(type, "source"),
      title,
      subtitle: buildDocumentBlockSubtitle(item, type),
      href,
      route,
      body: "",
      visible: true,
      order: baseOrder + index,
      editable: true,
      removable: false,
      documentId,
      artifactKey: normalizeText(item.artifactKey),
      fileName: normalizeText(item.fileName || item.sourceFileName),
      sourcePath: normalizeText(item.sourcePath),
      sourceDocument: item
    };
  });
}

function applyDocumentBlockOverride(block, override) {
  if (!override) {
    return block;
  }

  return {
    ...block,
    title: normalizeText(override.title) || block.title,
    visible: override.visible === false ? false : true,
    order: Number.isFinite(Number(override.order)) ? Number(override.order) : block.order
  };
}

function buildDocumentBlockId(type, item, index) {
  const sourceKey =
    normalizeText(item.documentId) ||
    normalizeText(item.artifactKey) ||
    normalizeText(item.href) ||
    normalizeText(item.path) ||
    normalizeText(item.fileName) ||
    normalizeText(item.label) ||
    String(index + 1);

  return `${normalizeDocumentBlockType(type, "source")}:${sourceKey}`;
}

function buildDocumentBlockSubtitle(item, type) {
  if (type === "diagnostic") {
    return normalizeText(item.artifactKey || item.fileName || "Диагностика");
  }

  if (type === "fallback") {
    const fallback = item.fallback && typeof item.fallback === "object" ? item.fallback : {};
    return [normalizeText(item.status), normalizeText(fallback.reason || fallback.suggestedPipeline)].filter(Boolean).join(" · ");
  }

  if (type === "wiki") {
    return normalizeText(item.sourceFileName || item.fileName || item.status || "Markdown");
  }

  return normalizeText(item.sourcePath || item.fileName || item.mimeType);
}

function groupDocumentBlocks(blocks) {
  const labels = {
    source: "Оригиналы",
    wiki: "Wiki / MD",
    manual: "Ручные блоки",
    fallback: "Требуется fallback",
    diagnostic: "Диагностика"
  };
  const groups = {};

  for (const block of blocks) {
    const type = normalizeDocumentBlockType(block.type, "source");

    if (!groups[type]) {
      groups[type] = {
        id: type,
        title: labels[type] || type,
        blocks: []
      };
    }

    groups[type].blocks.push(block);
  }

  return Object.values(groups);
}

function normalizeDocumentBlockType(value, fallback) {
  const normalized = normalizeText(value);

  if (["source", "wiki", "manual", "fallback", "diagnostic"].includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function buildKnowledgePublishPath(record) {
  const year = normalizeText(record.year);
  const month = String(record.month || "").padStart(2, "0");
  const slug = slugify(record.projectTitle || record.title || record.id || "project");
  return ["projects", year, month, slug].filter(Boolean).join("/");
}

function extractMarkdownDocuments(source) {
  return (Array.isArray(source?.documents) ? source.documents : [])
    .filter((document) => {
      const extraction = document?.extraction && typeof document.extraction === "object" ? document.extraction : {};
      return normalizeText(extraction.markdownHref || extraction.markdownPath || document.markdownHref || document.markdownPath || document.mdHref || document.mdPath);
    })
    .map((document) => {
      const extraction = document.extraction && typeof document.extraction === "object" ? document.extraction : {};
      const markdownHref = normalizeText(extraction.markdownHref || document.markdownHref || document.mdHref);
      const markdownPath = normalizeText(extraction.markdownPath || document.markdownPath || document.mdPath);
      const documentId = normalizeText(document.documentId || document.id);

      return {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId,
        label: normalizeText(document.fileName || document.name || documentId || "Markdown document"),
        fileName: normalizeText(document.fileName || document.name || `${documentId}.md`),
        href: markdownHref,
        path: markdownPath,
        sourceFileName: normalizeText(document.fileName || document.name),
        sourcePath: normalizeText(document.sourcePath || document.relativePath),
        status: normalizeText(document.status),
        extraction
      };
    });
}

function extractJsonArtifacts(source) {
  const artifacts = source?.artifacts && typeof source.artifacts === "object" && !Array.isArray(source.artifacts)
    ? source.artifacts
    : {};
  const namedArtifacts = {
    ...artifacts,
    manifest: source?.manifest,
    extractionReport: source?.extractionReport,
    documentIndex: source?.documentIndex
  };

  return Object.entries(namedArtifacts)
    .filter(([key, value]) => normalizeText(key) && normalizeText(value) && /\.json(?:$|[?#])/iu.test(normalizeText(value)))
    .map(([key, value]) => ({
      kind: "json_artifact",
      group: "jsonArtifacts",
      artifactKey: key,
      label: formatArtifactLabel(key),
      fileName: path.basename(normalizeText(value).split(/[?#]/u)[0]),
      href: normalizeText(value)
    }));
}

function extractKnowledgeArtifacts(recordId, source) {
  const artifacts = source?.artifacts && typeof source.artifacts === "object" && !Array.isArray(source.artifacts)
    ? source.artifacts
    : {};

  return Object.entries(artifacts)
    .filter(([key, value]) => normalizeText(key) && normalizeText(value) && /\.html?(?:$|[?#])/iu.test(normalizeText(value)))
    .map(([key, value]) => ({
      kind: "knowledge_html",
      group: "knowledgeArtifacts",
      artifactKey: key,
      label: key === "knowledgeIndexHtml" ? "База знаний" : formatArtifactLabel(key),
      fileName: path.basename(normalizeText(value).split(/[?#]/u)[0]),
      href: `/api/records/${encodeURIComponent(recordId)}/extraction-artifacts/${encodeURIComponent(key)}`,
      sourceHref: normalizeText(value)
    }));
}

function extractFallbackDocuments(source) {
  return (Array.isArray(source?.documents) ? source.documents : [])
    .filter((document) => document?.fallback || normalizeText(document?.status) === "needs_fallback")
    .map((document) => ({
      kind: "fallback_document",
      group: "fallbackDocuments",
      documentId: normalizeText(document.documentId || document.id),
      label: normalizeText(document.fileName || document.name || document.documentId || document.id),
      fileName: normalizeText(document.fileName || document.name),
      sourcePath: normalizeText(document.sourcePath || document.relativePath),
      status: normalizeText(document.status),
      fallback: document.fallback && typeof document.fallback === "object" ? document.fallback : null
    }));
}

function formatArtifactLabel(key) {
  const labels = {
    inventoryJson: "inventory.json",
    documentsJson: "documents.json",
    manifestJson: "manifest.json",
    extractionReportJson: "extraction-report.json",
    legacyDocumentIndexJson: "document-index.json",
    knowledgeIndexHtml: "База знаний",
    manifest: "manifest.json",
    extractionReport: "extraction-report.json",
    documentIndex: "document-index.json"
  };

  return labels[key] || key;
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
    manifest: normalizeText(analysis.manifest),
    extractionReport: normalizeText(analysis.extractionReport),
    archive: analysis.archive && typeof analysis.archive === "object" && !Array.isArray(analysis.archive) ? analysis.archive : null,
    artifacts: analysis.artifacts && typeof analysis.artifacts === "object" && !Array.isArray(analysis.artifacts) ? analysis.artifacts : {},
    documents: Array.isArray(analysis.documents) ? analysis.documents : [],
    stages: Array.isArray(analysis.stages)
      ? analysis.stages
          .filter((stage) => stage && typeof stage === "object" && !Array.isArray(stage))
          .map((stage) => ({
            id: normalizeText(stage.id),
            name: normalizeText(stage.name),
            status: normalizeText(stage.status),
            at: normalizeText(stage.at),
            payload: stage.payload && typeof stage.payload === "object" && !Array.isArray(stage.payload) ? stage.payload : {}
          }))
      : []
  };
}

function normalizeWorkflowExtraction(extraction) {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) {
    return null;
  }

  return {
    status: normalizeText(extraction.status),
    service: normalizeText(extraction.service),
    version: normalizeText(extraction.version),
    runId: normalizeText(extraction.runId),
    runRoot: normalizeText(extraction.runRoot),
    normalizedDir: normalizeText(extraction.normalizedDir),
    archive: extraction.archive && typeof extraction.archive === "object" && !Array.isArray(extraction.archive) ? extraction.archive : null,
    artifacts: extraction.artifacts && typeof extraction.artifacts === "object" && !Array.isArray(extraction.artifacts) ? extraction.artifacts : {},
    documents: Array.isArray(extraction.documents) ? extraction.documents : [],
    report: extraction.report && typeof extraction.report === "object" && !Array.isArray(extraction.report) ? extraction.report : null,
    stages: Array.isArray(extraction.stages)
      ? extraction.stages
          .filter((stage) => stage && typeof stage === "object" && !Array.isArray(stage))
          .map((stage) => ({
            id: normalizeText(stage.id),
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
