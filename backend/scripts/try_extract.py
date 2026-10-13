"""Spike BE-4.3: run LlamaExtract on one CV or JD and save everything needed for the report.

Usage (from backend/):
    uv run python scripts/try_extract.py --kind cv --tier agentic .spike/inputs/cv.pdf
    uv run python scripts/try_extract.py --kind jd --tier cost_effective .spike/inputs/jd.txt

Output: .spike/out/<file name>.<tier>.json (data, citations, parsed text, timing, credits,
automatic checks). Not app code: imports only the schema and prompt from `app/`.
"""

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from llama_cloud import LlamaCloud  # noqa: E402
from pypdf import PdfReader  # noqa: E402

from app.prompts import load_prompt  # noqa: E402
from app.schemas.extraction import (  # noqa: E402
    CV_SCHEMA_VERSION,
    JD_SCHEMA_VERSION,
    CvExtraction,
    JdExtraction,
    cv_json_schema,
    jd_json_schema,
)

OUT_DIR = BACKEND_DIR / ".spike" / "out"

KINDS: dict[str, tuple[type[BaseModel], Any, str, str]] = {
    "cv": (CvExtraction, cv_json_schema, "cv_extract", CV_SCHEMA_VERSION),
    "jd": (JdExtraction, jd_json_schema, "jd_extract", JD_SCHEMA_VERSION),
}

# String fields not copied from the document: labels chosen by the extractor, normalized
# dates, and the short restatement of a highlight (allowed to reword by design).
NON_VERBATIM_KEYS = {
    "source",
    "kind",
    "cv_language",
    "jd_language",
    "type",
    "start",
    "end",
    "statement",
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).casefold()
    text = re.sub(r"[*_`#>|•▪●◦\-–—]+", " ", text)  # markdown / bullet marks from parsing
    return re.sub(r"\s+", " ", text).strip()


def string_leaves(node: Any, path: str = "") -> list[tuple[str, str]]:
    """(json path, value) for every non-empty string in the extraction result."""
    if isinstance(node, dict):
        return [
            leaf
            for key, value in node.items()
            if key not in NON_VERBATIM_KEYS
            for leaf in string_leaves(value, f"{path}.{key}" if path else key)
        ]
    if isinstance(node, list):
        return [leaf for i, item in enumerate(node) for leaf in string_leaves(item, f"{path}[{i}]")]
    if isinstance(node, str) and node.strip():
        return [(path, node)]
    return []


def citations(node: Any, path: str = "") -> list[tuple[str, dict[str, Any]]]:
    """(json path, citation entry) for every citation in extract_metadata.document_metadata."""
    found: list[tuple[str, dict[str, Any]]] = []
    if isinstance(node, dict):
        if isinstance(node.get("citation"), list):
            found += [(path, c) for c in node["citation"] if isinstance(c, dict)]
        for key, value in node.items():
            if key != "citation":
                found += citations(value, f"{path}.{key}" if path else key)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            found += citations(item, f"{path}[{i}]")
    return found


def local_text(path: Path) -> str:
    """Text read locally (free), whitespace squeezed: billing for text files is per 600 tokens."""
    if path.suffix.lower() == ".pdf":
        pages = PdfReader(path).pages
        raw = "\n\n".join(page.extract_text(extraction_mode="layout") or "" for page in pages)
    else:
        raw = path.read_text("utf-8")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def check(result: Any, metadata: Any, source_text: str | None) -> dict[str, Any]:
    """Automatic checks; a human still reads the result (report questions 1-8)."""
    leaves = string_leaves(result)
    cites = citations(metadata)
    report: dict[str, Any] = {
        "string_fields": len(leaves),
        "citation_entries": len(cites),
        "cited_paths_sample": sorted({p for p, _ in cites})[:15],
    }
    if source_text is None:
        return report
    src = normalize(source_text)
    not_found = [(p, v) for p, v in leaves if normalize(v) not in src]
    report["fields_found_verbatim_in_source"] = len(leaves) - len(not_found)
    report["fields_not_found_in_source"] = [{"path": p, "value": v} for p, v in not_found]
    # Some citations carry the field path (e.g. "skills.0.source") instead of document text.
    is_path = re.compile(r"[a-z_]+(\.\w+)+")
    placeholder = [(p, c) for p, c in cites if is_path.fullmatch(str(c.get("matching_text")))]
    real = [(p, c) for p, c in cites if not is_path.fullmatch(str(c.get("matching_text")))]
    bad_cites = [
        {"path": p, "matching_text": c.get("matching_text")}
        for p, c in real
        if not c.get("matching_text") or normalize(str(c["matching_text"])) not in src
    ]
    report["citations_with_path_instead_of_text"] = len(placeholder)
    report["citations_with_text"] = len(real)
    report["citations_text_matching_source"] = len(real) - len(bad_cites)
    report["citations_text_not_matching_source"] = bad_cites
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--kind", choices=KINDS, required=True)
    parser.add_argument(
        "--tier", default="agentic", choices=["cost_effective", "agentic", "agentic_plus", "turbo"]
    )
    parser.add_argument("--no-cite", action="store_true", help="disable cite_sources")
    parser.add_argument(
        "--parse-tier",
        choices=["fast", "cost_effective", "agentic", "agentic_plus"],
        help="parse tier (default: same as --tier)",
    )
    parser.add_argument(
        "--as-text",
        action="store_true",
        help="read the text locally and upload it as .txt (no parse cost)",
    )
    parser.add_argument("file", type=Path)
    args = parser.parse_args()

    load_dotenv(BACKEND_DIR / ".env")
    model, schema_fn, prompt_name, schema_version = KINDS[args.kind]
    schema = schema_fn()
    prompt = load_prompt(prompt_name)
    client = LlamaCloud()  # reads LLAMA_CLOUD_API_KEY
    out: dict[str, Any] = {
        "file": args.file.name,
        "kind": args.kind,
        "tier": args.tier,
        "parse_tier_requested": args.parse_tier,
        "as_text": args.as_text,
        "schema_version": schema_version,
        "prompt_version": prompt.version,
        "cleanup": {},
    }

    # Server-side schema check: tells us whether `enum` and nullable anyOf are accepted.
    try:
        validated = client.extract.validate_schema(data_schema=schema).data_schema
        out["schema_validation"] = {"ok": True, "changed_by_server": validated != schema}
    except Exception as e:  # report, then still try the job
        out["schema_validation"] = {"ok": False, "error": str(e)}
    print("schema validation:", out["schema_validation"])

    started = time.monotonic()
    text_input = local_text(args.file) if args.as_text else None
    if text_input is not None:
        out["text_input_chars"] = len(text_input)
        upload: Any = (f"{args.file.stem}.txt", text_input.encode("utf-8"), "text/plain")
    else:
        upload = args.file
    uploaded = client.files.create(file=upload, purpose="extract")
    print("uploaded file:", uploaded.id)
    job = parse_job_id = None
    try:
        job = client.extract.create(
            file_input=uploaded.id,
            configuration={
                "data_schema": schema,
                "tier": args.tier,
                "system_prompt": prompt.text,
                "cite_sources": not args.no_cite,
                "disable_cache": True,  # CV is PII: do not let LlamaCloud reuse/store results
                **({"parse_tier": args.parse_tier} if args.parse_tier else {}),
            },
        )
        print("extract job:", job.id, "- waiting...")
        client.extract.wait_for_completion(job.id, timeout=600)
        detailed = client.extract.get(job.id, expand=["extract_metadata", "usage"])
        out["seconds"] = round(time.monotonic() - started, 1)
        out["status"] = detailed.status
        out["error_message"] = detailed.error_message
        out["usage"] = detailed.usage.model_dump() if detailed.usage else None
        out["job_metadata"] = detailed.metadata.model_dump() if detailed.metadata else None
        out["data"] = detailed.extract_result
        meta = detailed.extract_metadata
        out["extract_metadata"] = meta.model_dump() if meta else None
        print(f"status {detailed.status} in {out['seconds']}s, usage {out['usage']}")

        try:
            model.model_validate(detailed.extract_result)
            out["pydantic_valid"] = True
        except ValidationError as e:
            out["pydantic_valid"] = False
            out["pydantic_errors"] = e.errors(include_url=False, include_input=False)

        # Question 9: the parsed text of the document, to verify quotes in code.
        parse_job_id = meta.parse_job_id if meta else None
        out["parse_tier"] = meta.parse_tier if meta else None
        source_text = text_input
        if parse_job_id and source_text is None:
            try:
                parsed = client.parsing.get(parse_job_id, expand=["text"])
                if parsed.text:
                    source_text = "\n\n".join(page.text for page in parsed.text.pages)
            except Exception as e:
                out["parse_text_error"] = str(e)
        out["source_text"] = source_text
        doc_meta = meta.field_metadata.document_metadata if meta and meta.field_metadata else None
        out["checks"] = check(detailed.extract_result, doc_meta, source_text)
    finally:
        # CV is PII: delete everything we created on LlamaCloud; record what worked.
        for name, delete, ident in [
            ("extract_job", client.extract.delete, job.id if job else None),
            ("parse_job", client.parsing.delete, parse_job_id),
            ("file", client.files.delete, uploaded.id),
        ]:
            if not ident:
                continue
            try:
                delete(ident)
                out["cleanup"][name] = "deleted"
            except Exception as e:
                out["cleanup"][name] = f"failed: {e}"
        print("cleanup:", out["cleanup"])

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        variant = "text" if args.as_text else f"parse-{args.parse_tier or args.tier}"
        path = OUT_DIR / f"{args.file.name}.{args.tier}.{variant}.{prompt.version}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), "utf-8")
        print("saved:", path.relative_to(BACKEND_DIR))

    checks = out.get("checks", {})
    if "fields_found_verbatim_in_source" in checks:
        print(
            f"verbatim: {checks['fields_found_verbatim_in_source']}/{checks['string_fields']} "
            f"string fields found in source; citations matching: "
            f"{checks['citations_text_matching_source']}/{checks['citations_with_text']} "
            f"(+{checks['citations_with_path_instead_of_text']} citations with no text)"
        )


if __name__ == "__main__":
    main()
