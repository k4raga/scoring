from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
MVP_ROOT = ROOT / "mvp"
RUNS_ROOT = MVP_ROOT / "runs"


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "coding-run"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Initialize a Codex-first coding run."
    )
    parser.add_argument(
        "documents",
        nargs="*",
        help="Paths to source documents for the run."
    )
    parser.add_argument(
        "--slug",
        default="coding-run",
        help="Human-friendly slug for the run folder."
    )
    parser.add_argument(
        "--template",
        help="Optional path to the coding workbook template."
    )
    return parser


def ensure_paths_exist(paths: list[Path]) -> None:
    missing = [str(path) for path in paths if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing input paths:\n- " + "\n- ".join(missing)
        )


def write_json(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    source_documents = [Path(item).resolve() for item in args.documents]
    template_path = Path(args.template).resolve() if args.template else None

    paths_to_check = list(source_documents)
    if template_path:
        paths_to_check.append(template_path)
    ensure_paths_exist(paths_to_check)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"{timestamp}-{slugify(args.slug)}"
    run_root = RUNS_ROOT / run_id
    input_dir = run_root / "input"
    normalized_dir = run_root / "normalized"
    output_dir = run_root / "output"

    for path in [run_root, input_dir, normalized_dir, output_dir]:
        path.mkdir(parents=True, exist_ok=False)

    input_manifest = []
    for source in source_documents:
        destination = input_dir / source.name
        shutil.copy2(source, destination)
        input_manifest.append(
            {
                "name": source.name,
                "path": str(destination),
                "kind": source.suffix.lower() or None
            }
        )

    coding_output_path = output_dir / "coding.xlsx"
    if template_path:
        shutil.copy2(template_path, coding_output_path)

    facts_payload = {
        "document_package": {
            "run_id": run_id,
            "source_documents": input_manifest
        },
        "tender_facts": {
            "customer": None,
            "subject": None,
            "deadline": None,
            "procurement_stage": None,
            "procurement_type": None,
            "selection_criteria": [],
            "requirements_without_weight": [],
            "links": [],
            "comments": []
        },
        "confidence_flags": [],
        "notes": []
    }

    bitrix_payload = {
        "status": "not_created",
        "task_id": None,
        "url": None,
        "payload": {}
    }

    run_log_payload = {
        "run_id": run_id,
        "status": "initialized",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "template": {
            "source": str(template_path) if template_path else None,
            "materialized": str(coding_output_path) if template_path else None
        },
        "steps": [
            {
                "name": "initialize_run",
                "status": "done"
            },
            {
                "name": "extract_facts",
                "status": "pending"
            },
            {
                "name": "fill_coding_sheet",
                "status": "pending"
            },
            {
                "name": "create_bitrix_task",
                "status": "pending"
            }
        ],
        "artifacts": {
            "facts": str(run_root / "facts.json"),
            "bitrix_task": str(run_root / "bitrix-task.json"),
            "summary": str(run_root / "summary.md"),
            "coding_file": str(coding_output_path) if template_path else None
        }
    }

    summary = "\n".join(
        [
            f"# Coding Run: {run_id}",
            "",
            "## Status",
            "",
            "- run initialized",
            "- facts extraction pending",
            "- coding workbook pending",
            "- Bitrix24 task pending",
            "",
            "## Input documents",
            "",
            *[
                f"- {item['name']}"
                for item in input_manifest
            ],
            "",
            "## Next steps for Codex",
            "",
            "1. Review files in `input/`.",
            "2. Create text/normalized representations in `normalized/` if needed.",
            "3. Fill `facts.json` based on the documents.",
            "4. Materialize or update `output/coding.xlsx`.",
            "5. Prepare or create the Bitrix24 task and update `bitrix-task.json`.",
            ""
        ]
    )

    write_json(run_root / "facts.json", facts_payload)
    write_json(run_root / "bitrix-task.json", bitrix_payload)
    write_json(run_root / "run-log.json", run_log_payload)
    (run_root / "summary.md").write_text(summary + "\n", encoding="utf-8")

    print(run_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
