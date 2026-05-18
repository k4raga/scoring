import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAnalysisJob,
  createRecord,
  deleteRecord,
  fetchAiProviders,
  fetchRecord,
  fetchRecordAnalysisJobs,
  runDifyAnalysisJob,
  saveRecord
} from "../api.js";
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
const PURCHASE_BY_UNKNOWN = "Нет информации";
const PURCHASE_BY_OPTIONS = [
  PURCHASE_BY_UNKNOWN,
  "44-ФЗ",
  "223-ФЗ / Положение о закупке",
  "Коммерческая закупка",
  "Иное"
];
const LEGACY_INVALID_PURCHASE_BY = new Set(["", "Техническое задание", "Загрузка архива", "Демо-данные"]);
const SELECTION_CRITERIA_GROUP_OPTIONS = [
  { value: "price", label: "Ценовой критерий" },
  { value: "nonPrice", label: "Неценовой критерий" },
  { value: "requirement", label: "Дополнительное требование" }
];
const SELECTION_CRITERIA_COVERAGE_OPTIONS = [
  { value: "full", label: "Полностью закрываем" },
  { value: "partial", label: "Частично закрываем" },
  { value: "none", label: "Не закрываем" }
];

export default function DetailPage() {
  const { recordId = "" } = useParams();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const projectTitleInputRef = useRef(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [aiProviders, setAiProviders] = useState([]);
  const [analysisJobs, setAnalysisJobs] = useState([]);
  const [difyStatus, setDifyStatus] = useState("idle");
  const [difyMessage, setDifyMessage] = useState("");

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
    let active = true;

    async function loadAnalysisContext() {
      try {
        const [providersPayload, jobsPayload] = await Promise.all([
          fetchAiProviders(),
          fetchRecordAnalysisJobs(recordId)
        ]);

        if (!active) {
          return;
        }

        setAiProviders(Array.isArray(providersPayload?.providers) ? providersPayload.providers : []);
        setAnalysisJobs(Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []);
      } catch (_error) {
        if (!active) {
          return;
        }

        setAiProviders([]);
        setAnalysisJobs([]);
      }
    }

    if (recordId) {
      loadAnalysisContext();
    }

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
  const documentBlocks = useMemo(() => buildEditableDocumentBlocks(record, form.documentWiki), [form.documentWiki, record]);
  const difyProvider = useMemo(() => aiProviders.find((provider) => provider.id === "dify") || null, [aiProviders]);
  const difyJobs = useMemo(() => analysisJobs.filter((job) => job.providerId === "dify"), [analysisJobs]);
  const latestDifyJob = difyJobs[0] || null;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function updateSelectionCriteriaRow(rowId, key, value) {
    setForm((current) => ({
      ...current,
      selectionCriteriaRows: current.selectionCriteriaRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        const nextRow = { ...row, [key]: value };
        return key === "group" && value === "requirement" ? { ...nextRow, weightPercent: "" } : nextRow;
      })
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function addSelectionCriteriaRow() {
    setForm((current) => ({
      ...current,
      selectionCriteriaRows: [...current.selectionCriteriaRows, createSelectionCriteriaRow({ order: current.selectionCriteriaRows.length + 1 })]
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function removeSelectionCriteriaRow(rowId) {
    setForm((current) => ({
      ...current,
      selectionCriteriaRows: current.selectionCriteriaRows
        .filter((row) => row.rowId !== rowId)
        .map((row, index) => ({ ...row, order: index + 1 }))
    }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function updateDocumentWiki(nextWiki) {
    setForm((current) => ({ ...current, documentWiki: normalizeDocumentWikiConfig(nextWiki) }));
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function updateDocumentBlockTitle(block, title) {
    if (block.source === "manual") {
      updateDocumentWiki({
        ...form.documentWiki,
        manualBlocks: form.documentWiki.manualBlocks.map((item) => (item.id === block.id ? { ...item, title } : item))
      });
      return;
    }

    updateDocumentWiki({
      ...form.documentWiki,
      overrides: {
        ...form.documentWiki.overrides,
        [block.id]: {
          ...(form.documentWiki.overrides[block.id] || {}),
          title,
          visible: block.visible,
          order: block.order
        }
      }
    });
  }

  function updateManualDocumentBlock(blockId, patch) {
    updateDocumentWiki({
      ...form.documentWiki,
      manualBlocks: form.documentWiki.manualBlocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block))
    });
  }

  function addManualDocumentBlock() {
    const nextOrder = Math.max(1000, ...documentBlocks.blocks.map((block) => Number(block.order || 0))) + 1;
    updateDocumentWiki({
      ...form.documentWiki,
      manualBlocks: [
        ...form.documentWiki.manualBlocks,
        {
          id: createDocumentBlockId(),
          type: "manual",
          title: "Новый блок",
          href: "",
          body: "",
          visible: true,
          order: nextOrder
        }
      ]
    });
  }

  function removeManualDocumentBlock(blockId) {
    updateDocumentWiki({
      ...form.documentWiki,
      manualBlocks: form.documentWiki.manualBlocks.filter((block) => block.id !== blockId)
    });
  }

  function toggleDocumentBlock(block) {
    if (block.source === "manual") {
      updateManualDocumentBlock(block.id, { visible: !block.visible });
      return;
    }

    updateDocumentWiki({
      ...form.documentWiki,
      overrides: {
        ...form.documentWiki.overrides,
        [block.id]: {
          ...(form.documentWiki.overrides[block.id] || {}),
          title: block.title,
          visible: !block.visible,
          order: block.order
        }
      }
    });
  }

  function moveDocumentBlock(block, delta) {
    const currentIndex = documentBlocks.blocks.findIndex((item) => item.id === block.id);
    const swapBlock = documentBlocks.blocks[currentIndex + delta];

    if (!swapBlock) {
      return;
    }

    const updates = [
      { block, order: swapBlock.order },
      { block: swapBlock, order: block.order }
    ];
    let nextWiki = form.documentWiki;

    for (const update of updates) {
      if (update.block.source === "manual") {
        nextWiki = {
          ...nextWiki,
          manualBlocks: nextWiki.manualBlocks.map((item) => (item.id === update.block.id ? { ...item, order: update.order } : item))
        };
      } else {
        nextWiki = {
          ...nextWiki,
          overrides: {
            ...nextWiki.overrides,
            [update.block.id]: {
              ...(nextWiki.overrides[update.block.id] || {}),
              title: update.block.title,
              visible: update.block.visible,
              order: update.order
            }
          }
        };
      }
    }

    updateDocumentWiki(nextWiki);
  }

  function resetForm() {
    setForm(savedForm);
    setSaveStatus("idle");
    setSaveMessage("");
  }

  async function refreshAnalysisContext() {
    const [providersPayload, jobsPayload] = await Promise.all([
      fetchAiProviders(),
      fetchRecordAnalysisJobs(recordId)
    ]);

    setAiProviders(Array.isArray(providersPayload?.providers) ? providersPayload.providers : []);
    setAnalysisJobs(Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []);
  }

  async function handleDifyRun() {
    if (dirty) {
      setDifyStatus("error");
      setDifyMessage("Сначала сохраните изменения карточки.");
      return;
    }

    setDifyStatus("running");
    setDifyMessage("Запускаем Dify AI-pass.");

    try {
      const jobPayload = await createAnalysisJob({
        recordId,
        providerId: "dify",
        requestedBy: "detail_page",
        metadata: {
          source: "detail_page"
        }
      });
      const jobId = jobPayload?.job?.id;

      if (!jobId) {
        throw new Error("analysis_job_id_missing");
      }

      const runPayload = await runDifyAnalysisJob(jobId);
      const nextRecord = runPayload?.record || (await fetchRecord(recordId));
      const nextForm = buildFormState(nextRecord);

      setRecord(nextRecord);
      setForm(nextForm);
      setSavedForm(nextForm);
      setDifyStatus("success");
      setDifyMessage("Dify AI-pass завершен.");
      await refreshAnalysisContext();
    } catch (difyError) {
      setDifyStatus("error");
      setDifyMessage(difyError instanceof Error ? difyError.message : "Dify AI-pass не выполнен.");

      try {
        await refreshAnalysisContext();
      } catch (_refreshError) {
        // ignore refresh failure after the primary error
      }
    }
  }

  function openProjectModal() {
    setProjectModalTitle(form.projectTitle || record?.projectTitle || form.title || record?.title || "");
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
    const missingCoverage = form.selectionCriteriaRows.some((row) => isMeaningfulSelectionCriteriaRow(row) && !row.coverageStatus);

    if (missingCoverage) {
      setSaveStatus("error");
      setSaveMessage("У каждой строки критериев должен быть статус закрытия.");
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("");

    try {
      const response = await saveRecord(recordId, buildSavePayload(form));
      const nextRecord = response?.record || (await fetchRecord(recordId));
      const nextForm = buildFormState(nextRecord);

      setRecord(nextRecord);
      setForm(nextForm);
      setSavedForm(nextForm);
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
            defaultTitle={form.projectTitle || record?.projectTitle || form.title || record?.title || ""}
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
              <h1>{form.projectTitle || record?.projectTitle || form.title || record?.title || `Запись ${recordId}`}</h1>
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
                    value={normalizePurchaseByValue(form.purchaseBy)}
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
                      { value: "Нет", label: "Нет" },
                      { value: "Да", label: "Да" }
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

            <SelectionCriteriaSection
              onAdd={addSelectionCriteriaRow}
              onRemove={removeSelectionCriteriaRow}
              onUpdate={updateSelectionCriteriaRow}
              rows={form.selectionCriteriaRows}
            />
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

            <AnalysisStageCard analysis={record?.workflow?.analysis} />
            <DifyAnalysisCard
              disabled={status !== "success" || difyStatus === "running"}
              job={latestDifyJob}
              message={difyMessage}
              onRun={handleDifyRun}
              provider={difyProvider}
              status={difyStatus}
            />

            <section className="detail-side-card" id="section-documents">
              <h3>Документы и ссылки</h3>
              <DocumentCompactList blocks={documentBlocks.blocks} record={record} recordId={recordId} />
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
                {form.projectTitle || record?.projectTitle || form.title || record?.title || `Запись ${recordId}`}
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

function AnalysisStageCard({ analysis }) {
  const stages = Array.isArray(analysis?.stages) ? analysis.stages : [];
  const status = String(analysis?.status || "").trim();

  if (!status && !stages.length) {
    return null;
  }

  return (
    <section className="detail-side-card detail-analysis-card" id="section-analysis">
      <h3>Анализ документов</h3>
      {status ? <div className="detail-analysis-status">{getAnalysisStatusLabel(status)}</div> : null}
      {stages.length ? (
        <ol className="detail-analysis-steps">
          {stages.map((stage, index) => (
            <li className={`detail-analysis-step is-${stage.status || "pending"}`.trim()} key={`${stage.id || stage.name}-${index}`}>
              <span className="detail-analysis-step-mark">{index + 1}</span>
              <span>
                <strong>{getAnalysisStageLabel(stage.id || stage.name)}</strong>
                <small>{getAnalysisStageSummary(stage)}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function DifyAnalysisCard({ disabled, job, message, onRun, provider, status }) {
  const providerStatus = String(provider?.status || "not_configured").trim();
  const jobStatus = String(job?.status || "").trim();
  const warnings = getDifyJobWarnings(job);
  const error = getDifyJobError(job);
  const isRunning = status === "running" || jobStatus === "running";
  const isProviderConfigured = providerStatus === "configured";

  return (
    <section className="detail-side-card detail-analysis-card" id="section-dify-analysis">
      <h3>Dify AI-pass</h3>
      <div className="detail-analysis-status">{getProviderStatusLabel(providerStatus)}</div>
      {jobStatus ? (
        <div className="detail-analysis-job">
          <strong>{getAnalysisStatusLabel(jobStatus)}</strong>
          <small>{formatAnalysisJobUpdatedAt(job?.updatedAt || job?.createdAt)}</small>
        </div>
      ) : (
        <div className="detail-analysis-job">
          <strong>Запусков пока нет</strong>
          <small>AI-pass заполнит карточку и критерии по MD/json документации.</small>
        </div>
      )}
      {warnings.length ? (
        <ul className="detail-analysis-warnings">
          {warnings.slice(0, 4).map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {error ? <div className="detail-analysis-error">{error}</div> : null}
      {message ? <div className={`detail-analysis-message is-${status}`.trim()}>{message}</div> : null}
      <button
        className="section-link detail-dify-run-button"
        disabled={disabled || isRunning || !isProviderConfigured}
        onClick={onRun}
        type="button"
      >
        {isRunning ? "AI-pass выполняется..." : "Запустить AI-pass"}
      </button>
    </section>
  );
}

function SelectionCriteriaSection({ onAdd, onRemove, onUpdate, rows }) {
  const groupedRows = groupSelectionCriteriaRows(rows);

  return (
    <section className="detail-section detail-selection-criteria-section" id="section-selection-criteria">
      <div className="detail-section-head detail-criteria-head">
        <div>
          <h2>Критерии выбора</h2>
          <p>Критерии, по которым организатор тендера выбирает победителя. Одна строка — один критерий или требование.</p>
        </div>
        <button className="section-link detail-add-criteria-button" onClick={onAdd} type="button">
          Добавить строку
        </button>
      </div>

      {rows.length ? (
        <div className="detail-selection-criteria-groups">
          {groupedRows.map((group) => (
            <div className="detail-selection-criteria-group" key={group.value}>
              <div className="detail-selection-criteria-group-head">
                <strong>{group.label}</strong>
                <span>{group.rows.length}</span>
              </div>

              <div className="detail-selection-criteria-list">
                {group.rows.map((row) => (
                  <SelectionCriteriaRow
                    key={row.rowId}
                    onRemove={onRemove}
                    onUpdate={onUpdate}
                    row={row}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="detail-criteria-empty detail-selection-criteria-empty">
          Критерии выбора пока не заполнены. Добавьте строки вручную или дождитесь тестового extractor-pass.
        </div>
      )}
    </section>
  );
}

function SelectionCriteriaRow({ onRemove, onUpdate, row }) {
  const showWeight = row.group !== "requirement";

  return (
    <article className="detail-selection-criteria-row">
      <div className="detail-selection-criteria-row-top">
        <span className="detail-selection-criteria-order">#{row.order}</span>
        <button className="detail-remove-button" onClick={() => onRemove(row.rowId)} type="button">
          Удалить
        </button>
      </div>

      <div className="detail-selection-criteria-grid">
        <div className="detail-field-card detail-selection-criteria-controls">
          <div className="detail-selection-criteria-control">
            <span className="detail-field-label">Группа</span>
            <CustomSelect
              onChange={(value) => onUpdate(row.rowId, "group", value)}
              options={SELECTION_CRITERIA_GROUP_OPTIONS}
              value={row.group}
            />
          </div>

          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Вес, %</span>
            <input
              className="detail-control"
              disabled={!showWeight}
              max="100"
              min="0"
              onChange={(event) => onUpdate(row.rowId, "weightPercent", event.target.value)}
              placeholder={showWeight ? "40" : "Без веса"}
              type="number"
              value={showWeight ? row.weightPercent : ""}
            />
          </label>

          <div className="detail-selection-criteria-control">
            <span className="detail-field-label">Закрытие</span>
            <CustomSelect
              onChange={(value) => onUpdate(row.rowId, "coverageStatus", value)}
              options={SELECTION_CRITERIA_COVERAGE_OPTIONS}
              placeholder="Выберите статус"
              value={row.coverageStatus}
            />
          </div>
        </div>

        <div className="detail-field-card detail-selection-criteria-body">
          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Критерий / требование</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdate(row.rowId, "title", event.target.value)}
              placeholder="Например: минимальная цена, опыт команды или обязательная интеграция"
              rows="3"
              value={row.title}
            />
          </label>

          <label className="detail-selection-criteria-control">
            <span className="detail-field-label">Как закрываем</span>
            <textarea
              className="detail-control detail-control-textarea"
              onChange={(event) => onUpdate(row.rowId, "coverageNote", event.target.value)}
              placeholder="Что именно в нашем предложении закрывает критерий или почему не закрывает"
              rows="3"
              value={row.coverageNote}
            />
          </label>
        </div>
      </div>
    </article>
  );
}

function DocumentCompactList({ blocks, record, recordId }) {
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

function DocumentWikiBlocks({
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

function DocumentArtifactGroups({ groups, recordId }) {
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

function FieldCard({ children, fieldId, label, span = "" }) {
  return (
    <article className={`detail-field-card ${span === "full" ? "span-2" : span === "half" ? "span-half" : ""}`.trim()} id={`field-${fieldId}`}>
      <div className="detail-field-label">{label}</div>
      {children}
    </article>
  );
}

function getAnalysisStatusLabel(status) {
  const labels = {
    completed: "Завершен",
    failed: "Ошибка",
    pending: "Ожидает",
    queued: "В очереди",
    running: "В работе"
  };

  return labels[status] || status;
}

function getProviderStatusLabel(status) {
  const labels = {
    active: "Активен",
    configured: "Настроен",
    failed: "Ошибка настройки",
    not_configured: "Не настроен",
    planned: "Запланирован"
  };

  return labels[status] || status || "Не настроен";
}

function getDifyJobWarnings(job) {
  const resultWarnings = Array.isArray(job?.result?.warnings) ? job.result.warnings : [];
  const payloadWarnings = Array.isArray(job?.result?.payload?.warnings) ? job.result.payload.warnings : [];
  return [...new Set([...resultWarnings, ...payloadWarnings].map((warning) => String(warning || "").trim()).filter(Boolean))];
}

function getDifyJobError(job) {
  if (!job?.error) {
    return "";
  }

  if (typeof job.error === "string") {
    return job.error;
  }

  return String(job.error.message || job.error.code || "").trim();
}

function formatAnalysisJobUpdatedAt(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getAnalysisStageLabel(name) {
  const labels = {
    classify_documents: "Классификация документов",
    fill_amounts: "Информация по суммам",
    fill_general: "Общая информация",
    fill_tender: "Информация по тендеру",
    extract: "Извлечение текста",
    inventory: "Инвентарь файлов",
    normalize: "Нормализация в MD",
    normalize_md: "Нормализация в MD",
    unpack: "Распаковка"
  };

  return labels[name] || name;
}

function getAnalysisStageSummary(stage) {
  const payload = stage?.payload && typeof stage.payload === "object" ? stage.payload : {};

  if (payload.files !== undefined) {
    return `${payload.files} файл(ов)`;
  }

  if (payload.documents !== undefined) {
    return `${payload.documents} документ(ов)`;
  }

  const filledKeys = Object.keys(payload).filter((key) => payload[key] !== "" && payload[key] !== null && payload[key] !== undefined);

  if (filledKeys.length) {
    return `${filledKeys.length} поле(й)`;
  }

  return getAnalysisStatusLabel(stage?.status || "pending");
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
    projectTitle: "",
    title: "",
    shortTitle: "",
    sourceUrl: "",
    etpUrl: "",
    documentsFolderHref: "",
    googleDocumentsFolderHref: "",
    deadlineAt: "",
    nmc: "",
    purchaseBy: PURCHASE_BY_UNKNOWN,
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
    selectionCriteriaRows: [],
    documentWiki: createEmptyDocumentWiki()
  };
}

function buildFormState(record) {
  return {
    customer: String(record?.customer || ""),
    projectTitle: String(record?.projectTitle || record?.title || ""),
    title: String(record?.title || ""),
    shortTitle: String(record?.shortTitle || ""),
    sourceUrl: String(record?.sourceUrl || ""),
    etpUrl: String(record?.etpUrl || ""),
    documentsFolderHref: String(record?.documentsFolderHref || ""),
    googleDocumentsFolderHref: String(record?.googleDocumentsFolderHref || ""),
    deadlineAt: String(record?.deadlineAt || ""),
    nmc: String(record?.nmc || ""),
    purchaseBy: normalizePurchaseByValue(record?.purchaseBy),
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
    selectionCriteriaRows: (record?.selectionCriteriaRows || []).map((row, index) =>
      createSelectionCriteriaRow(row, index)
    ),
    documentWiki: normalizeDocumentWikiConfig(record?.documentWiki)
  };
}

function createSelectionCriteriaRow(row = {}, index = 0) {
  return {
    rowId: createRowId(),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index + 1,
    group: normalizeSelectionCriteriaGroupValue(row.group),
    title: String(row.title || ""),
    weightPercent: row.weightPercent === null || row.weightPercent === undefined ? "" : String(row.weightPercent),
    coverageStatus: Object.prototype.hasOwnProperty.call(row, "coverageStatus")
      ? normalizeSelectionCriteriaCoverageValue(row.coverageStatus)
      : "",
    coverageNote: String(row.coverageNote || ""),
    sourceExcerpt: String(row.sourceExcerpt || "")
  };
}

function createRowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeForm(form) {
  return JSON.stringify({
    ...form,
    selectionCriteriaRows: form.selectionCriteriaRows.map(({ group, title, weightPercent, coverageStatus, coverageNote, sourceExcerpt }, index) => ({
      order: index + 1,
      group,
      title,
      weightPercent,
      coverageStatus,
      coverageNote,
      sourceExcerpt
    })),
    documentWiki: normalizeDocumentWikiConfig(form.documentWiki)
  });
}

function buildSavePayload(form) {
  return {
    customer: form.customer,
    projectTitle: form.projectTitle,
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
    documentWiki: normalizeDocumentWikiConfig(form.documentWiki),
    selectionCriteriaRows: form.selectionCriteriaRows.map(({ group, title, weightPercent, coverageStatus, coverageNote, sourceExcerpt }, index) => ({
      order: index + 1,
      group,
      title,
      weightPercent: normalizeWeightPercentValue(weightPercent),
      coverageStatus,
      coverageNote,
      sourceExcerpt
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

function createEmptyDocumentWiki() {
  return {
    version: 1,
    overrides: {},
    manualBlocks: []
  };
}

function normalizeDocumentWikiConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const overrides = {};

  for (const [blockId, override] of Object.entries(source.overrides || {})) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      continue;
    }

    overrides[String(blockId)] = {
      title: String(override.title || ""),
      visible: override.visible === false ? false : true,
      order: Number.isFinite(Number(override.order)) ? Number(override.order) : null
    };
  }

  return {
    version: 1,
    overrides,
    manualBlocks: (Array.isArray(source.manualBlocks) ? source.manualBlocks : []).map((block, index) => ({
      id: String(block?.id || `manual-${index + 1}`),
      type: normalizeDocumentBlockType(block?.type || "manual"),
      title: String(block?.title || "Ручной блок"),
      href: String(block?.href || ""),
      body: String(block?.body || ""),
      visible: block?.visible === false ? false : true,
      order: Number.isFinite(Number(block?.order)) ? Number(block.order) : 1000 + index
    }))
  };
}

function buildEditableDocumentBlocks(record, documentWiki) {
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

function buildCompactDocumentRows(blocks, record, recordId) {
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

function createDocumentBlockId() {
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDocumentBlockType(value) {
  const normalized = String(value || "").trim();

  if (["source", "wiki", "manual", "fallback", "diagnostic"].includes(normalized)) {
    return normalized;
  }

  return "manual";
}

function getDocumentBlockTypeLabel(type) {
  const labels = {
    source: "Оригинал",
    wiki: "Wiki / MD",
    manual: "Ручной",
    fallback: "Fallback",
    diagnostic: "Диагностика"
  };

  return labels[type] || type || "Блок";
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

function formatFallbackSummary(document) {
  const fallback = document?.fallback && typeof document.fallback === "object" ? document.fallback : {};
  const reason = String(fallback.reason || document?.status || "manual_review_required").trim();
  const pipeline = String(fallback.suggestedPipeline || fallback.pipeline || "").trim();

  return [reason, pipeline].filter(Boolean).join(" · ");
}

function getPurchaseByOptions(currentValue) {
  const normalizedValue = normalizePurchaseByValue(currentValue);
  const options = [...PURCHASE_BY_OPTIONS];

  if (normalizedValue && !options.includes(normalizedValue)) {
    options.push(normalizedValue);
  }

  return options;
}

function normalizePurchaseByValue(value) {
  const normalized = String(value ?? "").trim();

  if (LEGACY_INVALID_PURCHASE_BY.has(normalized)) {
    return PURCHASE_BY_UNKNOWN;
  }

  if (/223\s*[-–]?\s*фз/i.test(normalized)) {
    return "223-ФЗ / Положение о закупке";
  }

  if (/44\s*[-–]?\s*фз/i.test(normalized)) {
    return "44-ФЗ";
  }

  return normalized || PURCHASE_BY_UNKNOWN;
}

function normalizeSelectionCriteriaGroupValue(value) {
  const normalized = String(value || "").trim();
  return SELECTION_CRITERIA_GROUP_OPTIONS.some((option) => option.value === normalized) ? normalized : "nonPrice";
}

function normalizeSelectionCriteriaCoverageValue(value) {
  const normalized = String(value || "").trim();
  return SELECTION_CRITERIA_COVERAGE_OPTIONS.some((option) => option.value === normalized) ? normalized : "";
}

function normalizeWeightPercentValue(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
}

function isMeaningfulSelectionCriteriaRow(row) {
  return Boolean(
    String(row?.title || "").trim() ||
    String(row?.coverageNote || "").trim() ||
    String(row?.sourceExcerpt || "").trim() ||
    String(row?.weightPercent || "").trim()
  );
}

function groupSelectionCriteriaRows(rows) {
  return SELECTION_CRITERIA_GROUP_OPTIONS.map((option) => ({
    ...option,
    rows: rows
      .filter((row) => row.group === option.value)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  })).filter((group) => group.rows.length);
}

function buildSearchTargets(record, form) {
  const wikiBlocks = buildEditableDocumentBlocks(record, form.documentWiki).blocks;
  const criteriaText = form.selectionCriteriaRows
    .map((row) => [row.title, row.coverageNote, row.sourceExcerpt, row.coverageStatus, row.weightPercent].join(" "))
    .join(" ");
  const targets = [
    { id: "section-general", label: "Общая информация", group: "Секция", value: [form.customer, form.title, form.shortTitle, form.nmc, form.purchaseBy].join(" ") },
    { id: "section-amounts", label: "Информация по суммам", group: "Секция", value: [form.platformPayment, form.applicationSecurity, form.contractSecurity].join(" ") },
    { id: "section-tender", label: "Информация по тендеру", group: "Секция", value: [form.overallExecutionTerm, form.contractTerm, form.retrade, form.antiDumpingMeasures, form.notes].join(" ") },
    { id: "section-selection-criteria", label: "Критерии выбора", group: "Секция", value: criteriaText },
    { id: "section-stage", label: "Этап проекта", group: "Правая колонка", value: form.stage },
    { id: "section-documents", label: "Документы и ссылки", group: "Правая колонка", value: `${buildDocItems(form).map((item) => item.value).join(" ")} ${wikiBlocks.map((block) => `${block.title} ${block.subtitle} ${block.href} ${block.body}`).join(" ")}` }
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

