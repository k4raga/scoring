import {
  normalizeCriteriaRows,
  normalizePreassessment,
  normalizeProcurementStage,
  normalizeSelectionCriteriaRows,
  normalizeShortTitle
} from "./record-schema.js";

export function applyRecordPatch(existingRecord, patch) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  const criteriaSource =
    patch.criteriaRows !== undefined || patch.criteria !== undefined
      ? patch.criteriaRows ?? patch.criteria
      : undefined;
  const criteriaRows = criteriaSource !== undefined ? normalizeCriteriaRows(criteriaSource) : undefined;
  const selectionCriteriaSource =
    patch.selectionCriteriaRows !== undefined || patch.selectionCriteria !== undefined
      ? patch.selectionCriteriaRows ?? patch.selectionCriteria
      : undefined;
  const selectionCriteriaRows = selectionCriteriaSource !== undefined
    ? normalizeSelectionCriteriaRows(selectionCriteriaSource, { requireCoverage: false })
    : undefined;
  const preassessment = hasOwn("preassessment") ? normalizePreassessment(patch.preassessment) : undefined;
  const nextRecord = {
    ...existingRecord,
    projectTitle: patch.projectTitle ?? existingRecord.projectTitle,
    customer: patch.customer ?? existingRecord.customer,
    title: patch.title ?? existingRecord.title,
    shortTitle: hasOwn("shortTitle") ? normalizeShortTitle(patch.shortTitle) : existingRecord.shortTitle,
    procurementStage: hasOwn("procurementStage")
      ? normalizeProcurementStage(patch.procurementStage)
      : existingRecord.procurementStage,
    sourceUrl: patch.sourceUrl ?? existingRecord.sourceUrl,
    etpUrl: patch.etpUrl ?? existingRecord.etpUrl,
    documentsFolderHref: patch.documentsFolderHref ?? existingRecord.documentsFolderHref,
    googleDocumentsFolderHref: patch.googleDocumentsFolderHref ?? existingRecord.googleDocumentsFolderHref,
    deadlineAt: patch.deadlineAt ?? existingRecord.deadlineAt,
    nmc: patch.nmc ?? existingRecord.nmc ?? existingRecord.priceStatus,
    stage: patch.stage ?? existingRecord.stage,
    purchaseBy: patch.purchaseBy ?? existingRecord.purchaseBy ?? patch.platform ?? existingRecord.platform,
    platform: patch.platform ?? existingRecord.platform ?? patch.purchaseBy,
    platformPayment: patch.platformPayment ?? existingRecord.platformPayment,
    applicationSecurity: patch.applicationSecurity ?? existingRecord.applicationSecurity,
    contractSecurity: patch.contractSecurity ?? existingRecord.contractSecurity,
    overallExecutionTerm: patch.overallExecutionTerm ?? existingRecord.overallExecutionTerm,
    contractTerm: patch.contractTerm ?? existingRecord.contractTerm,
    retrade: patch.retrade ?? existingRecord.retrade,
    antiDumpingMeasures: patch.antiDumpingMeasures ?? existingRecord.antiDumpingMeasures,
    notes: patch.notes ?? existingRecord.notes ?? patch.summary ?? existingRecord.summary,
    summary: patch.summary ?? existingRecord.summary ?? patch.notes ?? existingRecord.notes,
    creative: hasOwn("creative") ? patch.creative : existingRecord.creative,
    creativeLinkUrl: patch.creativeLinkUrl ?? existingRecord.creativeLinkUrl,
    requirementsDocumentUrl: patch.requirementsDocumentUrl ?? existingRecord.requirementsDocumentUrl,
    criteriaDocumentUrl: patch.criteriaDocumentUrl ?? existingRecord.criteriaDocumentUrl,
    technicalSpecificationUrl: patch.technicalSpecificationUrl ?? existingRecord.technicalSpecificationUrl,
    criteriaRows: criteriaRows ?? existingRecord.criteriaRows,
    selectionCriteriaRows: selectionCriteriaRows ?? existingRecord.selectionCriteriaRows,
    preassessment: preassessment ?? existingRecord.preassessment,
    documents: Array.isArray(patch.documents) ? patch.documents : existingRecord.documents,
    documentWiki: patch.documentWiki && typeof patch.documentWiki === "object" && !Array.isArray(patch.documentWiki)
      ? patch.documentWiki
      : existingRecord.documentWiki
  };

  if (patch.workflow && typeof patch.workflow === "object") {
    nextRecord.workflow = {
      ...existingRecord.workflow,
      ...patch.workflow,
      codexRun: {
        ...existingRecord.workflow?.codexRun,
        ...patch.workflow.codexRun
      }
    };
  }

  if (!nextRecord.documentsFolderHref && nextRecord.documents?.length) {
    const archiveDocument =
      nextRecord.documents.find((document) => document.kind === "archive") || nextRecord.documents[0];
    nextRecord.documentsFolderHref = archiveDocument?.href || "";
  }

  if (!nextRecord.googleDocumentsFolderHref) {
    nextRecord.googleDocumentsFolderHref = nextRecord.documentsFolderHref || "";
  }

  if (!nextRecord.requirementsDocumentUrl) {
    nextRecord.requirementsDocumentUrl = nextRecord.documentsFolderHref || "";
  }

  if (!nextRecord.criteriaDocumentUrl) {
    nextRecord.criteriaDocumentUrl = nextRecord.documentsFolderHref || "";
  }

  if (!nextRecord.technicalSpecificationUrl) {
    nextRecord.technicalSpecificationUrl = nextRecord.documentsFolderHref || "";
  }

  return nextRecord;
}
