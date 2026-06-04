import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { getProjectRoot, getStorageAssetsRoot, getStorageProjectsRoot } from "./paths.js";
import { createAnalysisJobsRouter } from "./routes/analysis-jobs-routes.js";
import { createDocumentsRouter } from "./routes/documents-routes.js";
import { createRecordsRouter } from "./routes/records-routes.js";
import { createSystemRouter } from "./routes/system-routes.js";
import { normalizeOptionalText, readBooleanEnv } from "./services/http-utils.js";

const projectRoot = getProjectRoot();
const storageRoot = getStorageProjectsRoot();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

fs.mkdirSync(storageRoot, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 4100);
const localAnalysisAdapterEnabled = readBooleanEnv(process.env.SCORING_ENABLE_LOCAL_ANALYSIS_ADAPTER);
const frontendDist = normalizeOptionalText(process.env.SCORING_FRONTEND_DIST);

app.use((_request, response, next) => {
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  next();
});

app.use(express.json());
app.use("/assets/docs", express.static(path.join(projectRoot, "docs")));
app.use("/assets/tmp", express.static(path.join(projectRoot, "tmp")));
app.use("/assets/storage", express.static(getStorageAssetsRoot()));

app.use(createSystemRouter({ port, upload }));
app.use(createRecordsRouter({ upload }));
app.use(createDocumentsRouter());
app.use(createAnalysisJobsRouter({ localAnalysisAdapterEnabled }));

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`scoring-backend listening on http://localhost:${port}`);
});
