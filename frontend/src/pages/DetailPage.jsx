import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRecord, deleteRecord, fetchRecord, saveRecord } from "../api.js";
import { CalendarIcon, LogoMark, SearchIcon } from "../ui/icons.jsx";
import ProjectCreateButton from "../ui/ProjectCreateButton.jsx";
import {
  getCanonicalStageLabel,
  getCanonicalStageOptions
} from "../uiStage.js";

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

const HEADER_SUBTITLE = "Утром - деньги, вечером - стулья";
const SEARCH_PLACEHOLDER = "Поиск по полям и документам";
const STAGE_OPTIONS = getCanonicalStageOptions();
const STAGE_SELECT_OPTIONS = STAGE_OPTIONS.map((option) => ({ value: option.label, label: option.label }));
const PURCHASE_BY_OPTIONS = [
  "44-ФЗ, конкурс в электронной форме",
  "44-ФЗ, аукцион",
  "223-ФЗ, запрос предложений"
];

export default function DetailPage() {
  const { recordId = "" } = useParams();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const docInputRefs = useRef({});
  const projectTitleInputRef = useRef(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDocKey, setEditingDocKey] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectModalTitle, setProjectModalTitle] = useState("");
  const [projectModalArchive, setProjectModalArchive] = useState(null);
  const [projectModalStatus, setProjectModalStatus] = useState("idle");
  const [projectModalMessage, setProjectModalMessage] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("idle");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [savedForm, setSavedForm] = useState(createEmptyForm());
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isProjectModalOpen) {
      return undefined;
    }

    window.requestAnimationFrame(() => {
      projectTitleInputRef.current?.focus();
      projectTitleInputRef.current?.select();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsProjectModalOpen(false);
        setProjectModalStatus("idle");
        setProjectModalMessage("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isProjectModalOpen]);

  useEffect(() => {
    if (!isDeleteModalOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsDeleteModalOpen(false);
        setDeleteStatus("idle");
        setDeleteMessage("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDeleteModalOpen]);

  useEffect(() => {
    if (!editingDocKey) {
      return;
    }

    const inputNode = docInputRefs.current[editingDocKey];

    if (!inputNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputNode.focus();
      const cursorPosition = inputNode.value.length;
      inputNode.setSelectionRange(cursorPosition, cursorPosition);
    });
  }, [editingDocKey]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextRecord = await fetchRecord(recordId);

        if (!active) {
          return;
        }

        const nextForm = buildFormState(nextRecord);
        setRecord(nextRecord);
        setForm(nextForm);
        setSavedForm(nextForm);
        setStatus("success");
        setError("");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setRecord(null);
        setForm(createEmptyForm());
        setSavedForm(createEmptyForm());
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "unexpected_error");
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [recordId]);

  useEffect(() => {
    if (saveStatus !== "success" || !saveMessage) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setSaveStatus("idle");
      setSaveMessage("");
    }, 2500);

    return () => window.clearTimeout(timerId);
  }, [saveMessage, saveStatus]);

  const dirty = useMemo(() => serializeForm(form) !== serializeForm(savedForm), [form, savedForm]);
  const showSaveBar = dirty || saveStatus === "saving" || Boolean(saveMessage);
  const monthPath = record ? buildMonthPath(record.year, record.month) : "/";
  const monthLabel = record ? formatMonth(record.month) : "месяц";
  const searchTargets = useMemo(() => buildSearchTargets(record, form), [form, record]);
  const searchMatches = useMemo(() => filterSearchTargets(searchTargets, searchQuery), [searchQuery, searchTargets]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function updateCriteriaRow(rowId, key, value) {
    setForm((current) => ({
      ...current,
      criteriaRows: current.criteriaRows.map((row) => (row.rowId === rowId ? { ...row, [key]: value } : row))
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function addCriteriaRow() {
    setForm((current) => ({
      ...current,
      criteriaRows: [...current.criteriaRows, createCriteriaRow()]
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function removeCriteriaRow(rowId) {
    setForm((current) => ({
      ...current,
      criteriaRows: current.criteriaRows.filter((row) => row.rowId !== rowId)
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function resetForm() {
    setForm(savedForm);
    setEditingDocKey("");
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function openProjectModal() {
    setProjectModalTitle(form.title || record?.title || "");
    setProjectModalArchive(null);
    setProjectModalStatus("idle");
    setProjectModalMessage("");
    setIsProjectModalOpen(true);
  }

  function closeProjectModal() {
    setIsProjectModalOpen(false);
    setProjectModalStatus("idle");
    setProjectModalMessage("");
  }

  async function handleProjectConfirm() {
    if (!projectModalTitle.trim() || !projectModalArchive) {
      return;
    }

    setProjectModalStatus("submitting");
    setProjectModalMessage("");

    try {
      const response = await createRecord({
        title: projectModalTitle.trim(),
        archiveFile: projectModalArchive,
        sourceUrl: "",
        etpUrl: ""
      });

      const nextRecordId = response?.record?.id;

      if (!nextRecordId) {
        throw new Error("record_id_missing");
      }

      setIsProjectModalOpen(false);
      setProjectModalStatus("idle");
      setProjectModalMessage("");
      navigate(`/records/${nextRecordId}`);
    } catch (projectError) {
      setProjectModalStatus("error");
      setProjectModalMessage(projectError instanceof Error ? projectError.message : "Не удалось создать проект.");
    }
  }

  function openDeleteModal() {
    setDeleteStatus("idle");
    setDeleteMessage("");
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setIsDeleteModalOpen(false);
    setDeleteStatus("idle");
    setDeleteMessage("");
  }

  async function handleDeleteConfirm() {
    if (deleteStatus === "submitting" || status !== "success") {
      return;
    }

    setDeleteStatus("submitting");
    setDeleteMessage("");

    try {
      await deleteRecord(recordId);
      closeDeleteModal();
      navigate("/", { replace: true });
    } catch (deleteError) {
      setDeleteStatus("error");
      setDeleteMessage(deleteError instanceof Error ? deleteError.message : "Не удалось удалить проект.");
    }
  }

  async function handleSave() {
    setSaveStatus("saving");
    setSaveMessage("");

    try {
      const response = await saveRecord(recordId, buildSavePayload(form));
      const nextRecord = response?.record || (await fetchRecord(recordId));
      const nextForm = buildFormState(nextRecord);

      setRecord(nextRecord);
      setForm(nextForm);
      setSavedForm(nextForm);
      setEditingDocKey("");
      setSaveStatus("success");
      setSaveMessage("Изменения сохранены.");
    } catch (saveError) {
      setSaveStatus("error");
      setSaveMessage(saveError instanceof Error ? saveError.message : "Не удалось сохранить запись.");
    }
  }

  function handleSearchTargetClick(targetId) {
    const node = document.getElementById(targetId);

    if (!node) {
      return;
    }

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setIsSearchOpen(false);
  }

  return (
    <div className="shell">
      <header className="header">
        <Link className="brand" to="/">
          <span className="brand-box" aria-hidden="true">
            <LogoMark />
          </span>

          <div className="brand-copy">
            <b>Scoring</b>
            <span>{HEADER_SUBTITLE}</span>
          </div>
        </Link>

        <div className="header-side">
          <button
            aria-controls="detail-search-panel"
            aria-expanded={isSearchOpen}
            aria-label="Открыть поиск"
            className={`icon-button ${isSearchOpen ? "active" : ""}`.trim()}
            onClick={() => setIsSearchOpen((value) => !value)}
            type="button"
          >
            <SearchIcon />
          </button>

          <ProjectCreateButton
            className="header-link detail-header-link"
            defaultTitle={form.title || record?.title || ""}
          >
            Добавить проект
          </ProjectCreateButton>
        </div>
      </header>

      <section className={`search-panel detail-search-panel ${isSearchOpen ? "open" : ""}`.trim()} id="detail-search-panel">
        <label className="search-field" htmlFor="detail-search">
          <span className="search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="detail-search"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            ref={searchInputRef}
            type="search"
            value={searchQuery}
          />
        </label>

        {searchQuery.trim() ? (
          <div className="detail-search-results">
            {searchMatches.length ? (
              searchMatches.map((target) => (
                <button
                  className="detail-search-result"
                  key={target.id}
                  onClick={() => handleSearchTargetClick(target.id)}
                  type="button"
                >
                  <span>{target.label}</span>
                  <span>{target.group}</span>
                </button>
              ))
            ) : (
              <div className="detail-search-empty">Совпадения не найдены.</div>
            )}
          </div>
        ) : null}
      </section>

      {status === "loading" ? <RuntimeBanner>Загружаем карточку проекта.</RuntimeBanner> : null}
      {status === "error" ? <RuntimeBanner tone="error">Не удалось загрузить карточку проекта: {error}</RuntimeBanner> : null}

      <main className={`main detail-main-shell ${showSaveBar ? "has-save-bar" : ""}`.trim()}>
        <section className="detail-hero">
          <div className="detail-hero-top">
            <div className="detail-hero-rail">
              <Link className="detail-back-link" to={monthPath}>
                <span aria-hidden="true" className="detail-back-link-icon">&larr;</span>
                <span>Назад в {monthLabel}</span>
              </Link>

              <div className="detail-hero-created">
                <span className="detail-hero-created-label">Создано</span>
                <span className="detail-hero-date-value">{record ? formatLongDate(record.publishedAt) : "без даты"}</span>
              </div>
            </div>

            <div className="detail-title-block">
              <h1>{form.title || record?.title || `Запись ${recordId}`}</h1>
            </div>
          </div>
        </section>

        <section className="detail-layout">
          <div className="detail-main">
            <section className="detail-section" id="section-general">
              <div className="detail-section-head">
                <h2>Общая информация</h2>
              </div>

              <div className="detail-field-grid detail-overview-grid">
                <FieldCard fieldId="customer" label="Заказчик" span="full">
                  <input
                    className="detail-control"
                    onChange={(event) => updateField("customer", event.target.value)}
                    placeholder="Например: АО «Северный Альянс»"
                    type="text"
                    value={form.customer}
                  />
                </FieldCard>

                <FieldCard fieldId="title" label="Предмет закупки" span="full">
                  <textarea
                    className="detail-control detail-control-textarea"
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder="Опишите предмет закупки: что делаем, для кого и в каком контуре"
                    rows="2"
                    value={form.title}
                  />
                </FieldCard>

                <FieldCard fieldId="shortTitle" label="Предмет кратко" span="full">
                  <input
                    className="detail-control"
                    onChange={(event) => updateField("shortTitle", event.target.value)}
                    placeholder="Коротко сформулируйте предмет проекта"
                    type="text"
                    value={form.shortTitle}
                  />
                </FieldCard>

                <DetailDateField
                  fieldId="deadlineAt"
                  label="Срок подачи"
                  mode="datetime"
                  onChange={(value) => updateField("deadlineAt", value)}
                  placeholder="дд.мм.гггг чч:мм"
                  value={form.deadlineAt}
                />

                <MoneyField
                  fieldId="nmc"
                  label="НМЦ"
                  onChange={updateField}
                  value={form.nmc}
                />

                <FieldCard fieldId="purchaseBy" label="Закупка по">
                  <CustomSelect
                    onChange={(value) => updateField("purchaseBy", value)}
                    options={getPurchaseByOptions(form.purchaseBy).map((option) => ({ value: option, label: option }))}
                    value={getSelectValue(form.purchaseBy, PURCHASE_BY_OPTIONS)}
                  />
                </FieldCard>

                {form.creative === true ? (
                  <FieldCard fieldId="creativeLinkUrl" label="Ссылка на творческое" span="full">
                    <input
                      className="detail-control"
                      onChange={(event) => updateField("creativeLinkUrl", event.target.value)}
                      placeholder="https://example.com/creative"
                      type="url"
                      value={form.creativeLinkUrl}
                    />
                  </FieldCard>
                ) : null}
              </div>
            </section>

            <section className="detail-section" id="section-amounts">
              <div className="detail-section-head">
                <h2>Информация по суммам</h2>
              </div>

              <div className="detail-field-grid detail-money-grid">
                <MoneyField
                  fieldId="platformPayment"
                  label="Оплата площадки"
                  onChange={updateField}
                  value={form.platformPayment}
                />
                <MoneyField
                  fieldId="applicationSecurity"
                  label="Обеспечение заявки"
                  onChange={updateField}
                  value={form.applicationSecurity}
                />
                <MoneyField
                  fieldId="contractSecurity"
                  label="Обеспечение контракта"
                  onChange={updateField}
                  value={form.contractSecurity}
                />
              </div>
            </section>

            <section className="detail-section" id="section-tender">
              <div className="detail-section-head">
                <h2>Информация по тендеру</h2>
              </div>

              <div className="detail-field-grid detail-tender-grid">
                <FieldCard fieldId="overallExecutionTerm" label="Общий срок выполнения" span="half">
                  <input
                    className="detail-control"
                    onChange={(event) => updateField("overallExecutionTerm", event.target.value)}
                    placeholder="06.2026 - 08.2026"
                    type="text"
                    value={form.overallExecutionTerm}
                  />
                </FieldCard>

                <FieldCard fieldId="contractTerm" label="Срок договора" span="half">
                  <DetailDateField
                    fieldId="contractTerm"
                    label="Срок договора"
                    mode="date"
                    onChange={(value) => updateField("contractTerm", value)}
                    placeholder="дд.мм.гггг"
                    span="half"
                    value={form.contractTerm}
                  />
                </FieldCard>

                <FieldCard fieldId="notes" label="Примечания" span="full">
                  <textarea
                    className="detail-control detail-control-textarea"
                    onChange={(event) => updateField("notes", event.target.value)}
                    placeholder="Comment"
                    rows="4"
                    value={form.notes}
                  />
                </FieldCard>

                <FieldCard fieldId="retrade" label="Переторжка">
                  <div className="detail-toggle-group">
                    {[
                      { value: "Нет", label: "Нет" },
                      { value: "Да", label: "Да" }
                    ].map((item) => (
                      <label key={item.value}>
                        <input
                          checked={isYesNoValueSelected(form.retrade, item.value, "Нет")}
                          name="retradeMode"
                          onChange={() => updateField("retrade", item.value)}
                          type="radio"
                          value={item.value}
                        />
                        <span className="detail-toggle-option">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </FieldCard>

                <FieldCard fieldId="antiDumpingMeasures" label="Антидемпинг">
                  <div className="detail-toggle-group">
                    {[
                      { value: "Да", label: "Да" },
                      { value: "Нет", label: "Нет" }
                    ].map((item) => (
                      <label key={item.value}>
                        <input
                          checked={isYesNoValueSelected(form.antiDumpingMeasures, item.value, "Нет")}
                          name="antiDumpingMode"
                          onChange={() => updateField("antiDumpingMeasures", item.value)}
                          type="radio"
                          value={item.value}
                        />
                        <span className="detail-toggle-option">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </FieldCard>

                <FieldCard fieldId="creative" label="Творческое">
                  <div className="detail-toggle-group">
                    {[
                      { value: "unset", label: "Не указано" },
                      { value: "false", label: "Нет" },
                      { value: "true", label: "Да" }
                    ].map((item) => (
                      <label key={item.value}>
                        <input
                          checked={mapCreativeToToggle(form.creative) === item.value}
                          name="creativeMode"
                          onChange={() => updateField("creative", mapToggleToCreative(item.value))}
                          type="radio"
                          value={item.value}
                        />
                        <span className="detail-toggle-option">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </FieldCard>

                {form.creative === true ? (
                  <FieldCard fieldId="creativeLinkUrlTender" label="Ссылка на творческое" span="full">
                    <input
                      className="detail-control"
                      onChange={(event) => updateField("creativeLinkUrl", event.target.value)}
                      placeholder="https://example.com/creative"
                      type="url"
                      value={form.creativeLinkUrl}
                    />
                  </FieldCard>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="detail-side" id="project-docs">
            <section className="detail-side-card detail-stage-card" id="section-stage">
              <div className="detail-field-label">Этап проекта</div>
              <CustomSelect
                onChange={(value) => updateField("stage", value)}
                options={STAGE_SELECT_OPTIONS}
                value={form.stage}
              />
            </section>

            <section className="detail-side-card" id="section-documents">
              <h3>Документы и ссылки</h3>
              <div className="detail-doc-list">
                {buildDocItems(form).map((item) => {
                  const isEditing = editingDocKey === item.key;
                  const isEmpty = !String(item.value || "").trim();

                  return (
                    <div className={`detail-doc-field ${isEditing ? "editing" : ""} ${isEmpty ? "is-empty" : ""}`.trim()} id={`doc-${item.key}`} key={item.key}>
                      <div className="detail-doc-chip-row">
                        <button
                          className={`detail-doc-chip-button ${isEmpty ? "is-empty" : ""}`.trim()}
                          onClick={() => setEditingDocKey(isEditing ? "" : item.key)}
                          type="button"
                        >
                          <span className="detail-doc-chip-text">{item.label}</span>
                          <span aria-hidden="true" className="detail-doc-chip-icon">✎</span>
                        </button>
                        <a
                          className={`detail-doc-prefix ${isEmpty ? "is-empty" : ""}`.trim()}
                          href={item.value || "#"}
                          rel="noreferrer"
                          target="_blank"
                        >
                          ↗
                        </a>
                      </div>

                      <div className="detail-doc-edit-row">
                        <input
                          className="detail-control detail-control-link"
                          onChange={(event) => updateField(item.key, event.target.value)}
                          placeholder={item.placeholder}
                          ref={(node) => {
                            if (node) {
                              docInputRefs.current[item.key] = node;
                            } else {
                              delete docInputRefs.current[item.key];
                            }
                          }}
                          type="url"
                          value={item.value}
                        />
                        <a
                          className="detail-doc-prefix"
                          href={item.value || "#"}
                          rel="noreferrer"
                          target="_blank"
                        >
                          ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              {record?.documents?.length ? (
                <div className="detail-uploaded-docs">
                  <span className="detail-field-label">Загруженные файлы</span>
                  <div className="detail-uploaded-doc-list">
                    {record.documents.map((document, index) => (
                      <a className="detail-uploaded-doc" href={document.href || "#"} key={`${document.href}-${index}`} rel="noreferrer" target="_blank">
                        {document.label || document.fileName || `Файл ${index + 1}`}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="detail-side-card" id="section-delete-project">
              <h3>Удаление проекта</h3>
              <div className="detail-field-label">Удаляется весь проект: карточка и связанные файлы.</div>
              <button
                className="section-link detail-reset-button"
                disabled={status !== "success" || deleteStatus === "submitting"}
                onClick={openDeleteModal}
                type="button"
              >
                Удалить проект
              </button>
            </section>
          </aside>
        </section>

        {showSaveBar ? (
          <section className="detail-save-bar" aria-live="polite">
            <div className="detail-save-bar-copy">
              <strong>
                {saveMessage
                  ? saveMessage
                  : dirty
                    ? "Есть несохраненные изменения."
                    : "Сохраняем изменения..."}
              </strong>
              <span>Правый блок действий убран; сохранение вынесено в нижнюю панель, чтобы не ломать канонический layout.</span>
            </div>

            <div className="detail-save-bar-actions">
              <button
                className="section-link detail-reset-button"
                disabled={!dirty || saveStatus === "saving"}
                onClick={resetForm}
                type="button"
              >
                Сбросить изменения
              </button>

              <button
                className="header-link detail-save-button"
                disabled={!dirty || saveStatus === "saving" || status !== "success"}
                onClick={handleSave}
                type="button"
              >
                {saveStatus === "saving" ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="footer detail-footer">
        <span>{form.shortTitle || "Карточка проекта"}</span>
        <span className="footer-copy">Scoring</span>
      </footer>

      {isProjectModalOpen ? (
        <div className="detail-modal-overlay" onClick={closeProjectModal} role="presentation">
          <section
            aria-labelledby="detail-project-modal-title"
            aria-modal="true"
            className="detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="detail-modal-head">
              <div>
                <div className="detail-field-label">Управление проектом</div>
                <h2 id="detail-project-modal-title">Новый проект из архива</h2>
              </div>

              <button className="detail-modal-close" onClick={closeProjectModal} type="button">
                Закрыть
              </button>
            </div>

            <div className="detail-modal-form">
              <FieldCard fieldId="projectManageTitle" label="Название проекта" span="full">
                <input
                  className="detail-control"
                  onChange={(event) => setProjectModalTitle(event.target.value)}
                  placeholder="Введите название проекта"
                  ref={projectTitleInputRef}
                  type="text"
                  value={projectModalTitle}
                />
              </FieldCard>

              <FieldCard fieldId="projectManageArchive" label="Загрузка архива" span="full">
                <label className={`detail-upload-field ${projectModalArchive ? "has-file" : ""}`.trim()}>
                  <input
                    className="detail-upload-input"
                    onChange={(event) => setProjectModalArchive(event.target.files?.[0] || null)}
                    type="file"
                  />
                  <span className="detail-upload-copy">
                    {projectModalArchive ? projectModalArchive.name : "Выберите архив проекта"}
                  </span>
                </label>
              </FieldCard>
            </div>

            {projectModalMessage ? <div className="detail-modal-message">{projectModalMessage}</div> : null}

            <div className="detail-modal-actions">
              <button className="section-link detail-reset-button" onClick={closeProjectModal} type="button">
                Отмена
              </button>
              <button
                className="header-link detail-save-button"
                disabled={!projectModalTitle.trim() || !projectModalArchive || projectModalStatus === "submitting"}
                onClick={handleProjectConfirm}
                type="button"
              >
                {projectModalStatus === "submitting" ? "Загружаем..." : "Подтвердить"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isDeleteModalOpen ? (
        <div className="detail-modal-overlay" onClick={closeDeleteModal} role="presentation">
          <section
            aria-labelledby="detail-delete-modal-title"
            aria-modal="true"
            className="detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="detail-modal-head">
              <div>
                <div className="detail-field-label">Подтверждение удаления</div>
                <h2 id="detail-delete-modal-title">Удалить весь проект?</h2>
              </div>

              <button className="detail-modal-close" onClick={closeDeleteModal} type="button">
                Закрыть
              </button>
            </div>

            <div className="detail-modal-form">
              <p>
                Будет удален весь проект: карточка, загруженные документы и рабочая папка проекта.
              </p>
              <p>
                {form.title || record?.title || `Запись ${recordId}`}
              </p>
            </div>

            {deleteMessage ? <div className="detail-modal-message">{deleteMessage}</div> : null}

            <div className="detail-modal-actions">
              <button
                className="section-link detail-reset-button"
                disabled={deleteStatus === "submitting"}
                onClick={closeDeleteModal}
                type="button"
              >
                Отмена
              </button>
              <button
                className="header-link detail-save-button"
                disabled={deleteStatus === "submitting" || status !== "success"}
                onClick={handleDeleteConfirm}
                type="button"
              >
                {deleteStatus === "submitting" ? "Удаляем..." : "Удалить проект"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeBanner({ children, tone = "neutral" }) {
  return <div className={`runtime-banner ${tone === "error" ? "runtime-banner-error" : ""}`.trim()}>{children}</div>;
}

function FieldCard({ children, fieldId, label, span = "" }) {
  return (
    <article className={`detail-field-card ${span === "full" ? "span-2" : span === "half" ? "span-half" : ""}`.trim()} id={`field-${fieldId}`}>
      <div className="detail-field-label">{label}</div>
      {children}
    </article>
  );
}

function MoneyField({ fieldId, label, onChange, placeholder = "920000", value }) {
  return (
    <FieldCard fieldId={fieldId} label={label}>
      <div className="detail-number-field">
        <input
          className="detail-control"
          onChange={(event) => onChange(fieldId, event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
        <span className="detail-number-suffix">₽</span>
      </div>
    </FieldCard>
  );
}

function CustomSelect({ onChange, options, placeholder = "", value }) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = useMemo(() => {
    return (options || []).map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  }, [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`detail-select ${isOpen ? "open" : ""}`.trim()} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        className="detail-select-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className={`detail-select-value ${selectedOption ? "" : "is-placeholder"}`.trim()}>
          {selectedOption?.label || placeholder}
        </span>
        <span aria-hidden="true" className="detail-select-caret"></span>
      </button>

      {isOpen ? (
        <div className="detail-select-menu" role="listbox">
          {normalizedOptions.map((option) => (
            <button
              className={`detail-select-option ${option.value === value ? "is-active" : ""}`.trim()}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailDateField({ fieldId, label, mode = "date", onChange, placeholder = "", span = "", value }) {
  const fieldRef = useRef(null);
  const popoverRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => parsePickerStoredValue(value, mode));
  const [viewYear, setViewYear] = useState(() => parsePickerStoredValue(value, mode).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsePickerStoredValue(value, mode).getMonth());
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const nextDate = parsePickerStoredValue(value, mode);
    setPickerDate(nextDate);
    setViewYear(nextDate.getFullYear());
    setViewMonth(nextDate.getMonth());
  }, [mode, value]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function updatePosition() {
      const anchor = fieldRef.current;

      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const popoverWidth = 320;
      const estimatedHeight = mode === "datetime" ? 420 : 370;
      const margin = 16;
      let nextLeft = rect.left;
      let nextTop = rect.bottom + 10;

      if (nextLeft + popoverWidth > window.innerWidth - margin) {
        nextLeft = window.innerWidth - popoverWidth - margin;
      }

      if (nextLeft < margin) {
        nextLeft = margin;
      }

      if (nextTop + estimatedHeight > window.innerHeight - margin) {
        nextTop = rect.top - estimatedHeight - 10;
      }

      if (nextTop < margin) {
        nextTop = margin;
      }

      setPosition({ left: nextLeft, top: nextTop });
    }

    function handlePointerDown(event) {
      const target = event.target;

      if (fieldRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, mode]);

  const monthTitle = useMemo(() => {
    const label = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric"
    }).format(new Date(viewYear, viewMonth, 1));

    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [viewMonth, viewYear]);

  const dayCells = useMemo(() => {
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      let cellYear = viewYear;
      let cellMonth = viewMonth;
      let cellDay = index - firstDayIndex + 1;
      let isOutside = false;

      if (index < firstDayIndex) {
        cellMonth -= 1;

        if (cellMonth < 0) {
          cellMonth = 11;
          cellYear -= 1;
        }

        cellDay = daysInPrevMonth - firstDayIndex + index + 1;
        isOutside = true;
      } else if (cellDay > daysInMonth) {
        cellMonth += 1;

        if (cellMonth > 11) {
          cellMonth = 0;
          cellYear += 1;
        }

        cellDay -= daysInMonth;
        isOutside = true;
      }

      const isSelected =
        pickerDate.getFullYear() === cellYear &&
        pickerDate.getMonth() === cellMonth &&
        pickerDate.getDate() === cellDay;

      cells.push({
        key: `${cellYear}-${cellMonth}-${cellDay}-${index}`,
        year: cellYear,
        month: cellMonth,
        day: cellDay,
        isOutside,
        isSelected
      });
    }

    return cells;
  }, [pickerDate, viewMonth, viewYear]);

  function openPicker() {
    const nextDate = parsePickerStoredValue(value, mode);
    setPickerDate(nextDate);
    setViewYear(nextDate.getFullYear());
    setViewMonth(nextDate.getMonth());
    setIsOpen(true);
  }

  function changeMonth(delta) {
    setViewMonth((currentMonth) => {
      const nextDate = new Date(viewYear, currentMonth + delta, 1);
      setViewYear(nextDate.getFullYear());
      return nextDate.getMonth();
    });
  }

  function handleDaySelect(cell) {
    setPickerDate((current) => new Date(
      cell.year,
      cell.month,
      cell.day,
      current.getHours(),
      current.getMinutes(),
      0,
      0
    ));
    setViewYear(cell.year);
    setViewMonth(cell.month);
  }

  function handleTimeChange(nextValue) {
    const [hours, minutes] = nextValue.split(":").map(Number);
    setPickerDate((current) => new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      Number.isFinite(hours) ? hours : 0,
      Number.isFinite(minutes) ? minutes : 0,
      0,
      0
    ));
  }

  function applyPicker() {
    onChange(formatPickerStorageValue(pickerDate, mode));
    setIsOpen(false);
  }

  function selectToday() {
    const now = new Date();
    const nextDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      mode === "datetime" ? now.getHours() : pickerDate.getHours(),
      mode === "datetime" ? now.getMinutes() : pickerDate.getMinutes(),
      0,
      0
    );

    setPickerDate(nextDate);
    setViewYear(nextDate.getFullYear());
    setViewMonth(nextDate.getMonth());
  }

  return (
    <FieldCard fieldId={fieldId} label={label} span={span}>
      <div className="detail-picker-field" ref={fieldRef}>
        <input
          className="detail-control-date"
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
              event.preventDefault();
              openPicker();
            }
          }}
          placeholder={placeholder}
          readOnly
          type="text"
          value={formatPickerDisplayValue(value, mode)}
        />
        <span aria-hidden="true" className="detail-picker-icon">
          <CalendarIcon />
        </span>
      </div>

      {isOpen ? (
        <div
          className="detail-picker-popover"
          ref={popoverRef}
          style={{ left: `${position.left}px`, top: `${position.top}px` }}
        >
          <div className="detail-picker-head">
            <button aria-label="Предыдущий месяц" className="detail-picker-nav" onClick={() => changeMonth(-1)} type="button">
              ←
            </button>
            <div className="detail-picker-title">{monthTitle}</div>
            <button aria-label="Следующий месяц" className="detail-picker-nav" onClick={() => changeMonth(1)} type="button">
              →
            </button>
          </div>

          <div className="detail-picker-weekdays">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <span className="detail-picker-weekday" key={day}>
                {day}
              </span>
            ))}
          </div>

          <div className="detail-picker-grid">
            {dayCells.map((cell) => (
              <button
                className={`detail-picker-day ${cell.isOutside ? "is-outside" : ""} ${cell.isSelected ? "is-selected" : ""}`.trim()}
                key={cell.key}
                onClick={() => handleDaySelect(cell)}
                type="button"
              >
                {cell.day}
              </button>
            ))}
          </div>

          {mode === "datetime" ? (
            <div className="detail-picker-time">
              <div className="detail-picker-time-label">Время</div>
              <input
                className="detail-picker-time-input"
                onChange={(event) => handleTimeChange(event.target.value)}
                type="time"
                value={`${String(pickerDate.getHours()).padStart(2, "0")}:${String(pickerDate.getMinutes()).padStart(2, "0")}`}
              />
            </div>
          ) : null}

          <div className="detail-picker-actions">
            <button className="detail-picker-action" onClick={selectToday} type="button">
              Сегодня
            </button>
            <button className="detail-picker-action primary" onClick={applyPicker} type="button">
              Применить
            </button>
          </div>
        </div>
      ) : null}
    </FieldCard>
  );
}

function createEmptyForm() {
  return {
    customer: "",
    title: "",
    shortTitle: "",
    sourceUrl: "",
    etpUrl: "",
    documentsFolderHref: "",
    googleDocumentsFolderHref: "",
    deadlineAt: "",
    nmc: "",
    purchaseBy: "",
    platformPayment: "",
    applicationSecurity: "",
    contractSecurity: "",
    overallExecutionTerm: "",
    contractTerm: "",
    retrade: "Нет",
    antiDumpingMeasures: "Нет",
    creative: false,
    creativeLinkUrl: "",
    requirementsDocumentUrl: "",
    criteriaDocumentUrl: "",
    technicalSpecificationUrl: "",
    notes: "",
    stage: "",
    criteriaRows: []
  };
}

function buildFormState(record) {
  return {
    customer: String(record?.customer || ""),
    title: String(record?.title || ""),
    shortTitle: String(record?.shortTitle || ""),
    sourceUrl: String(record?.sourceUrl || ""),
    etpUrl: String(record?.etpUrl || ""),
    documentsFolderHref: String(record?.documentsFolderHref || ""),
    googleDocumentsFolderHref: String(record?.googleDocumentsFolderHref || ""),
    deadlineAt: String(record?.deadlineAt || ""),
    nmc: String(record?.nmc || ""),
    purchaseBy: String(record?.purchaseBy || ""),
    platformPayment: String(record?.platformPayment || ""),
    applicationSecurity: String(record?.applicationSecurity || ""),
    contractSecurity: String(record?.contractSecurity || ""),
    overallExecutionTerm: String(record?.overallExecutionTerm || ""),
    contractTerm: String(record?.contractTerm || ""),
    retrade: String(record?.retrade || "Нет"),
    antiDumpingMeasures: String(record?.antiDumpingMeasures || "Нет"),
    creative: normalizeCreativeValue(record?.creative) ?? false,
    creativeLinkUrl: String(record?.creativeLinkUrl || ""),
    requirementsDocumentUrl: String(record?.requirementsDocumentUrl || ""),
    criteriaDocumentUrl: String(record?.criteriaDocumentUrl || ""),
    technicalSpecificationUrl: String(record?.technicalSpecificationUrl || ""),
    notes: String(record?.notes || ""),
    stage: getCanonicalStageLabel(record?.stage, record?.status),
    criteriaRows: (record?.editableSections?.find((section) => section.id === "criteria")?.rows || record?.criteriaRows || []).map((row) =>
      createCriteriaRow(row)
    )
  };
}

function createCriteriaRow(row = {}) {
  return {
    rowId: createRowId(),
    group: String(row.group || "nonPrice"),
    title: String(row.title || ""),
    description: String(row.description || ""),
    kind: String(row.kind || "критерий"),
    note: String(row.note || "")
  };
}

function createRowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeForm(form) {
  return JSON.stringify({
    ...form,
    criteriaRows: form.criteriaRows.map(({ group, title, description, kind, note }) => ({
      group,
      title,
      description,
      kind,
      note
    }))
  });
}

function buildSavePayload(form) {
  return {
    customer: form.customer,
    title: form.title,
    shortTitle: form.shortTitle,
    sourceUrl: form.sourceUrl,
    etpUrl: form.etpUrl,
    documentsFolderHref: form.documentsFolderHref,
    googleDocumentsFolderHref: form.googleDocumentsFolderHref,
    deadlineAt: fromDateTimeLocalValue(form.deadlineAt),
    nmc: form.nmc,
    purchaseBy: form.purchaseBy,
    platformPayment: form.platformPayment,
    applicationSecurity: form.applicationSecurity,
    contractSecurity: form.contractSecurity,
    overallExecutionTerm: form.overallExecutionTerm,
    contractTerm: form.contractTerm,
    retrade: form.retrade,
    antiDumpingMeasures: form.antiDumpingMeasures,
    creative: form.creative,
    creativeLinkUrl: form.creativeLinkUrl,
    requirementsDocumentUrl: form.requirementsDocumentUrl,
    criteriaDocumentUrl: form.criteriaDocumentUrl,
    technicalSpecificationUrl: form.technicalSpecificationUrl,
    notes: form.notes,
    stage: form.stage,
    criteriaRows: form.criteriaRows.map(({ group, title, description, kind, note }) => ({
      group,
      title,
      description,
      kind,
      note
    }))
  };
}

function buildDocItems(form) {
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

function getPurchaseByOptions(currentValue) {
  const options = [...PURCHASE_BY_OPTIONS];

  if (currentValue && !options.includes(currentValue)) {
    options.unshift(currentValue);
  }

  if (!options.length) {
    return [currentValue || ""];
  }

  return options;
}

function getSelectValue(currentValue, options) {
  if (currentValue && options.includes(currentValue)) {
    return currentValue;
  }

  return options[0] || "";
}

function buildSearchTargets(record, form) {
  const targets = [
    { id: "section-general", label: "Общая информация", group: "Секция", value: [form.customer, form.title, form.shortTitle, form.nmc, form.purchaseBy].join(" ") },
    { id: "section-amounts", label: "Информация по суммам", group: "Секция", value: [form.platformPayment, form.applicationSecurity, form.contractSecurity].join(" ") },
    { id: "section-tender", label: "Информация по тендеру", group: "Секция", value: [form.overallExecutionTerm, form.contractTerm, form.retrade, form.antiDumpingMeasures, form.notes].join(" ") },
    { id: "section-stage", label: "Этап проекта", group: "Правая колонка", value: form.stage },
    { id: "section-documents", label: "Документы и ссылки", group: "Правая колонка", value: buildDocItems(form).map((item) => item.value).join(" ") }
  ];

  for (const item of buildDocItems(form)) {
    targets.push({
      id: `doc-${item.key}`,
      label: item.label,
      group: "Документ",
      value: item.value
    });
  }

  return targets;
}

function filterSearchTargets(targets, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return targets
    .filter((target) => `${target.label} ${target.group} ${target.value}`.toLowerCase().includes(normalizedQuery))
    .slice(0, 8);
}

function normalizeCreativeValue(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["да", "true", "yes", "1"].includes(normalized)) {
    return true;
  }

  if (["нет", "false", "no", "0"].includes(normalized)) {
    return false;
  }

  return null;
}

function mapCreativeToToggle(value) {
  if (value === true) {
    return "true";
  }

  return "false";
}

function mapToggleToCreative(value) {
  return value === "true";
}

function fromDateTimeLocalValue(value) {
  return value ? value.replace("T", " ") : "";
}

function buildMonthPath(year, month) {
  return `/years/${year}/months/${month}`;
}

function formatMonth(month) {
  return MONTHS[Math.max(0, Number(month) - 1)] || "Месяц";
}

function formatLongDate(value) {
  if (!value) {
    return "без даты";
  }

  const parsed = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ru-RU");
}

function hasMeaningfulValue(value) {
  return String(value || "").trim().length > 0;
}

function isYesNoValueSelected(currentValue, expectedValue, fallbackValue = "") {
  const normalized = String(currentValue || fallbackValue || "").trim().toLowerCase();
  const expected = String(expectedValue || "").trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (expected === "да") {
    return ["да", "true", "yes", "1"].includes(normalized);
  }

  if (expected === "нет") {
    return ["нет", "false", "no", "0"].includes(normalized);
  }

  return normalized === expected;
}

function parsePickerStoredValue(value, mode) {
  if (!value) {
    return new Date();
  }

  const normalized = String(value).trim();
  const isoLikeValue = normalized.includes("T")
    ? normalized
    : normalized.includes(" ")
      ? normalized.replace(" ", "T")
      : normalized;
  const directDate = new Date(isoLikeValue);

  if (!Number.isNaN(directDate.getTime())) {
    return directDate;
  }

  const displayMatch = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);

  if (displayMatch) {
    const [, day, month, year, hours = "00", minutes = "00"] = displayMatch;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      mode === "datetime" ? Number(hours) : 0,
      mode === "datetime" ? Number(minutes) : 0,
      0,
      0
    );
  }

  return new Date();
}

function formatPickerStorageValue(date, mode) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (mode === "datetime") {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  return `${year}-${month}-${day}`;
}

function formatPickerDisplayValue(value, mode) {
  if (!value) {
    return "";
  }

  const parsed = parsePickerStoredValue(value, mode);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();

  if (mode === "datetime") {
    const hours = String(parsed.getHours()).padStart(2, "0");
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }

  return `${day}.${month}.${year}`;
}

