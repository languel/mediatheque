"""Object detector analyzer plugin (YOLO / Florence / OWL)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

KINDS = ["video", "image", "animation"]
VERSION = "1.0"
MODEL = "detector-plugin"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    return {"skipped": True, "reason": "detector model not configured"}
