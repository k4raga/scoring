import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRecordMarkdownDocument } from "../api.js";
import { LogoMark } from "../ui/icons.jsx";

export default function MarkdownDocumentPage() {
  const { recordId = "", documentId = "" } = useParams();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadMarkdown() {
      try {
        const nextPayload = await fetchRecordMarkdownDocument(recordId, documentId);

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
        setError(loadError instanceof Error ? loadError.message : "document_markdown_load_failed");
      }
    }

    loadMarkdown();

    return () => {
      active = false;
    };
  }, [documentId, recordId]);

  const renderedMarkdown = useMemo(() => renderMarkdown(payload?.markdown || ""), [payload?.markdown]);
  const document = payload?.document || {};
  const record = payload?.record || {};

  return (
    <div className="shell markdown-viewer-shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>
          <div className="brand-copy">
            <b>Scoring</b>
            <span>Просмотр нормализованного документа</span>
          </div>
        </Link>
      </header>

      {status === "loading" ? <div className="runtime-banner">Загружаем markdown-документ.</div> : null}
      {status === "error" ? <div className="runtime-banner runtime-banner-error">Не удалось открыть документ: {error}</div> : null}

      <main className="main markdown-viewer-main">
        <section className="markdown-viewer-head">
          <Link className="detail-back-link" to={`/records/${encodeURIComponent(recordId)}`}>
            <span aria-hidden="true" className="detail-back-link-icon">&larr;</span>
            <span>Назад к проекту</span>
          </Link>

          <div className="markdown-viewer-title">
            <h1>{document.sourceFileName || document.fileName || document.label || documentId}</h1>
            <p>{record.title || record.id || recordId}</p>
          </div>

          <dl className="markdown-viewer-meta">
            <div>
              <dt>Document ID</dt>
              <dd>{document.documentId || documentId}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{document.status || "нет информации"}</dd>
            </div>
            <div>
              <dt>Источник</dt>
              <dd>{document.sourcePath || document.sourceFileName || "нет информации"}</dd>
            </div>
            <div>
              <dt>Метод</dt>
              <dd>{document.extraction?.method || "нет информации"}</dd>
            </div>
          </dl>

          {document.sourceFileUrl ? (
            <a className="markdown-source-link" href={document.sourceFileUrl} rel="noreferrer" target="_blank">
              Открыть оригинал
            </a>
          ) : null}
        </section>

        <article className="markdown-document">
          {status === "success" ? renderedMarkdown : null}
        </article>
      </main>
    </div>
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/gu, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim() === "---") {
      const frontmatter = [];
      index += 1;

      while (index < lines.length && lines[index].trim() !== "---") {
        frontmatter.push(lines[index]);
        index += 1;
      }

      index += 1;
      blocks.push(
        <pre className="markdown-frontmatter" key={`frontmatter-${index}`}>
          {frontmatter.join("\n")}
        </pre>
      );
      continue;
    }

    if (/^```/u.test(line.trim())) {
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/u.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      index += 1;
      blocks.push(<pre key={`code-${index}`}>{codeLines.join("\n")}</pre>);
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines = [lines[index]];
      index += 2;

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }

      blocks.push(renderTable(tableLines, `table-${index}`));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/u);

    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}`;
      blocks.push(<Tag key={`heading-${index}`}>{heading[2]}</Tag>);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/u.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*[-*]\s+/u.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/u, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/u.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*\d+[.)]\s+/u.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/u, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ordered-list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
        </ol>
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;

    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/u.test(lines[index]) && !isTableStart(lines, index) && !/^\s*[-*]\s+/u.test(lines[index]) && !/^\s*\d+[.)]\s+/u.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    blocks.push(<p key={`paragraph-${index}`}>{paragraph.join(" ")}</p>);
  }

  return blocks.length ? blocks : <p>Markdown-документ пуст.</p>;
}

function isTableStart(lines, index) {
  return Boolean(
    lines[index]?.includes("|") &&
    lines[index + 1] &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(lines[index + 1])
  );
}

function renderTable(tableLines, key) {
  const [headLine, ...bodyLines] = tableLines;
  const headers = splitTableCells(headLine);
  const rows = bodyLines.map(splitTableCells);

  return (
    <div className="markdown-table-wrap" key={key}>
      <table>
        <thead>
          <tr>
            {headers.map((cell, index) => <th key={`${cell}-${index}`}>{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitTableCells(line) {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}
