import ExcelJS from "exceljs";
import { normalizeCriteriaRows } from "./record-schema.js";

export async function createDayWorkbook(dayView, records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();

  const metaSheet = workbook.addWorksheet("День");
  metaSheet.columns = [
    { header: "Параметр", key: "label", width: 28 },
    { header: "Значение", key: "value", width: 48 }
  ];
  metaSheet.addRows([
    { label: "Дата", value: dayView.dayKey },
    { label: "Количество записей", value: dayView.totalRecords },
    { label: "С документами", value: dayView.metrics.withDocumentsCount },
    { label: "С источником", value: dayView.metrics.withSourceCount },
    { label: "Готово к handoff", value: dayView.metrics.readyForHandoffCount }
  ]);

  const recordsSheet = workbook.addWorksheet("Записи");
  recordsSheet.columns = [
    { header: "Дата публикации", key: "dayKey", width: 16 },
    { header: "Проект", key: "title", width: 42 },
    { header: "Короткое название", key: "shortTitle", width: 24 },
    { header: "Заказчик", key: "customer", width: 30 },
    { header: "Регион", key: "region", width: 28 },
    { header: "Площадка", key: "platform", width: 24 },
    { header: "Ссылка на ЭТП", key: "etpUrl", width: 42 },
    { header: "Папка документов", key: "documentsFolderHref", width: 42 },
    { header: "Папка Google", key: "googleDocumentsFolderHref", width: 42 },
    { header: "Статус", key: "status", width: 22 },
    { header: "Этап", key: "stage", width: 22 },
    { header: "Дедлайн", key: "deadlineAt", width: 24 },
    { header: "НМЦ", key: "nmc", width: 18 },
    { header: "Закупка по", key: "purchaseBy", width: 22 },
    { header: "Творческое", key: "creative", width: 14 },
    { header: "Файл кодинга", key: "codingFile", width: 28 },
    { header: "Bitrix24", key: "bitrixTaskStatus", width: 26 }
  ];

  recordsSheet.addRows(
    records.map((record) => ({
      dayKey: record.dayKey,
      title: record.title,
      shortTitle: record.shortTitle,
      customer: record.customer,
      region: record.region,
      platform: record.platform,
      etpUrl: record.etpUrl,
      documentsFolderHref: record.documentsFolderHref,
      googleDocumentsFolderHref: record.googleDocumentsFolderHref,
      status: record.status,
      stage: record.stage,
      deadlineAt: record.deadlineAt,
      nmc: record.nmc || record.priceStatus,
      purchaseBy: record.purchaseBy || record.platform,
      creative: formatYesNo(record.creative),
      codingFile: record.workflow.codingFile,
      bitrixTaskStatus: record.workflow.bitrixTaskStatus
    }))
  );

  const criteriaSheet = workbook.addWorksheet("Критерии");
  criteriaSheet.columns = [
    { header: "Проект", key: "project", width: 24 },
    { header: "Группа", key: "group", width: 20 },
    { header: "Наименование", key: "title", width: 30 },
    { header: "Пояснение/основание", key: "description", width: 42 },
    { header: "Тип", key: "kind", width: 18 },
    { header: "Комментарий", key: "note", width: 30 }
  ];

  criteriaSheet.addRows(
    records.flatMap((record) => {
      const criteriaRows = normalizeCriteriaRows(record.criteriaRows ?? record.criteria);

      if (!criteriaRows.length) {
        return [
          {
            project: record.shortTitle,
            group: "",
            title: "Критерии не заполнены",
            description: "",
            kind: "",
            note: ""
          }
        ];
      }

      return criteriaRows.map((criteriaRow) => ({
        project: record.shortTitle,
        group: criteriaRow.group,
        title: criteriaRow.title,
        description: criteriaRow.description,
        kind: criteriaRow.kind,
        note: criteriaRow.note
      }));
    })
  );

  const documentsSheet = workbook.addWorksheet("Документы");
  documentsSheet.columns = [
    { header: "Проект", key: "project", width: 24 },
    { header: "Документ", key: "label", width: 28 },
    { header: "Ссылка", key: "href", width: 80 }
  ];

  documentsSheet.addRows(
    records.flatMap((record) => {
      if (!record.documents.length) {
        return [
          {
            project: record.shortTitle,
            label: "Документы не прикреплены",
            href: ""
          }
        ];
      }

      return record.documents.map((document) => ({
        project: record.shortTitle,
        label: document.label,
        href: document.href
      }));
    })
  );

  return workbook.xlsx.writeBuffer();
}

function formatYesNo(value) {
  if (value === true) {
    return "Да";
  }

  if (value === false) {
    return "Нет";
  }

  return "";
}
