import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRecord } from "../api.js";

export default function ProjectCreateButton({
  children = "Добавить проект",
  className = "header-link",
  defaultTitle = ""
}) {
  const navigate = useNavigate();
  const titleInputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [archiveFile, setArchiveFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setStatus("idle");
        setMessage("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function openModal() {
    setTitle(defaultTitle || "");
    setArchiveFile(null);
    setStatus("idle");
    setMessage("");
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
    setStatus("idle");
    setMessage("");
  }

  async function handleConfirm() {
    if (!title.trim() || !archiveFile) {
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await createRecord({
        title: title.trim(),
        archiveFile,
        sourceUrl: "",
        etpUrl: ""
      });
      const nextRecordId = response?.record?.id;

      if (!nextRecordId) {
        throw new Error("record_id_missing");
      }

      setIsOpen(false);
      setStatus("idle");
      setMessage("");
      navigate(`/records/${nextRecordId}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось создать проект.");
    }
  }

  return (
    <>
      <button className={className} onClick={openModal} type="button">
        {children}
      </button>

      {isOpen ? (
        <div className="detail-modal-overlay" onClick={closeModal} role="presentation">
          <section
            aria-labelledby="project-create-modal-title"
            aria-modal="true"
            className="detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="detail-modal-head">
              <div>
                <span className="eyebrow">Управление проектом</span>
                <h2 id="project-create-modal-title">Новый проект из архива</h2>
              </div>

              <button className="detail-modal-close" onClick={closeModal} type="button">
                Закрыть
              </button>
            </div>

            <div className="detail-modal-form">
              <label className="detail-field-card" htmlFor="project-create-title">
                <span className="detail-field-label">Название проекта</span>
                <input
                  className="detail-control"
                  id="project-create-title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Введите название проекта"
                  ref={titleInputRef}
                  type="text"
                  value={title}
                />
              </label>

              <label className="detail-field-card" htmlFor="project-create-archive">
                <span className="detail-field-label">Загрузка архива</span>
                <span className={`detail-upload-field ${archiveFile ? "has-file" : ""}`.trim()}>
                  <input
                    className="detail-upload-input"
                    id="project-create-archive"
                    onChange={(event) => setArchiveFile(event.target.files?.[0] || null)}
                    type="file"
                  />
                  <span className="detail-upload-copy">
                    {archiveFile ? archiveFile.name : "Выберите архив проекта"}
                  </span>
                </span>
              </label>
            </div>

            {message ? <div className="detail-modal-message">{message}</div> : null}

            <div className="detail-modal-actions">
              <button className="section-link detail-reset-button" onClick={closeModal} type="button">
                Отмена
              </button>
              <button
                className="header-link detail-save-button"
                disabled={!title.trim() || !archiveFile || status === "submitting"}
                onClick={handleConfirm}
                type="button"
              >
                {status === "submitting" ? "Загружаем..." : "Подтвердить"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
