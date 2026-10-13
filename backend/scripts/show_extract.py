"""Spike BE-4.3: render try_extract.py outputs as readable Markdown, next to the JSON.

Usage (from backend/):
    uv run python scripts/show_extract.py .spike/out/*.json
"""

import json
import sys
from pathlib import Path
from typing import Any


def cell(value: Any) -> str:
    if value is None or value == []:
        return "—"
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value)
    return str(value).replace("|", "\\|").replace("\n", " ")


def pick(item: dict[str, Any], *keys: str) -> list[Any]:
    """Row values; the extractor sometimes drops required keys, show that instead of crashing."""
    return [item.get(key, "MISSING") for key in keys]


def table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(cell(v) for v in row) + " |" for row in rows]
    return lines + [""]


def run_summary(out: dict[str, Any]) -> list[str]:
    checks = out.get("checks", {})
    usage = out.get("usage") or {}
    lines = [
        f"# {out['kind'].upper()} · {out['file']} · tier `{out['tier']}`",
        "",
        f"- Prompt `{out['prompt_version']}`, schema `{out['schema_version']}`",
        f"- Status {out.get('status')} in **{out.get('seconds')} s**, "
        f"credits {usage.get('credits')} (parse {usage.get('parse_credits')}, "
        f"extract {usage.get('extract_credits')})",
        f"- Valid against Pydantic schema: {out.get('pydantic_valid')}",
        f"- Cleanup on LlamaCloud: {out.get('cleanup')}",
    ]
    if "fields_found_verbatim_in_source" in checks:
        lines += [
            f"- Text fields found verbatim in the document: "
            f"{checks['fields_found_verbatim_in_source']}/{checks['string_fields']}",
            f"- Citations: {checks['citations_text_matching_source']}/"
            f"{checks['citations_with_text']} match the document text, "
            f"{checks['citations_with_path_instead_of_text']} carry no text",
        ]
        missing = checks.get("fields_not_found_in_source") or []
        if missing:
            lines += ["", "**Not found verbatim in the document:**", ""]
            lines += [f"- `{m['path']}`: {m['value']}" for m in missing]
    return lines + [""]


def render_cv(d: dict[str, Any]) -> list[str]:
    lines = [
        "## Overview",
        "",
        f"- Headline: {cell(d['headline'])}",
        f"- Stated years: {cell(d['stated_years'])}",
        f"- Language: {d['cv_language']}",
        "",
        f"## Skills ({len(d['skills'])})",
        "",
    ]
    lines += table(
        ["#", "Name", "Source", "Group", "Proficiency", "Years"],
        [
            [i + 1, *pick(s, "name", "source", "group", "proficiency", "years")]
            for i, s in enumerate(d["skills"])
        ],
    )
    lines += [f"## Experiences ({len(d['experiences'])})", ""]
    for i, e in enumerate(d["experiences"]):
        lines += [
            f"### {i + 1}. [{e.get('kind')}] {e.get('name', 'MISSING')}",
            "",
            f"- Organization: {cell(e['organization'])} · Role: {cell(e['role'])}",
            f"- Period: {cell(e['period'])} ({cell(e['start'])} → {cell(e['end'])}, "
            f"current: {e['is_current']}) · Team size: {cell(e['team_size'])}",
            f"- Technologies: {cell(e.get('technologies', 'MISSING KEY'))}",
            "",
        ]
        lines += table(
            ["Kind", "Text (verbatim)", "Statement", "Metric", "Subject"],
            [pick(h, "kind", "text", "statement", "metric", "subject") for h in e["highlights"]],
        )
    lines += ["## Seniority signals", ""]
    lines += table(["Kind", "Text"], [pick(s, "kind", "text") for s in d["seniority_signals"]])
    lines += ["## Education", ""]
    lines += table(
        ["Institution", "Degree", "Major", "Period"],
        [pick(e, "institution", "degree", "major", "period") for e in d["education"]],
    )
    lines += ["## Credentials", ""]
    lines += table(
        ["Kind", "Name", "Issuer", "Year"],
        [pick(c, "kind", "name", "issuer", "year") for c in d["credentials"]],
    )
    lines += ["## Languages", ""]
    lines += table(["Name", "Level"], [pick(x, "name", "level") for x in d["languages"]])
    return lines


def render_jd(d: dict[str, Any]) -> list[str]:
    lines = [
        "## Overview",
        "",
        f"- Company: {cell(d['company'])} · Position: {cell(d['position'])}",
        f"- Stated level: {cell(d['stated_level'])} · Years required: {cell(d['years_required'])}",
        f"- Domain: {cell(d['domain'])} · Language: {d['jd_language']}",
        f"- Level signals: {cell(d['level_signals'])}",
        "",
        f"## Requirements ({len(d['requirements'])})",
        "",
    ]
    # Group by source bullet so it is easy to see how each bullet was split.
    bullets: dict[str, list[dict[str, Any]]] = {}
    for r in d["requirements"]:
        bullets.setdefault(r["text"], []).append(r)
    for n, (text, reqs) in enumerate(bullets.items(), 1):
        lines += [f"**Bullet {n}** → {len(reqs)} requirement(s)", "", f"> {text}", ""]
        lines += table(
            ["Name", "Kind", "Importance"],
            [pick(r, "name", "kind", "importance") for r in reqs],
        )
    lines += [f"## Responsibilities ({len(d['responsibilities'])})", ""]
    lines += [f"{i + 1}. {r['text']}" for i, r in enumerate(d["responsibilities"])]
    return lines


def main() -> None:
    for arg in sys.argv[1:]:
        path = Path(arg)
        out = json.loads(path.read_text("utf-8"))
        data = out.get("data")
        lines = run_summary(out)
        if data:
            lines += render_cv(data) if out["kind"] == "cv" else render_jd(data)
        md = path.with_suffix(".md")
        md.write_text("\n".join(lines) + "\n", "utf-8")
        print("wrote", md)


if __name__ == "__main__":
    main()
