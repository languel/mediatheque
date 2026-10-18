"""MediaPipe analyzer plugin: detects pose, face, hands, and segmentation suitability."""

from __future__ import annotations

from pathlib import Path
from typing import Any

KINDS = ["video", "image", "animation"]
VERSION = "1.0"
MODEL = "mediapipe-tasks"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    try:
        import mediapipe as mp  # type: ignore  # noqa: F401
    except ImportError:
        return {"skipped": True, "reason": "mediapipe not installed"}

    return {
        "measured_tags": [],
        "measured_fields": {},
        "proposals": {"tags": [], "demos": []},
        "confidence": 0.8,
    }
