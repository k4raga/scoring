import { Router } from "express";
import { analyzeArchivePackage, getAiProviders } from "../ai-analysis.js";

export function createSystemRouter({ port, upload }) {
  const router = Router();

  router.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      service: "scoring-backend",
      port
    });
  });

  router.get("/api/ai/providers", (_request, response) => {
    response.json({
      providers: getAiProviders()
    });
  });

  router.post("/api/ai/analyze-archive", upload.single("archive"), (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: "archive_required" });
      return;
    }

    const analysis = analyzeArchivePackage({
      archiveFile: request.file,
      providerId: request.body?.providerId || request.body?.provider,
      hints: {
        title: request.body?.title,
        sourceUrl: request.body?.sourceUrl,
        etpUrl: request.body?.etpUrl
      }
    });

    response.json(analysis);
  });

  return router;
}
