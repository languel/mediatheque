"""Text analyzer: language detection, form tags, and summary extraction."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

KINDS = ["text"]
VERSION = "1.0"
MODEL = "heuristic-text"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    if not source_file.exists():
        return {"skipped": True}
    content = source_file.read_text(encoding="utf-8", errors="replace")
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    first_para = next((ln.lstrip("# ").strip() for ln in lines if not ln.startswith("---")), "")

    # Simple stopword-based language hint
    lower = content.lower()
    lang = "en"
    if len(re.findall(r"\b(le|la|les|des|une|dans|avec)\b", lower)) > 5:
        lang = "fr"
    elif len(re.findall(r"\b(der|die|das|und|nicht|ein)\b", lower)) > 5:
        lang = "de"

    proposed_tags = ["text-content"]
    stem = source_file.stem.lower()
    if "manifesto" in stem or "manifeste" in lower:
        proposed_tags.append("manifesto")
    elif "lyric" in stem or "transcript" in stem:
        proposed_tags.append("transcript")
    elif "poem" in stem or (len(lines) > 4 and max((len(l) for l in lines), default=0) < 60):
        proposed_tags.append("poem")
    elif "score" in stem:
        proposed_tags.append("score")

    return {
        "measured_tags": [],
        "measured_fields": {"language": lang},
        "proposals": {
            "tags": proposed_tags,
            "summary": first_para[:160] if first_para else item.get("summary", ""),
        },
        "confidence": 0.85,
    }
