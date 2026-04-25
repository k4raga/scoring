import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSafeSlug } from "./upload-metadata.js";
import { getMvpRoot, getProjectRoot } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initializeCodexRun({ archivePath, archiveName, runSlug }) {
  const projectRoot = getProjectRoot();
  const mvpRoot = getMvpRoot();
  const scriptPath = path.join(projectRoot, "mvp", "scripts", "init_run.py");
  const slug = buildSafeSlug(runSlug || archiveName || "coding-run", "coding-run");
  const runArgs = [scriptPath, archivePath, "--slug", slug];
  const candidates = [
    { executable: "python", args: runArgs },
    { executable: "py", args: ["-3", ...runArgs] }
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.executable, candidate.args, {
      cwd: projectRoot,
      encoding: "utf-8"
    });

    if (result.status === 0) {
      const runRoot = String(result.stdout || "").trim();

      if (runRoot && fs.existsSync(runRoot)) {
        return {
          method: candidate.executable,
          status: "initialized",
          runRoot,
          scriptPath,
          mvpRoot,
          stdout: result.stdout || "",
          stderr: result.stderr || ""
        };
      }
    }
  }

  const fallback = createFallbackRun({ archivePath, archiveName, slug, mvpRoot });
  return {
    ...fallback,
    method: "fallback",
    status: "fallback"
  };
}

function createFallbackRun({ archivePath, archiveName, slug, mvpRoot }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(mvpRoot, "runs", `${timestamp}-${slug}`);
  const inputDir = path.join(runRoot, "input");
  const normalizedDir = path.join(runRoot, "normalized");
  const outputDir = path.join(runRoot, "output");

  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const copiedArchive = path.join(inputDir, path.basename(archivePath || archiveName || "source-archive.zip"));
  fs.copyFileSync(archivePath, copiedArchive);

  const inputManifest = [
    {
      name: path.basename(copiedArchive),
      path: copiedArchive,
      kind: path.extname(copiedArchive).toLowerCase() || null
    }
  ];

  const factsPayload = {
    document_package: {
      run_id: path.basename(runRoot),
      source_documents: inputManifest
    },
    tender_facts: {
      customer: null,
      subject: null,
      deadline: null,
      procurement_stage: null,
      procurement_type: null,
      selection_criteria: [],
      requirements_without_weight: [],
      links: [],
      comments: []
    },
    confidence_flags: [],
    notes: ["Fallback run created because init_run.py could not be invoked."]
  };

  const bitrixPayload = {
    status: "not_created",
    task_id: null,
    url: null,
    payload: {}
  };

  const runLogPayload = {
    run_id: path.basename(runRoot),
    status: "initialized",
    created_at: new Date().toISOString(),
    template: {
      source: null,
      materialized: null
    },
    steps: [
      { name: "initialize_run", status: "done" },
      { name: "extract_facts", status: "pending" },
      { name: "fill_coding_sheet", status: "pending" },
      { name: "create_bitrix_task", status: "pending" }
    ],
    artifacts: {
      facts: path.join(runRoot, "facts.json"),
      bitrix_task: path.join(runRoot, "bitrix-task.json"),
      summary: path.join(runRoot, "summary.md"),
      coding_file: null
    }
  };

  fs.writeFileSync(path.join(runRoot, "facts.json"), `${JSON.stringify(factsPayload, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(runRoot, "bitrix-task.json"), `${JSON.stringify(bitrixPayload, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(runRoot, "run-log.json"), `${JSON.stringify(runLogPayload, null, 2)}\n`, "utf-8");
  fs.writeFileSync(
    path.join(runRoot, "summary.md"),
    [
      `# Coding Run: ${path.basename(runRoot)}`,
      "",
      "## Status",
      "",
      "- run initialized via fallback",
      "- facts extraction pending",
      "- coding workbook pending",
      "- Bitrix24 task pending",
      "",
      "## Input documents",
      "",
      `- ${path.basename(copiedArchive)}`,
      ""
    ].join("\n"),
    "utf-8"
  );

  return {
    runRoot,
    scriptPath: null,
    mvpRoot,
    stdout: runRoot,
    stderr: "init_run.py could not be executed; fallback run was created."
  };
}
