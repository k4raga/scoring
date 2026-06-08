import assert from "node:assert/strict";
import { applyRecordPatch } from "../backend/src/record-patch.js";
import { normalizeSelectionCriteriaRows } from "../backend/src/record-schema.js";

const normalizedRows = normalizeSelectionCriteriaRows([
  {
    order: 2,
    group: "неценовой критерий",
    title: "Опыт команды",
    weightPercent: "40%",
    blockFactor: "нет",
    coverageStatus: "полностью закрываем",
    coverageAmount: "80%",
    coverageNote: "Есть релевантные проекты",
    sourceExcerpt: "Опыт команды оценивается с весом 40%."
  },
  {
    order: 1,
    group: "дополнительное требование",
    title: "Интеграция с внутренними системами",
    weightPercent: "25",
    blockFactor: "блок-фактор",
    coverageStatus: "частично закрываем"
  }
]);

assert.equal(normalizedRows.length, 2);
assert.equal(normalizedRows[0].group, "requirement");
assert.equal(normalizedRows[0].weightPercent, null);
assert.equal(normalizedRows[0].blockFactor, "blockFactor");
assert.equal(normalizedRows[0].coverageStatus, "partial");
assert.equal(normalizedRows[1].coverageAmount, "80%");
assert.equal(normalizedRows[1].group, "nonPrice");
assert.equal(normalizedRows[1].weightPercent, 40);
assert.equal(normalizedRows[1].blockFactor, "");
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

assert.equal(
  normalizeSelectionCriteriaRows([{ title: "Цена", group: "price" }], { requireCoverage: true })[0].coverageStatus,
  ""
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
        blockFactor: "blockFactor",
        coverageStatus: "full",
        coverageAmount: "100%"
      }
    ]
  }
);

assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].weightPercent, null);
assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].blockFactor, "blockFactor");
assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].coverageStatus, "full");
assert.equal(patchedSelectionCriteria.selectionCriteriaRows[0].coverageAmount, "100%");

console.log("selection criteria checks passed");
