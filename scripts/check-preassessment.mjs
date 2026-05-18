import assert from "node:assert/strict";
import { applyRecordPatch } from "../backend/src/record-patch.js";
import { normalizePreassessment } from "../backend/src/record-schema.js";

const empty = normalizePreassessment(null);

assert.deepEqual(empty, {
  riskRows: [],
  riskBaseUrl: "",
  summaryDecision: "",
  alexanderDecision: "",
  estimateFileUrl: ""
});

const normalized = normalizePreassessment({
  riskBaseUrl: " https://example.com/risk-base ",
  summaryDecision: "Оценка",
  alexanderDecision: "Не участвуем",
  estimateFile: "https://example.com/estimate",
  riskRows: [
    {
      order: 2,
      parameter: "RFI",
      comment: "Большой объем для подачи",
      criticality: "Критично"
    },
    {
      order: 1,
      title: "Битрикс24",
      managerComment: "Можно обойти типовым модулем",
      criticality: "Не критично",
      riskBaseRef: "risk-bitrix"
    }
  ]
});

assert.equal(normalized.riskBaseUrl, "https://example.com/risk-base");
assert.equal(normalized.summaryDecision, "estimate");
assert.equal(normalized.alexanderDecision, "decline");
assert.equal(normalized.estimateFileUrl, "https://example.com/estimate");
assert.deepEqual(
  normalized.riskRows.map((row) => row.order),
  [1, 2]
);
assert.equal(normalized.riskRows[0].parameter, "Битрикс24");
assert.equal(normalized.riskRows[0].criticality, "notCritical");
assert.equal(normalized.riskRows[1].criticality, "critical");

const declined = normalizePreassessment({
  summaryDecision: "Не участвуем",
  riskRows: [{ parameter: "Объем работ", criticality: "" }]
});

assert.equal(declined.summaryDecision, "decline");
assert.equal(declined.riskRows[0].criticality, "unknown");

const legacyAlexanderDecision = normalizePreassessment({
  alexanderDecision: "Оставить в оценке"
});

assert.equal(legacyAlexanderDecision.alexanderDecision, "estimate");

const patched = applyRecordPatch(
  {
    id: "record-1",
    title: "Запись",
    selectionCriteriaRows: []
  },
  {
    preassessment: normalized
  }
);

assert.equal(patched.title, "Запись");
assert.equal(patched.preassessment.summaryDecision, "estimate");
assert.equal(patched.preassessment.riskRows.length, 2);

const preserved = applyRecordPatch(
  {
    id: "record-2",
    preassessment: normalized,
    selectionCriteriaRows: []
  },
  {
    notes: "Без изменений предоценки"
  }
);

assert.deepEqual(preserved.preassessment, normalized);

console.log("preassessment checks passed");
