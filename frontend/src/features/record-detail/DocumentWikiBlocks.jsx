import { Link } from "react-router-dom";
import {
  buildCompactDocumentRows,
  formatFallbackSummary,
  getDocumentBlockTypeLabel
} from "./documentWikiModel.js";

export function DocumentCompactList({ blocks, record, recordId }) {
  const rows = buildCompactDocumentRows(blocks, record, recordId);

  if (!rows.length) {
    return <div className="detail-doc-empty">Документы пока не привязаны.</div>;
  }

  return (
    <div className="detail-doc-compact">
      <div className="detail-doc-compact-head">
        <span className="detail-field-label">Документация</span>
        <Link to={`/records/${encodeURIComponent(recordId)}/documents`}>Все документы</Link>
      </div>

      <div className="detail-doc-row-list">
        {rows.map((row) => (
          <DocumentCompactRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

export function DocumentWikiBlocks({
  blocks,
  knowledgeBase,
  onAdd,
  onMove,
  onRemoveManual,
  onToggle,
  onUpdateManual,
  onUpdateTitle,
  recordId
}) {
  if (!blocks.length) {
    return (
      <div className="detail-wiki-blocks">
        <div className="detail-doc-empty">Документы пока не привязаны.</div>
        <button className="detail-wiki-add-button" onClick={onAdd} type="button">
          Добавить блок
        </button>
      </div>
    );
  }

  return (
    <div className="detail-wiki-blocks">
      <div className="detail-wiki-head">
        <div>
          <span className="detail-field-label">Wiki / база знаний</span>
          <small>{knowledgeBase?.publishPath || "Quartz-compatible слой"}</small>
        </div>
        <button className="detail-wiki-add-button" onClick={onAdd} type="button">
          Добавить блок
        </button>
      </div>

      {blocks.map((block, index) => (
        <DocumentWikiBlock
          block={block}
          index={index}
          isFirst={index === 0}
          isLast={index === blocks.length - 1}
          key={block.id}
          onMove={onMove}
          onRemoveManual={onRemoveManual}
          onToggle={onToggle}
          onUpdateManual={onUpdateManual}
          onUpdateTitle={onUpdateTitle}
          recordId={recordId}
        />
      ))}
    </div>
  );
}

export function DocumentArtifactGroups({ groups, recordId }) {
  const hasArtifacts = Object.values(groups).some((items) => items.length > 0);

  if (!hasArtifacts) {
    return <div className="detail-doc-empty">Документы пока не привязаны.</div>;
  }

  return (
    <div className="detail-artifact-groups">
      <DocumentArtifactGroup
        emptyLabel="Исходный архив не найден."
        items={groups.sourceArchives}
        title="Исходный архив"
      />
      <DocumentArtifactGroup
        emptyLabel="Нормализованных markdown-документов пока нет."
        items={groups.normalizedMarkdown}
        recordId={recordId}
        title="Нормализованные документы"
        type="markdown"
      />
      <DocumentArtifactGroup
        emptyLabel="Служебных JSON-артефактов пока нет."
        items={groups.jsonArtifacts}
        title="Служебные артефакты"
      />
      <DocumentArtifactGroup
        emptyLabel="База знаний пока не создана."
        items={groups.knowledgeArtifacts}
        title="База знаний"
      />
      <DocumentArtifactGroup
        emptyLabel="Файлов с fallback не найдено."
        items={groups.fallbackDocuments}
        title="Требуется fallback"
        type="fallback"
      />
      {groups.legacyUploaded.length ? (
        <DocumentArtifactGroup
          items={groups.legacyUploaded}
          title="Загруженные файлы"
        />
      ) : null}
    </div>
  );
}

function DocumentCompactRow({ row }) {
  return (
    <div className="detail-doc-row">
      <span className="detail-doc-row-title">{row.title}</span>
      <span className="detail-doc-row-actions">
        {row.mdHref ? (
          row.mdHref.startsWith("/records/") ? (
            <Link to={row.mdHref}>MD</Link>
          ) : (
            <a href={row.mdHref} rel="noreferrer" target="_blank">MD</a>
          )
        ) : null}
        {row.sourceHref ? (
          row.sourceHref.startsWith("/records/") ? (
            <Link to={row.sourceHref}>{row.sourceLabel || "Открыть"}</Link>
          ) : (
            <a href={row.sourceHref} rel="noreferrer" target="_blank">{row.sourceLabel || "DOCX"}</a>
          )
        ) : null}
        {!row.mdHref && !row.sourceHref && row.href ? (
          <a href={row.href} rel="noreferrer" target="_blank">Открыть</a>
        ) : null}
      </span>
    </div>
  );
}

function DocumentWikiBlock({
  block,
  isFirst,
  isLast,
  onMove,
  onRemoveManual,
  onToggle,
  onUpdateManual,
  onUpdateTitle,
  recordId
}) {
  const href = block.route || block.href || "";
  const isMarkdownRoute = href.startsWith("/records/");
  const isManual = block.source === "manual";

  return (
    <article className={`detail-wiki-block ${block.visible ? "" : "is-hidden"}`.trim()}>
      <div className="detail-wiki-block-top">
        <span className={`detail-wiki-type is-${block.type}`.trim()}>{getDocumentBlockTypeLabel(block.type)}</span>
        <div className="detail-wiki-actions">
          <button disabled={isFirst} onClick={() => onMove(block, -1)} type="button" aria-label="Поднять блок">
            ↑
          </button>
          <button disabled={isLast} onClick={() => onMove(block, 1)} type="button" aria-label="Опустить блок">
            ↓
          </button>
          <button onClick={() => onToggle(block)} type="button">
            {block.visible ? "Скрыть" : "Вернуть"}
          </button>
          {isManual ? (
            <button onClick={() => onRemoveManual(block.id)} type="button">
              Удалить
            </button>
          ) : null}
        </div>
      </div>

      <label className="detail-wiki-title-field">
        <span>Название</span>
        <input
          className="detail-control"
          onChange={(event) => onUpdateTitle(block, event.target.value)}
          value={block.title}
        />
      </label>

      {isManual ? (
        <div className="detail-wiki-manual-fields">
          <label className="detail-wiki-title-field">
            <span>Ссылка</span>
            <input
              className="detail-control"
              onChange={(event) => onUpdateManual(block.id, { href: event.target.value })}
              placeholder="https:// или /records/..."
              value={block.href || ""}
            />
          </label>
          <label className="detail-wiki-title-field">
            <span>MD / заметка</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdateManual(block.id, { body: event.target.value })}
              placeholder="Короткое описание или Markdown-блок"
              rows="3"
              value={block.body || ""}
            />
          </label>
        </div>
      ) : null}

      <div className="detail-wiki-preview">
        {block.visible ? (
          href ? (
            isMarkdownRoute ? (
              <Link className="detail-uploaded-doc detail-uploaded-doc-markdown" to={href}>
                <span>{block.title}</span>
                <small>{block.subtitle || "Открыть"}</small>
              </Link>
            ) : (
              <a className="detail-uploaded-doc" href={href} rel="noreferrer" target="_blank">
                <span>{block.title}</span>
                <small>{block.subtitle || "Открыть"}</small>
              </a>
            )
          ) : block.body ? (
            <div className="detail-wiki-note">{block.body}</div>
          ) : (
            <div className="detail-doc-empty">У блока пока нет ссылки или текста.</div>
          )
        ) : (
          <div className="detail-doc-empty">Блок скрыт, но может быть восстановлен.</div>
        )}
      </div>

      {block.source === "generated" && block.documentId && !isMarkdownRoute && block.type === "wiki" ? (
        <Link className="detail-wiki-inline-link" to={`/records/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(block.documentId)}`}>
          Открыть MD-страницу
        </Link>
      ) : null}
    </article>
  );
}

function DocumentArtifactGroup({ emptyLabel, items, recordId = "", title, type = "link" }) {
  return (
    <div className="detail-artifact-group">
      <span className="detail-field-label">{title}</span>
      {items.length ? (
        <div className="detail-uploaded-doc-list">
          {items.map((document, index) => (
            <DocumentArtifactItem
              document={document}
              index={index}
              key={`${document.documentId || document.href || document.path || document.fileName || title}-${index}`}
              recordId={recordId}
              type={type}
            />
          ))}
        </div>
      ) : (
        <div className="detail-doc-empty">{emptyLabel}</div>
      )}
    </div>
  );
}

function DocumentArtifactItem({ document, index, recordId, type }) {
  const label = document.label || document.fileName || document.sourceFileName || `Файл ${index + 1}`;

  if (type === "markdown" && document.documentId) {
    return (
      <Link className="detail-uploaded-doc detail-uploaded-doc-markdown" to={`/records/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(document.documentId)}`}>
        <span>{label}</span>
        <small>{document.sourceFileName || document.status || "Markdown"}</small>
      </Link>
    );
  }

  if (type === "fallback") {
    return (
      <div className="detail-uploaded-doc detail-uploaded-doc-fallback">
        <span>{label}</span>
        <small>{formatFallbackSummary(document)}</small>
      </div>
    );
  }

  return (
    <a className="detail-uploaded-doc" href={document.href || "#"} rel="noreferrer" target="_blank">
      <span>{label}</span>
      {document.artifactKey ? <small>{document.artifactKey}</small> : null}
    </a>
  );
}
