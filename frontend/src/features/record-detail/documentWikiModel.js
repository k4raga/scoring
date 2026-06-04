import { normalizeDocumentWikiConfig } from "./recordFormModel.js";

export function buildDocItems(form) {
  return [
    {
      key: "etpUrl",
      label: "Ссылка на ЭТП",
      placeholder: "Вставьте ссылку на ЭТП",
      value: form.etpUrl
    },
    {
      key: "documentsFolderHref",
      label: "Документы",
      placeholder: "Вставьте ссылку на документы",
      value: form.documentsFolderHref
    },
    {
      key: "sourceUrl",
      label: "Ссылка на извещение",
      placeholder: "Вставьте ссылку на извещение",
      value: form.sourceUrl
    },
    {
      key: "googleDocumentsFolderHref",
      label: "Папка на рассмотрение",
      placeholder: "Вставьте ссылку на папку",
      value: form.googleDocumentsFolderHref
    },
    {
      key: "requirementsDocumentUrl",
      label: "Требования",
      placeholder: "Вставьте ссылку на требования",
      value: form.requirementsDocumentUrl
    },
    {
      key: "criteriaDocumentUrl",
      label: "Критерии выбора",
      placeholder: "Вставьте ссылку на критерии",
      value: form.criteriaDocumentUrl
    },
    {
      key: "technicalSpecificationUrl",
      label: "ТЗ",
      placeholder: "Вставьте ссылку на ТЗ",
      value: form.technicalSpecificationUrl
    }
  ];
}

export function buildEditableDocumentBlocks(record, documentWiki) {
  const config = normalizeDocumentWikiConfig(documentWiki);
  const sourceBlocks = Array.isArray(record?.documentBlocks?.blocks)
    ? record.documentBlocks.blocks
    : buildDocumentBlocksFromLegacyGroups(record);
  const generatedBlocks = sourceBlocks
    .filter((block) => block.source !== "manual")
    .map((block) => {
      const override = config.overrides[block.id] || {};

      return {
        ...block,
        title: override.title || block.title,
        visible: override.visible === false ? false : true,
        order: Number.isFinite(Number(override.order)) ? Number(override.order) : Number(block.order || 0)
      };
    });
  const manualBlocks = config.manualBlocks.map((block) => ({
    id: block.id,
    source: "manual",
    type: normalizeDocumentBlockType(block.type),
    title: block.title,
    subtitle: block.body ? "Ручная заметка" : "Ручная ссылка",
    href: block.href,
    body: block.body,
    visible: block.visible,
    order: block.order,
    editable: true,
    removable: true
  }));
  const blocks = [...generatedBlocks, ...manualBlocks]
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.title).localeCompare(String(right.title), "ru-RU"));

  return {
    version: 1,
    knowledgeBase: record?.documentBlocks?.knowledgeBase || {
      target: "Quartz",
      renderer: "quartz-compatible",
      projectId: record?.id || "",
      projectTitle: record?.projectTitle || record?.title || "",
      publishPath: ""
    },
    blocks
  };
}

export function buildCompactDocumentRows(blocks, record, recordId) {
  const sourceByDocumentId = new Map();
  const wikiByDocumentId = new Map();
  const rows = [];
  const normalizedRecordId = String(recordId || record?.id || "").trim();

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block.visible) {
      continue;
    }

    if (block.documentId && block.type === "source") {
      sourceByDocumentId.set(block.documentId, block);
    }

    if (block.documentId && block.type === "wiki") {
      wikiByDocumentId.set(block.documentId, block);
    }
  }

  if (hasSourceArchive(record, blocks) && normalizedRecordId) {
    rows.push({
      id: "source-archive",
      title: "Исходный архив",
      mdHref: "",
      sourceHref: `/api/records/${encodeURIComponent(normalizedRecordId)}/source-archive`,
      sourceLabel: "Архив",
      href: ""
    });
  }

  if (normalizedRecordId) {
    rows.push({
      id: "source-folder",
      title: "Папка распаковки",
      mdHref: "",
      sourceHref: `/records/${encodeURIComponent(normalizedRecordId)}/source-folder`,
      sourceLabel: "Папка",
      href: ""
    });
  }

  for (const [documentId, wiki] of wikiByDocumentId.entries()) {
    if (String(documentId).startsWith("artifact-")) {
      continue;
    }

    const source = sourceByDocumentId.get(documentId);
    rows.push({
      id: `document-${documentId}`,
      title: stripExtension(wiki.title || source?.title || documentId),
      mdHref: wiki.route || wiki.href || "",
      sourceHref: source?.route || source?.href || "",
      sourceLabel: source ? getSourceActionLabel(source) : "",
      href: ""
    });
  }

  return rows;
}

export function createDocumentBlockId() {
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDocumentBlockTypeLabel(type) {
  const labels = {
    source: "Оригинал",
    wiki: "Wiki / MD",
    manual: "Ручной",
    fallback: "Fallback",
    diagnostic: "Диагностика"
  };

  return labels[type] || type || "Блок";
}

export function formatFallbackSummary(document) {
  const fallback = document?.fallback && typeof document.fallback === "object" ? document.fallback : {};
  const reason = String(fallback.reason || document?.status || "manual_review_required").trim();
  const pipeline = String(fallback.suggestedPipeline || fallback.pipeline || "").trim();

  return [reason, pipeline].filter(Boolean).join(" · ");
}

function buildDocumentGroups(record) {
  const artifacts = record?.documentArtifacts && typeof record.documentArtifacts === "object" ? record.documentArtifacts : {};
  const fallbackFromDocuments = groupLegacyDocuments(record?.documents || []);

  return {
    sourceArchives: normalizeArtifactItems(artifacts.sourceArchives, fallbackFromDocuments.sourceArchives),
    normalizedMarkdown: normalizeArtifactItems(artifacts.normalizedMarkdown, fallbackFromDocuments.normalizedMarkdown),
    jsonArtifacts: normalizeArtifactItems(artifacts.jsonArtifacts, fallbackFromDocuments.jsonArtifacts),
    knowledgeArtifacts: normalizeArtifactItems(artifacts.knowledgeArtifacts, fallbackFromDocuments.knowledgeArtifacts),
    fallbackDocuments: normalizeArtifactItems(artifacts.fallbackDocuments, fallbackFromDocuments.fallbackDocuments),
    legacyUploaded: normalizeArtifactItems(artifacts.legacyUploaded, fallbackFromDocuments.legacyUploaded)
  };
}

function hasSourceArchive(record, blocks) {
  if (Array.isArray(blocks) && blocks.some((block) => block?.type === "source" && !block?.documentId)) {
    return true;
  }

  return Boolean(
    record?.documentsFolderHref ||
    record?.googleDocumentsFolderHref ||
    (Array.isArray(record?.documents) && record.documents.some((document) => document?.kind === "archive"))
  );
}

function stripExtension(value) {
  return String(value || "").replace(/\.[a-z0-9]{2,6}$/iu, "");
}

function getSourceActionLabel(block) {
  const fileName = String(block.fileName || block.title || block.href || "").toLowerCase();

  if (fileName.endsWith(".zip") || fileName.endsWith(".rar") || fileName.endsWith(".7z")) {
    return "Архив";
  }

  if (fileName.endsWith(".pdf")) {
    return "PDF";
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return "XLSX";
  }

  if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
    return "DOCX";
  }

  return "Файл";
}

function buildDocumentBlocksFromLegacyGroups(record) {
  const groups = buildDocumentGroups(record);
  const blockGroups = [
    ["sourceArchives", "source", 100],
    ["legacyUploaded", "source", 200],
    ["knowledgeArtifacts", "wiki", 300],
    ["normalizedMarkdown", "wiki", 400],
    ["fallbackDocuments", "fallback", 700],
    ["jsonArtifacts", "diagnostic", 900]
  ];
  const blocks = [];

  for (const [groupKey, type, baseOrder] of blockGroups) {
    for (const [index, document] of (groups[groupKey] || []).entries()) {
      const documentId = String(document?.documentId || document?.artifactKey || "").trim();
      const route = type === "wiki" && document.kind === "normalized_markdown" && documentId && record?.id
        ? `/records/${encodeURIComponent(record.id)}/documents/${encodeURIComponent(documentId)}`
        : "";
      const id = `${type}:${documentId || document?.href || document?.fileName || index}`;

      blocks.push({
        id,
        source: "generated",
        type,
        title: String(document?.label || document?.sourceFileName || document?.fileName || `Документ ${index + 1}`),
        subtitle: String(document?.sourcePath || document?.artifactKey || document?.status || ""),
        href: String(document?.href || ""),
        route,
        body: "",
        visible: true,
        order: baseOrder + index,
        documentId,
        artifactKey: String(document?.artifactKey || ""),
        sourceDocument: document
      });
    }
  }

  return blocks;
}

function normalizeDocumentBlockType(value) {
  const normalized = String(value || "").trim();

  if (["source", "wiki", "manual", "fallback", "diagnostic"].includes(normalized)) {
    return normalized;
  }

  return "manual";
}

function groupLegacyDocuments(documents) {
  const groups = {
    sourceArchives: [],
    normalizedMarkdown: [],
    jsonArtifacts: [],
    knowledgeArtifacts: [],
    fallbackDocuments: [],
    legacyUploaded: []
  };

  for (const document of Array.isArray(documents) ? documents : []) {
    const kind = String(document?.kind || "").trim();
    const group = String(document?.group || "").trim();

    if (kind === "archive") {
      groups.sourceArchives.push(document);
    } else if (kind === "normalized_markdown" || group === "normalizedMarkdown") {
      groups.normalizedMarkdown.push(document);
    } else if (kind === "json_artifact" || group === "jsonArtifacts") {
      groups.jsonArtifacts.push(document);
    } else if (kind === "knowledge_html" || group === "knowledgeArtifacts") {
      groups.knowledgeArtifacts.push(document);
    } else if (kind === "fallback_document" || group === "fallbackDocuments") {
      groups.fallbackDocuments.push(document);
    } else {
      groups.legacyUploaded.push(document);
    }
  }

  return groups;
}

function normalizeArtifactItems(primaryItems, fallbackItems = []) {
  const seen = new Set();
  const result = [];

  for (const item of [...(Array.isArray(primaryItems) ? primaryItems : []), ...(Array.isArray(fallbackItems) ? fallbackItems : [])]) {
    const key = String(item?.documentId || item?.href || item?.path || item?.fileName || item?.label || "").trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}
