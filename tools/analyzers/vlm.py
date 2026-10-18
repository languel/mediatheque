"""VLM analyzer plugin: proposes title, summary, description, visual tags, and clip captions."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

KINDS = ["video", "image", "animation", "model", "splat", "vector"]
VERSION = "1.0"
MODEL = "vlm-plugin"
REQUIRES_REMOTE = True


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    if item.get("private"):
        return {"skipped": True, "reason": "private item never sent to remote API"}
    endpoint = os.environ.get("MEDIATHEQUE_VLM_URL")
    if not endpoint:
        return {"skipped": True, "reason": "MEDIATHEQUE_VLM_URL not set"}
    return {"skipped": True}
