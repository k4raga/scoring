import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const targets = [
  "frontend/src",
  "backend/src",
  "docs",
  "prototype-home.html",
  "prototype-month.html",
  "prototype-detail.html",
  "scripts/smoke.mjs"
];

const allowedExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".md"]);
const findings = [];

for (const target of targets) {
  const absoluteTarget = path.resolve(root, target);

  if (!fs.existsSync(absoluteTarget)) {
    continue;
  }

  walk(absoluteTarget);
}

if (findings.length) {
  console.error("Encoding check failed. Suspicious mojibake fragments found:");

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}: ${finding.preview}`);
  }

  process.exit(1);
}

console.log("Encoding check passed");

function walk(targetPath) {
  const stats = fs.statSync(targetPath);

  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "tmp") {
        continue;
      }

      walk(path.join(targetPath, entry.name));
    }

    return;
  }

  if (!allowedExtensions.has(path.extname(targetPath))) {
    return;
  }

  const content = fs.readFileSync(targetPath, "utf8");
  const lines = content.split(/\r?\n/u);

  lines.forEach((line, index) => {
    if (!isSuspiciousLine(line)) {
      return;
    }

    findings.push({
      file: path.relative(root, targetPath).replace(/\\/gu, "/"),
      line: index + 1,
      preview: line.trim().slice(0, 160)
    });
  });
}

function isSuspiciousLine(line) {
  if (!line.trim()) {
    return false;
  }

  const latinMojibake = [...line.matchAll(/(?:Ã.|Â.|Ð.|Ñ.)/gu)].length;
  const cp1251Pairs = [...line.matchAll(/[РС][А-яЁё]/gu)].length;
  const weirdGlyphs = [...line.matchAll(/(?:вЂ.|в„.|[Ѓ™љњћџ�])/gu)].length;

  if (latinMojibake >= 2) {
    return true;
  }

  if (weirdGlyphs >= 1) {
    return true;
  }

  return cp1251Pairs >= 6 && /Р/u.test(line) && /С/u.test(line);
}
