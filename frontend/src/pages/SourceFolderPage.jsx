import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRecordSourceFolder } from "../api.js";
import { LogoMark } from "../ui/icons.jsx";

export default function SourceFolderPage() {
  const { recordId = "" } = useParams();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadFolder() {
      try {
        const nextPayload = await fetchRecordSourceFolder(recordId);

        if (!active) {
          return;
        }

        setPayload(nextPayload);
        setStatus("success");
        setError("");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setPayload(null);
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "source_folder_load_failed");
      }
    }

    loadFolder();

    return () => {
      active = false;
    };
  }, [recordId]);

  const documents = useMemo(() => Array.isArray(payload?.documents) ? payload.documents : [], [payload]);

  return (
    <div className="shell markdown-viewer-shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>
          <div className="brand-copy">
            <b>Scoring</b>
            <span>Папка распаковки</span>
          </div>
        </Link>
      </header>

      {status === "loading" ? <div className="runtime-banner">Загружаем папку распаковки.</div> : null}
      {status === "error" ? <div className="runtime-banner runtime-banner-error">Не удалось загрузить папку: {error}</div> : null}

      <main className="main documents-page-main">
        <section className="markdown-viewer-head">
          <Link className="detail-back-link" to={`/records/${encodeURIComponent(recordId)}`}>
            <span aria-hidden="true" className="detail-back-link-icon">&larr;</span>
            <span>Назад к проекту</span>
          </Link>

          <div className="markdown-viewer-title">
            <h1>Папка распаковки</h1>
            <p>{payload?.record?.title || recordId}</p>
          </div>
        </section>

        <section className="documents-page-list">
          {documents.length ? documents.map((document) => (
            <article className="documents-page-row" key={document.documentId}>
              <div>
                <h2>{document.fileName || document.documentId}</h2>
                {document.sourcePath ? <p>{document.sourcePath}</p> : null}
              </div>
              <div className="documents-page-actions">
                <a href={document.href} rel="noreferrer" target="_blank">{getSourceActionLabel(document.fileName)}</a>
              </div>
            </article>
          )) : <div className="detail-doc-empty">В папке нет доступных документов.</div>}
        </section>
      </main>
    </div>
  );
}

function getSourceActionLabel(fileName) {
  const normalized = String(fileName || "").toLowerCase();

  if (normalized.endsWith(".pdf")) {
    return "PDF";
  }

  if (normalized.endsWith(".xlsx") || normalized.endsWith(".xls")) {
    return "XLSX";
  }

  if (normalized.endsWith(".doc") || normalized.endsWith(".docx")) {
    return "DOCX";
  }

  return "Файл";
}
