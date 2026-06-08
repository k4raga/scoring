import assert from "node:assert/strict";
import { applyRecordPatch } from "../backend/src/record-patch.js";
import {
  buildFormState,
  buildSavePayload,
  createPreassessmentRiskRow,
  createSelectionCriteriaRow,
  getPurchaseBySelectOptions,
  getRecordEditorOptions,
  normalizeDocumentWikiConfig,
  serializeForm
} from "../frontend/src/features/record-detail/recordFormModel.js";

const editorSchema = {
  sections: [
    {
      id: "tender",
      fields: [
        {
          key: "purchaseBy",
          type: "select",
          options: [
            { value: "44-ФЗ", label: "44-ФЗ" },
            { value: "Коммерческая закупка", label: "Коммерческая закупка" }
          ]
        }
      ]
    }
  ],
  selectionCriteriaRowSchema: [
    {
      key: "group",
      type: "select",
      options: [
        { value: "price", label: "Цена" },
        { value: "requirement", label: "Требование" }
      ]
    },
    {
      key: "coverageStatus",
      type: "select",
      options: [
        { value: "full", label: "Закрываем" },
        { value: "none", label: "Не закрываем" }
      ]
    },
    {
      key: "blockFactor",
      type: "select",
      options: [
        { value: "blockFactor", label: "Блок-фактор" },
        { value: "no", label: "Нет" }
      ]
    }
  ],
  preassessmentRiskRowSchema: [
    {
      key: "criticality",
      type: "select",
      options: [
        { value: "critical", label: "Критично" },
        { value: "notCritical", label: "Не критично" }
      ]
    }
  ]
};

const record = {
  id: "record-1",
  customer: "Заказчик",
  title: "Предмет",
  purchaseBy: "44-ФЗ",
  editorSchema,
  selectionCriteriaRows: [
    {
      order: 1,
      group: "price",
      title: "Цена",
      weightPercent: 40,
      coverageStatus: "full",
      coverageAmount: "100%",
      coverageNote: "Закрываем"
    }
  ],
  preassessment: {
    riskRows: [
      {
        order: 1,
        parameter: "Сроки",
        managerComment: "Сжатый график",
        criticality: "critical"
      }
    ],
    summaryDecision: "estimate",
    alexanderDecision: "decline",
    estimateFileUrl: "https://example.com/estimate"
  },
  documentWiki: {
    overrides: {
      "wiki:requirements": {
        title: "Требования",
        visible: false,
        order: 10
      }
    },
    manualBlocks: [
      {
        id: "manual-1",
        title: "Ручная заметка",
        body: "Текст",
        visible: true,
        order: 1000
      }
    ]
  }
};

const firstForm = buildFormState(record);
const secondForm = buildFormState(record);

assert.notEqual(firstForm.selectionCriteriaRows[0].rowId, secondForm.selectionCriteriaRows[0].rowId);
assert.notEqual(firstForm.preassessment.riskRows[0].rowId, secondForm.preassessment.riskRows[0].rowId);
assert.equal(serializeForm(firstForm), serializeForm(secondForm));

const newSelectionRow = createSelectionCriteriaRow({
  group: "requirement",
  title: "Интеграция",
  weightPercent: 80,
  blockFactor: "blockFactor",
  coverageStatus: "none",
  coverageAmount: "50%"
});
const newRiskRow = createPreassessmentRiskRow({
  parameter: "Битрикс24",
  criticality: "notCritical"
});
const editedForm = {
  ...firstForm,
  selectionCriteriaRows: [...firstForm.selectionCriteriaRows, newSelectionRow],
  preassessment: {
    ...firstForm.preassessment,
    riskRows: [...firstForm.preassessment.riskRows, newRiskRow]
  },
  documentWiki: normalizeDocumentWikiConfig(firstForm.documentWiki)
};
const payload = buildSavePayload(editedForm);
const serialized = serializeForm(editedForm);

assert.equal(serialized.includes("rowId"), false);
assert.equal(JSON.stringify(payload).includes("rowId"), false);
assert.equal(payload.selectionCriteriaRows[0].weightPercent, 40);
assert.equal(payload.selectionCriteriaRows[0].blockFactor, "");
assert.equal(payload.selectionCriteriaRows[0].coverageAmount, "100%");
assert.equal(payload.selectionCriteriaRows[1].weightPercent, null);
assert.equal(payload.selectionCriteriaRows[1].blockFactor, "blockFactor");
assert.equal(payload.selectionCriteriaRows[1].coverageAmount, "50%");
assert.equal(payload.preassessment.riskRows.length, 2);
assert.equal(payload.documentWiki.manualBlocks[0].id, "manual-1");

const patchedRecord = applyRecordPatch(
  {
    id: "record-1",
    selectionCriteriaRows: [],
    preassessment: {
      riskRows: []
    },
    documentWiki: {
      version: 1,
      overrides: {},
      manualBlocks: []
    }
  },
  payload
);

assert.equal(patchedRecord.selectionCriteriaRows.length, 2);
assert.equal(patchedRecord.selectionCriteriaRows[1].weightPercent, null);
assert.equal(patchedRecord.selectionCriteriaRows[1].blockFactor, "blockFactor");
assert.equal(patchedRecord.preassessment.riskRows.length, 2);
assert.equal(patchedRecord.documentWiki.overrides["wiki:requirements"].visible, false);
assert.equal(patchedRecord.documentWiki.manualBlocks[0].id, "manual-1");

const editorOptions = getRecordEditorOptions(record);

assert.deepEqual(
  editorOptions.selectionCriteriaGroupOptions.map((option) => option.value),
  ["price", "requirement"]
);
assert.deepEqual(
  editorOptions.selectionCriteriaCoverageOptions.map((option) => option.value),
  ["full", "none"]
);
assert.deepEqual(
  editorOptions.selectionCriteriaBlockFactorOptions.map((option) => option.value),
  ["blockFactor", "no"]
);
assert.deepEqual(
  editorOptions.preassessmentCriticalityOptions.map((option) => option.value),
  ["critical", "notCritical"]
);
assert.deepEqual(
  getPurchaseBySelectOptions("223-ФЗ / Положение о закупке", editorOptions.purchaseByOptions).map((option) => option.value),
  ["44-ФЗ", "Коммерческая закупка", "223-ФЗ / Положение о закупке"]
);

console.log("record form model checks passed");
