import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRecord } from "../api.js";
import { LogoMark } from "../ui/icons.jsx";

export default function DocumentsPage() {
  const { recordId = "" } = useParams();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadRecord() {
      try {
        const nextRecord = await fetchRecord(recordId);

        if (!active) {
          return;
        }

        setRecord(nextRecord);
        setStatus("success");
        setError("");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setRecord(null);
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "documents_load_failed");
      }
    }

    loadRecord();

    return () => {
      active = false;
    };
  }, [recordId]);

  const rows = useMemo(() => buildDocumentRows(record), [record]);

  return (
    <div className="shell markdown-viewer-shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>
          <div className="brand-copy">
            <b>Scoring</b>
            <span>Документы проекта</span>
          </div>
        </Link>
      </header>

      {status === "loading" ? <div className="runtime-banner">Загружаем документы проекта.</div> : null}
      {status === "error" ? <div className="runtime-banner runtime-banner-error">Не удалось загрузить документы: {error}</div> : null}

      <main className="main documents-page-main">
        <section className="markdown-viewer-head">
          <Link className="detail-back-link" to={`/records/${encodeURIComponent(recordId)}`}>
            <span aria-hidden="true" className="detail-back-link-icon">&larr;</span>
            <span>Назад к проекту</span>
          </Link>

          <Link className="detail-back-link" to="/records">
            <span aria-hidden="true" className="detail-back-link-icon">&uarr;</span>
            <span>Все документы</span>
          </Link>

          <div className="markdown-viewer-title">
            <h1>Документы</h1>
            <p>{record?.projectTitle || record?.title || recordId}</p>
          </div>
        </section>

        <section className="documents-page-list">
          {rows.length ? rows.map((row) => <DocumentsPageRow key={row.id} row={row} />) : <div className="detail-doc-empty">Документы пока не привязаны.</div>}
        </section>
      </main>
    </div>
  );
}

function DocumentsPageRow({ row }) {
  return (
    <article className="documents-page-row">
      <div>
        <h2>{row.title}</h2>
        {row.subtitle ? <p>{row.subtitle}</p> : null}
      </div>
      <div className="documents-page-actions">
        {row.mdHref ? <Link to={row.mdHref}>MD</Link> : null}
        {row.sourceHref ? (
          row.sourceHref.startsWith("/records/") ? (
            <Link to={row.sourceHref}>{row.sourceLabel}</Link>
          ) : (
            <a href={row.sourceHref} rel="noreferrer" target="_blank">{row.sourceLabel}</a>
          )
        ) : null}
        {row.knowledgeHref ? <a href={row.knowledgeHref} rel="noreferrer" target="_blank">Wiki</a> : null}
        {row.diagnosticHref ? <a href={row.diagnosticHref} rel="noreferrer" target="_blank">JSON</a> : null}
        {row.taskHref ? <Link to={row.taskHref}>Задача</Link> : null}
      </div>
    </article>
  );
}

function buildDocumentRows(record) {
  const blocks = Array.isArray(record?.documentBlocks?.blocks) ? record.documentBlocks.blocks.filter((block) => block.visible !== false) : [];
  const sourceByDocumentId = new Map();
  const wikiByDocumentId = new Map();
  const rows = [];
  const recordId = String(record?.id || "").trim();

  for (const block of blocks) {
    if (block.type === "source" && block.documentId) {
      sourceByDocumentId.set(block.documentId, block);
    }

    if (block.type === "wiki" && block.documentId && !String(block.documentId).startsWith("artifact-")) {
      wikiByDocumentId.set(block.documentId, block);
    }
  }

  if (hasSourceArchive(record, blocks) && recordId) {
    rows.push({
      id: "source-archive",
      title: "Исходный архив",
      subtitle: "Полный архив, загруженный в проект",
      mdHref: "",
      sourceHref: `/api/records/${encodeURIComponent(recordId)}/source-archive`,
      sourceLabel: "Архив",
      knowledgeHref: "",
      diagnosticHref: "",
      taskHref: `/records/${encodeURIComponent(recordId)}`
    });
  }

  if (recordId) {
    rows.push({
      id: "source-folder",
      title: "Папка распаковки",
      subtitle: "Оригинальные документы из архива",
      mdHref: "",
      sourceHref: `/records/${encodeURIComponent(recordId)}/source-folder`,
      sourceLabel: "Папка",
      knowledgeHref: "",
      diagnosticHref: "",
      taskHref: `/records/${encodeURIComponent(recordId)}`
    });
  }

  for (const [documentId, wiki] of wikiByDocumentId.entries()) {
    const source = sourceByDocumentId.get(documentId);
    rows.push({
      id: documentId,
      title: stripExtension(wiki.title || source?.title || documentId),
      subtitle: source?.subtitle || wiki.subtitle || "",
      mdHref: wiki.route || "",
      sourceHref: source?.route || source?.href || "",
      sourceLabel: getSourceActionLabel(source),
      knowledgeHref: "",
      diagnosticHref: "",
      taskHref: `/records/${encodeURIComponent(recordId)}`
    });
  }

  for (const block of blocks.filter((item) => item.type === "wiki" && String(item.documentId || "").startsWith("artifact-"))) {
    rows.push({
      id: block.id,
      title: block.title || "База знаний",
      subtitle: block.subtitle || "",
      mdHref: "",
      sourceHref: "",
      sourceLabel: "",
      knowledgeHref: block.route || block.href || "",
      diagnosticHref: "",
      taskHref: `/records/${encodeURIComponent(recordId)}`
    });
  }

  for (const block of blocks.filter((item) => item.type === "diagnostic")) {
    rows.push({
      id: block.id,
      title: block.title || "Диагностика",
      subtitle: block.subtitle || "",
      mdHref: "",
      sourceHref: "",
      sourceLabel: "",
      knowledgeHref: "",
      diagnosticHref: block.route || block.href || "",
      taskHref: `/records/${encodeURIComponent(recordId)}`
    });
  }

  return rows;
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
  const fileName = String(block?.fileName || block?.title || block?.href || "").toLowerCase();

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
