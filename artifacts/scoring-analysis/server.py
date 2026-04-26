from __future__ import annotations

import json
import os
import re
import shutil
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


ROOT = Path(__file__).resolve().parent
RUNS_ROOT = ROOT / "runs"
DEFAULT_PORT = int(os.environ.get("SCORING_ANALYSIS_PORT", "4200"))
RUSSIAN_MONTHS = {
    "января": "01",
    "февраля": "02",
    "марта": "03",
    "апреля": "04",
    "мая": "05",
    "июня": "06",
    "июля": "07",
    "августа": "08",
    "сентября": "09",
    "октября": "10",
    "ноября": "11",
    "декабря": "12",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_slug(value: str, fallback: str = "run") -> str:
    cleaned = re.sub(r"[^0-9A-Za-zА-Яа-я._-]+", "-", value or "").strip("-")
    return cleaned[:80] or fallback


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, status: int, content: str, content_type: str = "text/plain; charset=utf-8") -> None:
    body = content.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def serve_artifact(handler: BaseHTTPRequestHandler, request_path: str) -> None:
    relative = unquote(request_path.removeprefix("/artifacts/")).replace("/", os.sep)
    target = (RUNS_ROOT / relative).resolve()
    runs_root = RUNS_ROOT.resolve()

    try:
        target.relative_to(runs_root)
    except ValueError:
        json_response(handler, 403, {"ok": False, "error": "artifact_forbidden"})
        return

    if not target.exists() or not target.is_file():
        json_response(handler, 404, {"ok": False, "error": "artifact_not_found"})
        return

    content_type = "application/json; charset=utf-8" if target.suffix.lower() == ".json" else "text/markdown; charset=utf-8"
    text_response(handler, 200, target.read_text("utf-8", errors="ignore"), content_type)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}

    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


class AnalysisHandler(BaseHTTPRequestHandler):
    server_version = "scoring-analysis/0.1"

    def log_message(self, format: str, *args) -> None:
        print(f"[{now_iso()}] {self.address_string()} {format % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            json_response(self, 200, {"ok": True, "service": "scoring-analysis", "port": self.server.server_port})
            return

        if parsed.path.startswith("/artifacts/"):
            serve_artifact(self, parsed.path)
            return

        json_response(self, 404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path != "/api/analyze":
            json_response(self, 404, {"ok": False, "error": "not_found"})
            return

        try:
            payload = read_json_body(self)
            result = analyze_archive(payload)
            json_response(self, 200, result)
        except Exception as error:
            json_response(
                self,
                500,
                {
                    "ok": False,
                    "error": "analysis_failed",
                    "message": str(error),
                },
            )


def analyze_archive(payload: dict) -> dict:
    record_id = str(payload.get("recordId") or "").strip()
    archive_path = Path(str(payload.get("archivePath") or "")).expanduser()
    archive_href = str(payload.get("archiveHref") or "").strip()
    hints = payload.get("hints") if isinstance(payload.get("hints"), dict) else {}

    if not archive_path:
        raise ValueError("archivePath is required")

    archive_path = archive_path.resolve()
    if not archive_path.exists():
        raise FileNotFoundError(str(archive_path))

    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{safe_slug(record_id or archive_path.stem)}-{uuid.uuid4().hex[:8]}"
    run_root = RUNS_ROOT / run_id
    input_dir = run_root / "input"
    extracted_dir = run_root / "extracted"
    normalized_dir = run_root / "normalized"
    tables_dir = normalized_dir / "tables"

    input_dir.mkdir(parents=True, exist_ok=True)
    extracted_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)

    staged_archive = input_dir / archive_path.name
    shutil.copy2(archive_path, staged_archive)

    stages = []
    inventory = unpack_archive(staged_archive, extracted_dir)
    stages.append(stage("unpack", "completed", {"files": len(inventory)}))

    documents = normalize_documents(inventory, normalized_dir, tables_dir)
    stages.append(stage("normalize_md", "completed", {"documents": len(documents)}))

    classified = classify_documents(documents)
    document_index = {
        "recordId": record_id,
        "archive": {
            "name": archive_path.name,
            "sourcePath": str(archive_path),
            "href": archive_href,
        },
        "documents": classified,
    }
    write_json(normalized_dir / "document-index.json", document_index)
    document_index_href = artifact_href(run_id, "normalized/document-index.json")
    stages.append(stage("classify_documents", "completed", {"documents": len(classified)}))

    record_patch, fields = build_record_patch(classified, hints, document_index_href)
    stages.append(stage("fill_general", "completed", pick_keys(record_patch, ["customer", "title", "shortTitle", "overallExecutionTerm", "requirementsDocumentUrl", "technicalSpecificationUrl"])))
    stages.append(stage("fill_amounts", "completed", pick_keys(record_patch, ["nmc", "platformPayment", "applicationSecurity", "contractSecurity"])))
    stages.append(stage("fill_tender", "completed", pick_keys(record_patch, ["purchaseBy", "retrade", "antiDumpingMeasures", "notes", "criteriaRows"])))
    record_patch.setdefault("workflow", {}).setdefault("analysis", {}).update(
        {
            "status": "completed",
            "service": "scoring-analysis",
            "runId": run_id,
            "runRoot": str(run_root),
            "normalizedDir": str(normalized_dir),
            "documentIndex": document_index_href,
            "stages": stages,
        }
    )

    result = {
        "analysisMetadata": {
            "service": "scoring-analysis",
            "version": "0.1",
            "runId": run_id,
            "runRoot": str(run_root),
            "normalizedDir": str(normalized_dir),
            "documentIndex": document_index_href,
            "archive": {
                "name": archive_path.name,
                "href": archive_href,
                "sourcePath": str(archive_path),
            },
            "stages": stages,
        },
        "fields": fields,
        "recordPatch": record_patch,
    }

    write_json(run_root / "analysis-result.json", result)
    write_json(run_root / "stages.json", stages)

    return {
        "ok": True,
        "runId": run_id,
        "stages": stages,
        "result": result,
    }


def stage(name: str, status: str, payload: dict | None = None) -> dict:
    return {
        "name": name,
        "status": status,
        "at": now_iso(),
        "payload": payload or {},
    }


def unpack_archive(archive_path: Path, extracted_dir: Path) -> list[dict]:
    inventory = []

    if archive_path.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extracted_dir)
    else:
        shutil.copy2(archive_path, extracted_dir / archive_path.name)

    for file_path in sorted(path for path in extracted_dir.rglob("*") if path.is_file()):
        inventory.append(
            {
                "path": str(file_path),
                "relativePath": file_path.relative_to(extracted_dir).as_posix(),
                "name": file_path.name,
                "extension": file_path.suffix.lower(),
                "sizeBytes": file_path.stat().st_size,
            }
        )

    write_json(extracted_dir.parent / "inventory.json", inventory)
    return inventory


def normalize_documents(inventory: list[dict], normalized_dir: Path, tables_dir: Path) -> list[dict]:
    documents = []

    for index, item in enumerate(inventory, start=1):
        source_path = Path(item["path"])
        text = extract_text(source_path)
        doc_id = f"doc-{index:03d}"
        md_path = normalized_dir / f"{doc_id}.md"
        md = build_md_document(doc_id, item, text)
        md_path.write_text(md, "utf-8")

        documents.append(
            {
                "id": doc_id,
                "name": item["name"],
                "relativePath": item["relativePath"],
                "sourcePath": item["path"],
                "extension": item["extension"],
                "sizeBytes": item["sizeBytes"],
                "mdPath": str(md_path),
                "mdHref": artifact_href(md_path),
                "text": text,
            }
        )

    return documents


def build_md_document(doc_id: str, item: dict, text: str) -> str:
    frontmatter = {
        "id": doc_id,
        "source_name": item["name"],
        "source_path": item["relativePath"],
        "extension": item["extension"],
        "size_bytes": item["sizeBytes"],
    }
    return f"---\n{json.dumps(frontmatter, ensure_ascii=False, indent=2)}\n---\n\n{text.strip()}\n"


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".docx":
        return extract_docx_text(path)

    if suffix == ".xlsx":
        return extract_xlsx_text(path)

    if suffix == ".pdf":
        return extract_pdf_text(path)

    if suffix in {".txt", ".md", ".csv"}:
        return path.read_text("utf-8", errors="ignore")

    return f"[binary document: {path.name}]"


def extract_pdf_text(path: Path) -> str:
    if PdfReader is None:
        return f"[pdf text extraction unavailable: {path.name}]"

    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            pages.append(text.strip())

    return "\n\n".join(pages).strip() or f"[empty pdf document: {path.name}]"


def extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as docx:
        xml = docx.read("word/document.xml")

    root = ET.fromstring(xml)
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []

    for paragraph in root.iter(ns + "p"):
        texts = [node.text or "" for node in paragraph.iter(ns + "t")]
        line = "".join(texts).strip()
        if line:
            paragraphs.append(line)

    return "\n".join(paragraphs)


def extract_xlsx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as workbook:
        shared_strings = read_xlsx_shared_strings(workbook)
        sheet_names = sorted(name for name in workbook.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name))
        lines = []
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

        for sheet_name in sheet_names:
            root = ET.fromstring(workbook.read(sheet_name))
            lines.append(f"## {Path(sheet_name).stem}")

            for row in root.iter(ns + "row"):
                values = [read_xlsx_cell_value(cell, shared_strings) for cell in row.findall(ns + "c")]
                values = [value for value in values if value]
                if values:
                    lines.append(" | ".join(values))

    text = "\n".join(line for line in lines if line.strip()).strip()
    return text or f"[empty xlsx document: {path.name}]"


def read_xlsx_shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []

    root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    strings = []

    for item in root.iter(ns + "si"):
        texts = [node.text or "" for node in item.iter(ns + "t")]
        strings.append("".join(texts))

    return strings


def read_xlsx_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(ns + "t")).strip()

    value_node = cell.find(ns + "v")
    if value_node is None or value_node.text is None:
        return ""

    value = value_node.text.strip()
    if cell_type == "s" and value.isdigit():
        index = int(value)
        return shared_strings[index].strip() if index < len(shared_strings) else ""

    return value


def classify_documents(documents: list[dict]) -> list[dict]:
    classified = []

    for document in documents:
        name_path = f"{document['relativePath']}\n{document['name']}".lower()
        text_lower = document["text"].lower()
        haystack = f"{name_path}\n{text_lower}"
        doc_type = "other"
        confidence = 0.35

        if "сроки" in name_path and "подачи заявок" in haystack:
            doc_type = "tender_schedule"
            confidence = 0.9
        elif "извещение" in name_path or "izvesh" in name_path:
            doc_type = "notice"
            confidence = 0.9
        elif "форма ответа" in name_path or "форма" in name_path or "formy" in name_path:
            doc_type = "submission_form"
            confidence = 0.65
        elif "запрос кп" in haystack or "запрос коммерческих предложений" in haystack or "закупочная процедура" in haystack or ("текст объявления" in haystack and "предметом конкурса" in haystack):
            doc_type = "procurement_documentation"
            confidence = 0.9
        elif "документация" in name_path and "закуп" in haystack:
            doc_type = "procurement_documentation"
            confidence = 0.9
        elif "нмц" in name_path or "обоснование" in name_path:
            doc_type = "price_justification"
            confidence = 0.85
        elif "техническое задание" in name_path or re.search(r"(^|[/\\\s])тз($|[/\\\s])", name_path) or re.search(r"(^|[/\\\s])tz[-_/\\\s]", name_path) or "требования к работам" in name_path:
            doc_type = "technical_specification"
            confidence = 0.9
        elif "календарный план" in name_path or "дорожная карта" in name_path or "kalendarn" in name_path:
            doc_type = "work_schedule"
            confidence = 0.85
        elif "обеспечение исполнения договора" in name_path:
            doc_type = "contract_security"
            confidence = 0.8
        elif "договор" in name_path or "dogovor" in name_path:
            doc_type = "contract_draft"
            confidence = 0.75
        elif re.search(r"критери[^\n]*(?:оцен|выбор|отбор)|максимальн\w*\s+балл", name_path) or "задание на прототип" in name_path:
            doc_type = "selection_criteria"
            confidence = 0.7
        elif "техническое задание" in text_lower:
            doc_type = "technical_specification"
            confidence = 0.75
        elif "обеспечение исполнения договора" in text_lower:
            doc_type = "contract_security"
            confidence = 0.65
        elif re.search(r"критери[^\n]*(?:оцен|выбор|отбор)|максимальн\w*\s+балл", text_lower):
            doc_type = "selection_criteria"
            confidence = 0.65

        classified.append(
            {
                "id": document["id"],
                "name": document["name"],
                "relativePath": document["relativePath"],
                "sourcePath": document["sourcePath"],
                "mdPath": document["mdPath"],
                "mdHref": document.get("mdHref", ""),
                "type": doc_type,
                "confidence": confidence,
                "summary": summarize(document["text"]),
            }
        )

    return classified


def build_record_patch(classified: list[dict], hints: dict, document_index_href: str = "") -> tuple[dict, dict]:
    primary = pick_document(classified, ["procurement_documentation", "notice", "technical_specification"])
    schedule = pick_document(classified, ["tender_schedule"], fallback_first=False)
    specification = pick_document(classified, ["technical_specification", "procurement_documentation"], fallback_first=False)
    price_doc = pick_document(classified, ["price_justification", "procurement_documentation"], fallback_first=False)
    contract = pick_document(classified, ["contract_draft"], fallback_first=False)
    security_doc = pick_document(classified, ["contract_security"], fallback_first=False)
    work_schedule = pick_document(classified, ["work_schedule"], fallback_first=False)

    primary_text = read_document_text(primary)
    schedule_text = read_document_text(schedule)
    specification_text = read_document_text(specification)
    price_text = read_document_text(price_doc)
    contract_text = read_document_text(contract)
    security_text = read_document_text(security_doc)
    work_schedule_text = read_document_text(work_schedule)
    combined_text = "\n".join([primary_text, schedule_text, specification_text, price_text, contract_text, security_text, work_schedule_text])

    service_name = extract_after_label(primary_text, "Наименование услуг")
    subject = service_name or extract_subject(primary_text) or extract_subject(specification_text)
    customer = extract_customer(primary_text or combined_text)
    execution_term = extract_execution_term(specification_text, contract_text, work_schedule_text, primary_text)
    contract_term = extract_contract_term(primary_text, contract_text) or execution_term
    payment_terms = extract_after_label(contract_text, "Условия оплаты") or extract_inline_value(primary_text, "Платежные условия договора") or first_line_containing(contract_text, "оплат")
    work_order = extract_after_label(specification_text, "Порядококазания услуг") or extract_after_label(specification_text, "Порядок оказания услуг")
    requirements = extract_requirements(specification_text or primary_text)
    deadline_at = extract_deadline(schedule_text or primary_text)
    nmc = extract_nmc(price_text or primary_text)
    platform_payment = extract_platform_payment(primary_text)
    application_security = extract_application_security(primary_text)
    contract_security = extract_contract_security(primary_text, nmc) or extract_contract_security(security_text, nmc)
    purchase_by = extract_purchase_by(primary_text or combined_text)
    retrade = extract_retrade(primary_text)

    title_hint = str(hints.get("title") or "").strip()
    title = subject or title_hint or primary.get("name") or "Проект без названия"
    short_title = title[:120]
    md_href = primary.get("mdHref") or primary.get("mdPath", "")
    spec_href = specification.get("mdHref") or specification.get("mdPath", "") or md_href
    requirements_href = md_href
    criteria_doc = pick_document(classified, ["selection_criteria"], fallback_first=False)
    criteria_href = criteria_doc.get("mdHref") or criteria_doc.get("mdPath", "")
    if not criteria_href:
        criteria_href = md_href if primary.get("type") in {"notice", "procurement_documentation"} else spec_href

    criteria_rows = []
    for req in requirements[:8]:
        criteria_rows.append(
            {
                "group": "hardRequirements",
                "title": req[:120],
                "description": req,
                "kind": "критерий",
                "note": "Из технического задания",
            }
        )

    notes_parts = []
    if payment_terms:
        notes_parts.append(f"Условия оплаты: {payment_terms}")
    if work_order:
        notes_parts.append(f"Порядок оказания услуг: {work_order}")

    patch = {
        "projectTitle": title_hint or title,
        "title": title,
        "shortTitle": short_title,
        "deadlineAt": deadline_at,
        "customer": customer,
        "purchaseBy": purchase_by,
        "overallExecutionTerm": execution_term,
        "nmc": nmc or "Не указано в документах",
        "platformPayment": platform_payment or "Не указано в документах",
        "applicationSecurity": application_security or "-",
        "contractSecurity": contract_security or "-",
        "contractTerm": contract_term,
        "retrade": retrade,
        "antiDumpingMeasures": "Да" if "антидемпингов" in primary_text.lower() else "Нет",
        "creative": "Нет",
        "requirementsDocumentUrl": requirements_href,
        "technicalSpecificationUrl": spec_href,
        "criteriaDocumentUrl": criteria_href,
        "criteriaRows": criteria_rows,
        "notes": "\n".join(notes_parts),
        "summary": summarize(primary_text),
        "workflow": {
            "analysis": {
                "status": "completed",
                "service": "scoring-analysis",
                "documentIndex": document_index_href,
            }
        },
    }

    fields = {
        "general": pick_keys(patch, ["title", "shortTitle", "deadlineAt", "customer", "purchaseBy", "overallExecutionTerm"]),
        "amounts": pick_keys(patch, ["nmc", "platformPayment", "applicationSecurity", "contractSecurity"]),
        "tender": pick_keys(patch, ["retrade", "antiDumpingMeasures", "creative", "notes", "criteriaRows"]),
        "documents": classified,
    }

    return patch, fields


def pick_document(classified: list[dict], types: list[str], fallback_first: bool = True) -> dict:
    by_type = {doc_type: index for index, doc_type in enumerate(types)}
    candidates = [document for document in classified if document.get("type") in by_type]
    if not candidates:
        return classified[0] if fallback_first and classified else {}
    return sorted(candidates, key=lambda document: (by_type[document.get("type")], -float(document.get("confidence") or 0)))[0]


def read_document_text(document: dict) -> str:
    if not document or not document.get("mdPath"):
        return ""

    md_text = Path(document["mdPath"]).read_text("utf-8", errors="ignore")
    return re.sub(r"^---.*?---", "", md_text, flags=re.S).strip()


def extract_after_label(text: str, label: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    lower_label = label.lower()

    for index, line in enumerate(lines):
        if line.lower() == lower_label or lower_label in line.lower():
            for candidate in lines[index + 1 : index + 6]:
                if not re.fullmatch(r"\d+", candidate):
                    return candidate

    return ""


def extract_inline_value(text: str, label: str) -> str:
    pattern = rf"{re.escape(label)}\s*[-–—:]\s*([^\n]+)"
    match = re.search(pattern, text, flags=re.I)
    return match.group(1).strip(" .") if match else ""


def extract_subject(text: str) -> str:
    subject = extract_inline_value(text, "Предмет договора")
    if subject:
        return subject

    subject = extract_inline_value(text, "Предмет закупки")
    if subject:
        return subject

    match = re.search(
        r"предмету?\s*:\s*(.+?)(?:\n(?:Полная информация|Цель|Сроки|1\.\d+\.|Наименование информационной системы)|$)",
        text,
        flags=re.I | re.S,
    )
    if match:
        return clean_spaces(match.group(1)).strip(" .")

    match = re.search(r"(Выполнение работ[^\n]+)", text, flags=re.I)
    if match:
        return clean_spaces(match.group(1)).strip(" .")

    match = re.search(r"по выбору партнера на ([^\n.]+)", text, flags=re.I)
    if match:
        return match.group(1).strip(" .")

    return first_line_containing(text, "Внедрение")


def extract_customer(text: str) -> str:
    customer_match = re.search(
        r"Заказчик:\s*(.+?)(?:\n(?:Место|ИНН|Адрес|Номер|ФИО|1\.2\.|Предмет)|$)",
        text,
        flags=re.I | re.S,
    )
    if customer_match:
        return clean_spaces(customer_match.group(1)).strip(" .")

    match = re.search(r"(АО\s+«[^»]+»)", text)
    if match:
        return match.group(1)
    match = re.search(r"(ООО\s+«[^»]+»)", text)
    if match:
        return match.group(1)
    match = re.search(r"(Акционерное общество\s+«[^»]+»)", text)
    if match:
        return match.group(1)
    match = re.search(r"наименование:\s*([^;\n]+)", text, flags=re.I)
    if match:
        return match.group(1).strip()
    return "ООО «МРИЯ»" if "МРИЯ" in text else ""


def extract_purchase_by(text: str) -> str:
    status_line = ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        if line.lower().startswith("закупка проводится"):
            status_line = " ".join(lines[index : index + 4])
            break

    if not status_line:
        for index, line in enumerate(lines):
            lowered = line.lower()
            if lowered == "правовой статус закупки":
                status_line = " ".join(lines[index : index + 6])
                break

    source = status_line or text
    lowered_source = source.lower()
    if "не подпада" in lowered_source and re.search(r"44\W*фз", source, flags=re.I) and re.search(r"223\W*фз", source, flags=re.I):
        return "Коммерческая закупка"
    if "запрос коммерческих предложений" in lowered_source:
        return "Коммерческая закупка"

    if re.search(r"223\W*фз", source, flags=re.I):
        return "223-ФЗ / Положение о закупке"

    if re.search(r"44\W*фз", source, flags=re.I):
        return "44-ФЗ"

    if re.search(r"коммерческ", source, flags=re.I) or "основными принципами организации закупок" in lowered_source or "положением о закупке товаров, работ и услуг еапо" in lowered_source:
        return "Коммерческая закупка"

    return "Нет информации"


def extract_execution_term(specification_text: str, contract_text: str, work_schedule_text: str = "", primary_text: str = "") -> str:
    combined = "\n".join([specification_text, contract_text, work_schedule_text, primary_text])
    if re.search(r"определяется\s+с\s+учетом\s+даты\s+заключения\s+договора\s+и\s+сроков\s+выполнения\s+работ\s+по\s+этапам", combined, flags=re.I):
        return "определяется с учетом даты заключения Договора и сроков выполнения работ по этапам"

    date_range = re.search(r"с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})", combined, flags=re.I)
    if date_range:
        start, finish = date_range.groups()
        return f"с {start} по {finish}"

    schedule_term = extract_latest_schedule_date(work_schedule_text)
    if schedule_term:
        return schedule_term

    for text in [specification_text, contract_text, primary_text]:
        value = extract_after_label(text, "Сроки оказания услуг") or extract_after_label(text, "Срок выполнения работ")
        if value:
            return value

    match = re.search(r"(не более\s+\d+\s+(?:месяц|календарн|рабоч)[^\n.]*[.\n])", specification_text + "\n" + contract_text, flags=re.I)
    return match.group(1).strip() if match else ""


def extract_contract_term(primary_text: str, contract_text: str) -> str:
    return extract_inline_value(primary_text, "Срок заключения договора") or extract_inline_value(contract_text, "Срок заключения договора")


def extract_latest_schedule_date(text: str) -> str:
    dates = []
    for match in re.finditer(r"\b(\d{2})\.(\d{2})\.(\d{4})\b", text):
        day, month, year = match.groups()
        try:
            dates.append(datetime(int(year), int(month), int(day)))
        except ValueError:
            continue

    for match in re.finditer(r"\b([34]\d{4}|5\d{4})\b", text):
        serial = int(match.group(1))
        if 30000 <= serial <= 60000:
            dates.append(datetime(1899, 12, 30) + timedelta(days=serial))

    if not dates:
        return ""

    latest = max(dates)
    return f"до {latest.strftime('%d.%m.%Y')}"


def extract_deadline(text: str) -> str | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        if "окончание срока подачи заявок" in line.lower():
            for candidate in lines[index + 1 : index + 4]:
                match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?", candidate)
                if match:
                    day, month, year, hour, minute = match.groups()
                    return f"{year}-{month}-{day}T{hour or '00'}:{minute or '00'}:00+03:00"

    range_match = re.search(
        r"по\s+«?(\d{1,2})»?\s+([а-яё]+)\s+(\d{4})\s*г\.\s*\(до\s+(\d{1,2}):(\d{2})\)",
        text,
        flags=re.I,
    )
    if range_match:
        day, month_name, year, hour, minute = range_match.groups()
        month = RUSSIAN_MONTHS.get(month_name.lower())
        if month:
            return f"{year}-{month}-{int(day):02d}T{int(hour):02d}:{minute}:00+03:00"

    return None


def extract_nmc(text: str) -> str:
    return extract_money_near(text, ["начальной", "максимальной", "нмц"])


def extract_platform_payment(text: str) -> str:
    lowered = text.lower()
    if "росэлторг" in lowered:
        return "подача через Росэлторг"
    if "только через систему bidzaar" in lowered or "через систему bidzaar" in lowered:
        return "подача через bidzaar"
    if "почтовым отправлением" in lowered or "доставлена заказчику курьером" in lowered:
        return "подача по почте"
    return ""


def extract_application_security(text: str) -> str:
    lowered = text.lower()
    if "обеспечение заявки" not in lowered and "обеспечение заявок" not in lowered:
        return ""
    return extract_money_near(text, ["обеспечение заявки", "обеспечение заявок"])


def extract_retrade(text: str) -> str:
    lowered = text.lower()
    if "изменить свою заявку" in lowered and "до истечения срока подачи заявок" in lowered:
        return "Возможна"
    if "дополнительное ценовое предложение" in lowered or "переторж" in lowered or "улучшенные коммерческие предложения" in lowered:
        return "Возможна"
    return "Нет"


def extract_money_near(text: str, tokens: list[str]) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    money_pattern = re.compile(r"(?:\d[\d\s\u00a0]{4,}(?:,\d{2})?|\d{5,})\s*(?:рублей|руб\.?)?", re.I)

    for index, line in enumerate(lines):
        lower = line.lower()
        if any(token in lower for token in tokens):
            window = " ".join(lines[index : index + 8])
            match = money_pattern.search(window)
            if match:
                return normalize_money(match.group(0))

    return ""


def normalize_money(value: str) -> str:
    value = re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()
    if re.fullmatch(r"\d{5,}", value):
        value = f"{int(value):,}".replace(",", " ")
    return value if re.search(r"руб", value, flags=re.I) else f"{value} руб."


def clean_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def extract_contract_security(text: str, nmc: str) -> str:
    lowered = text.lower()
    if "обеспечени" not in lowered or "договор" not in lowered:
        return ""

    if re.search(r"составляет\s+_+\s*руб", text, flags=re.I):
        return ""

    percent_match = re.search(r"обеспечени[ея][^.\n]{0,100}?договора[^.\n]*?размере\s+(\d+)\s*%", text, flags=re.I | re.S)
    if percent_match:
        return f"{percent_match.group(1)}% от НМЦ" + (f" ({nmc})" if nmc else "")

    money_match = re.search(r"обеспечени[ея][^.\n]{0,100}?договора[^.\n]*?(\d[\d\s\u00a0]{2,}(?:,\d{2})?\s*(?:рублей|руб\.?))", text, flags=re.I | re.S)
    return normalize_money(money_match.group(1)) if money_match else ""


def extract_requirements(text: str) -> list[str]:
    lines = [line.strip(" -;") for line in text.splitlines() if line.strip()]
    selected = []

    for line in lines:
        if any(token in line.lower() for token in ["реализованы", "настроены", "разработан", "передан", "система работает", "интеграц"]):
            if len(line) > 30:
                selected.append(line)

    return selected


def first_line_containing(text: str, token: str) -> str:
    token_lower = token.lower()
    for line in text.splitlines():
        clean = line.strip()
        if token_lower in clean.lower() and len(clean) > 10:
            return clean
    return ""


def summarize(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if len(line.strip()) > 20]
    return " ".join(lines[:3])[:700]


def pick_keys(source: dict, keys: list[str]) -> dict:
    return {key: source.get(key) for key in keys if key in source}


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def artifact_href(path_or_run_id, relative_path: str | None = None) -> str:
    if relative_path is not None:
        relative = f"{path_or_run_id}/{relative_path}"
        return f"http://127.0.0.1:{DEFAULT_PORT}/artifacts/{relative.replace(os.sep, '/')}"

    path = Path(path_or_run_id).resolve()
    relative = path.relative_to(RUNS_ROOT.resolve()).as_posix()
    return f"http://127.0.0.1:{DEFAULT_PORT}/artifacts/{relative}"


def main() -> None:
    RUNS_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", DEFAULT_PORT), AnalysisHandler)
    print(f"scoring-analysis listening on http://127.0.0.1:{DEFAULT_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
