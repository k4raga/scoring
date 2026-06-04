import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scoring-document-service-check-"));
const runsRoot = path.join(tempRoot, "runs");
const runRoot = path.join(runsRoot, "run-1");

fs.mkdirSync(path.join(runRoot, "normalized"), { recursive: true });
fs.mkdirSync(path.join(runRoot, "source"), { recursive: true });
fs.mkdirSync(path.join(runRoot, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(runRoot, "normalized", "doc-1.md"), "# Document\n\nMarkdown body", "utf-8");
fs.writeFileSync(path.join(runRoot, "source", "doc-1.txt"), "source body", "utf-8");
fs.writeFileSync(path.join(runRoot, "artifacts", "manifest.json"), JSON.stringify({ ok: true }), "utf-8");

process.env.SCORING_EXTRACTOR_RUNS_ROOT = runsRoot;

const {
  getMarkdownDocumentPayload,
  getSourceFolderPayload,
  resolveRecordExtractionArtifactPath,
  resolveRecordSourceArtifact
} = await import("../backend/src/services/document-service.js");

const record = {
  id: "record-1",
  projectTitle: "Document check",
  documents: [
    {
      kind: "normalized_markdown",
      group: "normalizedMarkdown",
      documentId: "doc-1",
      label: "Document",
      href: "/artifacts/run-1/normalized/doc-1.md"
    }
  ],
  workflow: {
    extraction: {
      documents: [
        {
          documentId: "doc-1",
          fileName: "doc-1.txt",
          sourceFileUrl: "/artifacts/run-1/source/doc-1.txt",
          sourcePath: "/artifacts/run-1/source/doc-1.txt",
          markdownHref: "/artifacts/run-1/normalized/doc-1.md"
        }
      ],
      artifacts: {
        manifestJson: "/artifacts/run-1/artifacts/manifest.json"
      }
    }
  }
};

const markdown = getMarkdownDocumentPayload(record, "doc-1");
assert.match(markdown.markdown, /Markdown body/u);

const sourceArtifact = resolveRecordSourceArtifact(record, "doc-1");
assert.equal(fs.readFileSync(sourceArtifact.path, "utf-8"), "source body");

const folder = getSourceFolderPayload(record);
assert.equal(folder.documents[0].href, "/api/records/record-1/source-documents/doc-1");

const manifestPath = resolveRecordExtractionArtifactPath(record, "manifestJson");
assert.equal(fs.readFileSync(manifestPath, "utf-8"), "{\"ok\":true}");

assert.throws(
  () => resolveRecordSourceArtifact({
    id: "unsafe-record",
    workflow: {
      extraction: {
        documents: [
          {
            documentId: "unsafe",
            sourceFileUrl: path.join(tempRoot, "outside.txt")
          }
        ]
      }
    }
  }, "unsafe"),
  /source_document_path_not_allowed/u
);

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("document service checks passed");
