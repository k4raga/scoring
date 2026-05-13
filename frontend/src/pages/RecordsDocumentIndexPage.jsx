import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDocumentRecordsIndex } from "../api.js";
import { LogoMark } from "../ui/icons.jsx";

const MONTHS = [
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
];

export default function RecordsDocumentIndexPage() {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadIndex() {
      try {
        const nextPayload = await fetchDocumentRecordsIndex();

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
        setError(loadError instanceof Error ? loadError.message : "document_records_load_failed");
      }
    }

    loadIndex();

    return () => {
      active = false;
    };
  }, []);

  const months = useMemo(() => Array.isArray(payload?.months) ? payload.months : [], [payload]);

  return (
    <div className="shell markdown-viewer-shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>
          <div className="brand-copy">
            <b>Scoring</b>
            <span>Документный слой</span>
          </div>
        </Link>
      </header>

      {status === "loading" ? <div className="runtime-banner">Загружаем документный слой.</div> : null}
      {status === "error" ? <div className="runtime-banner runtime-banner-error">Не удалось загрузить документы: {error}</div> : null}

      <main className="main documents-page-main">
        <section className="markdown-viewer-head records-doc-index-head">
          <div className="markdown-viewer-title">
            <h1>Документы</h1>
            <p>Архивы и MD-документы по месяцам и проектам</p>
          </div>

          <div className="records-doc-index-stats">
            <span>{payload?.totals?.projects || 0} проектов</span>
            <span>{payload?.totals?.assets || 0} документов</span>
          </div>
        </section>

        <section className="records-doc-month-list">
          {months.length ? months.map((month) => (
            <RecordsDocMonth key={month.id} month={month} />
          )) : <div className="detail-doc-empty">Документы пока не найдены.</div>}
        </section>
      </main>
    </div>
  );
}

function RecordsDocMonth({ month }) {
  return (
    <section className="records-doc-month">
      <div className="records-doc-month-head">
        <h2>{formatMonth(month.month)} {month.year}</h2>
        <span>{month.projects.length} проектов</span>
      </div>

      <div className="records-doc-project-list">
        {month.projects.map((project) => (
          <RecordsDocProject key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}

function RecordsDocProject({ project }) {
  return (
    <article className="records-doc-project">
      <div className="records-doc-project-head">
        <div>
          <h3>{project.title || project.id}</h3>
          <p>{formatDate(project.publishedAt)}</p>
        </div>
        <div className="documents-page-actions">
          <Link to={project.documentsHref}>Документы</Link>
          <Link to={project.taskHref}>Задача</Link>
        </div>
      </div>

      <div className="records-doc-asset-list">
        {project.assets.map((asset) => (
          <RecordsDocAsset asset={asset} key={asset.id} />
        ))}
      </div>
    </article>
  );
}

function RecordsDocAsset({ asset }) {
  return (
    <div className="records-doc-asset">
      <div>
        <span className={`records-doc-asset-type ${asset.type}`.trim()}>{asset.type === "archive" ? "Архив" : "MD"}</span>
        <strong>{asset.title}</strong>
        {asset.subtitle ? <p>{asset.subtitle}</p> : null}
      </div>
      <div className="documents-page-actions">
        {asset.href?.startsWith("/records/") ? (
          <Link to={asset.href}>Открыть</Link>
        ) : (
          <a href={asset.href} rel="noreferrer" target="_blank">Открыть</a>
        )}
        <Link to={asset.taskHref}>Задача</Link>
      </div>
    </div>
  );
}

function formatMonth(month) {
  return MONTHS[Math.max(0, Number(month) - 1)] || "Месяц";
}

function formatDate(value) {
  if (!value) {
    return "без даты";
  }

  const parsed = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ru-RU");
}
