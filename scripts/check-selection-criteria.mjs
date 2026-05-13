import assert from "node:assert/strict";
import { applyRecordPatch } from "../backend/src/record-patch.js";
import { normalizeSelectionCriteriaRows } from "../backend/src/record-schema.js";

const normalizedRows = normalizeSelectionCriteriaRows([
  {
    order: 2,
    group: "неценовой критерий",
    title: "Опыт команды",
    weightPercent: "40%",
    coverageStatus: "полностью закрываем",
    coverageNote: "Есть релевантные проекты",
    sourceExcerpt: "Опыт команды оценивается с весом 40%."
  },
  {
    order: 1,
    group: "дополнительное требование",
    title: "Интеграция с внутренними системами",
    weightPercent: "25",
    coverageStatus: "частично закрываем"
  }
]);

assert.equal(normalizedRows.length, 2);
assert.equal(normalizedRows[0].group, "requirement");
assert.equal(normalizedRows[0].weightPercent, null);
assert.equal(normalizedRows[0].coverageStatus, "partial");
assert.equal(normalizedRows[1].group, "nonPrice");
assert.equal(normalizedRows[1].weightPercent, 40);
assert.deepEqual(
  normalizedRows.map((row) => row.order),
  [1, 2]
);

assert.deepEqual(
  normalizeSelectionCriteriaRows({
    criteriaRows: [{ group: "hardRequirements", title: "Старое требование", note: "legacy" }],
    price: ["Цена"]
  }),
  []
);

assert.throws(
  () => normalizeSelectionCriteriaRows([{ title: "Цена", group: "price" }], { requireCoverage: true }),
  /selection_criteria_coverage_required/
);

const patchedFromLegacy = applyRecordPatch(
  { id: "record-1", selectionCriteriaRows: [] },
  { criteriaRows: [{ group: "hardRequirements", title: "Legacy", note: "Не переносить" }] }
);

assert.deepEqual(patchedFromLegacy.selectionCriteriaRows, []);

const patchedSelectionCriteria = applyRecordPatch(
  { id: "record-1", selectionCriteriaRows: [] },
  {
    selectionCriteriaRows: [
      {
        group: "requirement",
        title: "Интеграция",
        weightPercent: 80,
        coverageStatus: "full"
      }
    ]
  }
);

assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].weightPercent, null);
assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].coverageStatus, "full");

console.log("selection criteria checks passed");
