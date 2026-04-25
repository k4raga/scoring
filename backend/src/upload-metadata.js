import crypto from "node:crypto";
import path from "node:path";
import { repairTextEncoding } from "./text-repair.js";

const ARCHIVE_DATE_PATTERN = /(^|[^0-9])(\d{4})[-_.](\d{2})[-_.](\d{2})(?=[^0-9]|$)/u;
const STRIP_CODE_PATTERN = /^\s*(?:\d{4,}|[a-z]{2,}\d{2,}|\d{2,}[a-z]{2,})[\s_.-]*/iu;

export function extractArchiveMetadata(fileName, now = new Date()) {
  const archiveName = repairTextEncoding(path.basename(fileName || "source-archive.zip"));
  const archiveStem = archiveName.replace(/\.[^.]+$/, "");
  const dateMatch = archiveStem.match(ARCHIVE_DATE_PATTERN);
  const publishedAt = dateMatch ? `${dateMatch[2]}-${dateMatch[3]}-${dateMatch[4]}` : formatLocalDate(now);
  const dateSource = dateMatch ? "archive_filename" : "current_date";
  const cleanedStem = archiveStem
    .replace(ARCHIVE_DATE_PATTERN, " ")
    .replace(STRIP_CODE_PATTERN, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedStem = repairTextEncoding(cleanedStem);
  const title = normalizedStem || `Новая запись ${publishedAt}`;
  const shortTitle = normalizedStem.split(" ").slice(0, 5).join(" ") || title;

  return {
    archiveName,
    archiveStem,
    publishedAt,
    dateSource,
    title,
    shortTitle,
    titleSlug: buildSafeSlug(normalizedStem || archiveStem || archiveName),
    dayKey: publishedAt
  };
}

export function buildSafeSlug(value, fallback = "upload") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  const source = String(value || fallback || "upload");
  const hash = crypto.createHash("sha1").update(source).digest("hex").slice(0, 8);
  return `${fallback}-${hash}`;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
