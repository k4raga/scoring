import { Router } from "express";
import {
  createDayExport,
  deleteRecord,
  getDashboardPayload,
  getDayPayload,
  getMonthPayload,
  getRecordOrThrow,
  getYearPayload,
  getYearsPayload,
  updateRecord,
  uploadArchiveRecord
} from "../services/record-service.js";
import { sendHttpError } from "../services/http-utils.js";

export function createRecordsRouter({ upload }) {
  const router = Router();

  router.get("/api/dashboard", (_request, response) => {
    response.json(getDashboardPayload());
  });

  router.get("/api/years", (_request, response) => {
    response.json(getYearsPayload());
  });

  router.get("/api/years/:year", (request, response) => {
    try {
      response.json(getYearPayload(request.params.year));
    } catch (error) {
      sendHttpError(response, error, "year_read_failed");
    }
  });

  router.get("/api/years/:year/months/:month", (request, response) => {
    response.json(getMonthPayload(request.params.year, request.params.month));
  });

  router.get("/api/years/:year/months/:month/days/:day", (request, response) => {
    try {
      response.json(getDayPayload(request.params.year, request.params.month, request.params.day));
    } catch (error) {
      sendHttpError(response, error, "day_read_failed");
    }
  });

  router.get("/api/years/:year/months/:month/days/:day/export", async (request, response) => {
    try {
      const exportPayload = await createDayExport({
        year: request.params.year,
        month: request.params.month,
        day: request.params.day
      });

      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      response.setHeader("Content-Disposition", `attachment; filename="scoring-day-${exportPayload.dayKey}.xlsx"`);
      response.send(exportPayload.buffer);
    } catch (error) {
      sendHttpError(response, error, "day_export_failed");
    }
  });

  router.get("/api/records/:recordId", (request, response) => {
    try {
      response.json(getRecordOrThrow(request.params.recordId));
    } catch (error) {
      sendHttpError(response, error, "record_read_failed");
    }
  });

  router.delete("/api/records/:recordId", (request, response) => {
    try {
      response.json(deleteRecord(request.params.recordId));
    } catch (error) {
      sendHttpError(response, error, "record_delete_failed");
    }
  });

  router.put("/api/records/:recordId", (request, response) => {
    try {
      response.json(updateRecord(request.params.recordId, request.body));
    } catch (error) {
      sendHttpError(response, error, "record_patch_invalid");
    }
  });

  async function handleArchiveUpload(request, response) {
    try {
      const result = await uploadArchiveRecord({
        archiveFile: request.file,
        body: request.body
      });

      response.status(result.status).json(result.payload);
    } catch (error) {
      sendHttpError(response, error, "archive_upload_failed", Number(error?.httpStatus) || 500);
    }
  }

  router.post("/api/records", upload.single("archive"), handleArchiveUpload);
  router.post("/api/ingest/archive", upload.single("archive"), handleArchiveUpload);

  return router;
}
