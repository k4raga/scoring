import { useEffect, useMemo, useState } from "react";
import { fetchRecord, saveRecord } from "../../api.js";
import {
  buildFormState,
  buildSavePayload,
  createEmptyForm,
  isMeaningfulSelectionCriteriaRow,
  serializeForm
} from "./recordFormModel.js";

export function useRecordDetail(recordId) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [savedForm, setSavedForm] = useState(createEmptyForm());
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextRecord = await fetchRecord(recordId);

        if (!active) {
          return;
        }

        replaceRecord(nextRecord);
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

  function replaceRecord(nextRecord) {
    const nextForm = buildFormState(nextRecord);
    setRecord(nextRecord);
    setForm(nextForm);
    setSavedForm(nextForm);
  }

  function markDirtyIdle() {
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function resetForm() {
    setForm(savedForm);
    markDirtyIdle();
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

      replaceRecord(nextRecord);
      setSaveStatus("success");
      setSaveMessage("Изменения сохранены.");
    } catch (saveError) {
      setSaveStatus("error");
      setSaveMessage(saveError instanceof Error ? saveError.message : "Не удалось сохранить запись.");
    }
  }

  return {
    dirty,
    error,
    form,
    handleSave,
    markDirtyIdle,
    record,
    replaceRecord,
    resetForm,
    saveMessage,
    saveStatus,
    savedForm,
    setForm,
    setSaveMessage,
    setSaveStatus,
    showSaveBar,
    status
  };
}
