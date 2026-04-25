import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  getLocalAnalysisWorkspaceRoot,
  getProjectRoot,
  getStorageAssetsRoot,
  getStorageProjectsRoot
} from "./paths.js";

const STORAGE_HREF_PREFIX = "/assets/storage/";
const MAX_INVENTORY_FILES = 1500;

export function runLocalAnalysisAdapterPass({ job, record }) {
  if (!isObject(job) || !normalizeText(job.id)) {
    throw createAdapterError("invalid_job_payload", "analysis_job_payload_is_required");
  }

  const archive = resolveArchiveForJob({ job, record });

  if (!archive) {
    throw createAdapterError("archive_not_found", "analysis_archive_not_found", {
      recordId: normalizeText(job.recordId),
      archiveHref: normalizeText(job?.archive?.href),
      archiveName: normalizeText(job?.archive?.name)
    });
  }

  const workspace = prepareWorkspace(job.id);
  const stagedArchivePath = stageArchiveIntoWorkspace({
    archivePath: archive.path,
    archiveName: archive.name,
    inputDir: workspace.inputDir
  });
  const extraction = extractArchive({
    archivePath: stagedArchivePath,
    extractedDir: workspace.extractedDir
  });
  const inventory = buildInventory(extraction.inventoryRoot);

  const warnings = [...extraction.warnings];
  if (inventory.truncated) {
    warnings.push(`inventory_truncated_at_${MAX_INVENTORY_FILES}_files`);
  }

  return {
    warnings,
    result: {
      analysisMetadata: {
        adapter: {
          id: "local_codex_execution_adapter",
          mode: "inventory_only",
          version: "sp2-c2"
        },
        archive: {
          source: archive.source,
          name: archive.name,
          href: archive.href,
          projectPath: toProjectRelative(archive.path),
          sizeBytes: safeFileSize(archive.path)
        },
        workspace: {
          root: toProjectRelative(workspace.root),
          inputDir: toProjectRelative(workspace.inputDir),
          extractedDir: toProjectRelative(workspace.extractedDir)
        },
        extraction: {
          status: extraction.status,
          method: extraction.method,
          inventoryRoot: toProjectRelative(extraction.inventoryRoot)
        },
        inventory: {
          totalFiles: inventory.totalFiles,
          totalBytes: inventory.totalBytes,
          truncated: inventory.truncated,
          maxFiles: MAX_INVENTORY_FILES,
          files: inventory.files
        }
      },
      fields: {
        archiveInventoryTotalFiles: inventory.totalFiles,
        archiveInventoryTotalBytes: inventory.totalBytes,
        archiveExtractionStatus: extraction.status
      },
      recordPatch: {}
    }
  };
}

function resolveArchiveForJob({ job, record }) {
  const candidates = [];
  const jobArchiveHref = normalizeText(job?.archive?.href);
  const jobArchiveName = normalizeText(job?.archive?.name);

  if (jobArchiveHref) {
    candidates.push({
      source: "job_archive_href",
      href: jobArchiveHref,
      path: resolveStorageHrefToPath(jobArchiveHref),
      name: decodeFileNameFromHref(jobArchiveHref) || jobArchiveName
    });
  }

  const projectFolder = resolveRecordProjectFolder(record);

  if (projectFolder && jobArchiveName) {
    candidates.push({
      source: "record_project_folder",
      href: buildStorageHrefFromPath(path.join(projectFolder, jobArchiveName)),
      path: path.join(projectFolder, jobArchiveName),
      name: jobArchiveName
    });
  }

  const recordArchiveDocument = Array.isArray(record?.documents)
    ? record.documents.find((document) => {
        return normalizeText(document?.kind).toLowerCase() === "archive" && normalizeText(document?.href);
      })
    : null;

  if (recordArchiveDocument) {
    const documentHref = normalizeText(recordArchiveDocument.href);
    const documentName =
      normalizeText(recordArchiveDocument.fileName) || decodeFileNameFromHref(documentHref) || jobArchiveName;
    candidates.push({
      source: "record_archive_document",
      href: documentHref,
      path: resolveStorageHrefToPath(documentHref),
      name: documentName
    });
  }

  if (projectFolder) {
    const discoveredArchive = findArchiveInFolder(projectFolder);
    if (discoveredArchive) {
      candidates.push({
        source: "record_folder_discovery",
        href: buildStorageHrefFromPath(discoveredArchive),
        path: discoveredArchive,
        name: path.basename(discoveredArchive)
      });
    }
  }

  for (const candidate of candidates) {
    if (candidate.path && fs.existsSync(candidate.path) && fs.statSync(candidate.path).isFile()) {
      return {
        source: candidate.source,
        path: candidate.path,
        href: normalizeText(candidate.href),
        name: normalizeText(candidate.name) || path.basename(candidate.path)
      };
    }
  }

  return null;
}

function prepareWorkspace(jobId) {
  const runtimeRoot = getLocalAnalysisWorkspaceRoot();
  const slug = sanitizePathSegment(jobId);
  const root = path.join(runtimeRoot, slug);
  const inputDir = path.join(root, "input");
  const extractedDir = path.join(root, "extracted");

  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(extractedDir, { recursive: true });

  return {
    root,
    inputDir,
    extractedDir
  };
}

function stageArchiveIntoWorkspace({ archivePath, archiveName, inputDir }) {
  const targetName = sanitizeArchiveName(archiveName || path.basename(archivePath));
  const targetPath = path.join(inputDir, targetName);

  fs.copyFileSync(archivePath, targetPath);
  return targetPath;
}

function extractArchive({ archivePath, extractedDir }) {
  const extension = path.extname(archivePath).toLowerCase();
  const warnings = [];

  if (extension === ".zip") {
    const sourceLiteral = archivePath.replace(/'/g, "''");
    const destinationLiteral = extractedDir.replace(/'/g, "''");
    const command = `Expand-Archive -LiteralPath '${sourceLiteral}' -DestinationPath '${destinationLiteral}' -Force`;
    const powerShell = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", command],
      {
        encoding: "utf-8"
      }
    );

    if (powerShell.status === 0) {
      return {
        status: "unpacked",
        method: "powershell_expand_archive",
        inventoryRoot: extractedDir,
        warnings
      };
    }

    warnings.push(normalizeCommandError(powerShell.stderr, "Expand-Archive_failed"));
  } else {
    warnings.push(`unsupported_archive_extension:${extension || "unknown"}`);
  }

  const fallbackTarget = path.join(extractedDir, path.basename(archivePath));
  fs.copyFileSync(archivePath, fallbackTarget);

  return {
    status: "workspace_prepared_only",
    method: "copy_archive_fallback",
    inventoryRoot: extractedDir,
    warnings
  };
}

function buildInventory(rootDir) {
  const files = [];
  let totalBytes = 0;
  let truncated = false;
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const sizeBytes = safeFileSize(absolutePath);
      totalBytes += sizeBytes;
      files.push({
        path: path.relative(rootDir, absolutePath).replaceAll("\\", "/"),
        sizeBytes,
        extension: normalizeText(path.extname(entry.name).replace(/^\./u, "")) || null
      });

      if (files.length >= MAX_INVENTORY_FILES) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    totalFiles: files.length,
    totalBytes,
    truncated
  };
}

function resolveRecordProjectFolder(record) {
  const relativeProjectFolder = normalizeText(record?.workflow?.projectFolder);
  if (!relativeProjectFolder) {
    return null;
  }

  const storageProjectsRoot = getStorageProjectsRoot();
  const resolved = path.resolve(storageProjectsRoot, path.relative("projects", relativeProjectFolder));
  return isInside(storageProjectsRoot, resolved) ? resolved : null;
}

function resolveStorageHrefToPath(href) {
  const normalizedHref = normalizeText(href);
  if (!normalizedHref.startsWith(STORAGE_HREF_PREFIX)) {
    return "";
  }

  const encodedSegments = normalizedHref.slice(STORAGE_HREF_PREFIX.length).split("/").filter(Boolean);
  const decodedSegments = encodedSegments.map((segment) => decodeURIComponent(segment));
  const storageRoot = getStorageAssetsRoot();
  const resolved = path.resolve(storageRoot, ...decodedSegments);

  return isInside(storageRoot, resolved) ? resolved : "";
}

function buildStorageHrefFromPath(absolutePath) {
  const storageRoot = getStorageAssetsRoot();
  if (!isInside(storageRoot, absolutePath)) {
    return "";
  }

  const relative = path.relative(storageRoot, absolutePath).replaceAll("\\", "/");
  return `${STORAGE_HREF_PREFIX}${relative.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function findArchiveInFolder(folderPath) {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return "";
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const archive = entries.find((entry) => entry.isFile() && /\.zip$/iu.test(entry.name));
  return archive ? path.join(folderPath, archive.name) : "";
}

function safeFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_error) {
    return 0;
  }
}

function normalizeCommandError(stderr, fallback) {
  const text = normalizeText(stderr);
  return text || fallback;
}

function sanitizeArchiveName(name) {
  const fileName = path
    .basename(String(name || "source-archive.zip"))
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .trim();
  return fileName || "source-archive.zip";
}

function sanitizePathSegment(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `job-${Date.now()}`;
}

function toProjectRelative(absolutePath) {
  const projectRoot = getProjectRoot();
  return path.relative(projectRoot, absolutePath).replaceAll("\\", "/");
}

function decodeFileNameFromHref(href) {
  const normalizedHref = normalizeText(href);
  if (!normalizedHref) {
    return "";
  }

  const segments = normalizedHref.split("/").filter(Boolean);
  if (!segments.length) {
    return "";
  }

  return decodeURIComponent(segments[segments.length - 1]);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createAdapterError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
