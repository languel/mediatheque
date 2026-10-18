"""Optical flow / motion energy analyzer: estimates motion curve, speed tags, and camera stability."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import numpy as np

KINDS = ["video", "animation"]
VERSION = "1.0"
MODEL = "ffmpeg-rawgray-flow"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    media_rel = item.get("files", {}).get("media", {}).get("path")
    target = (item_dir / media_rel) if media_rel and (item_dir / media_rel).exists() else source_file
    if not target.exists():
        return {"skipped": True}

    w, h = 64, 64
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(target),
        "-vf",
        f"fps=5,scale={w}:{h}:flags=bilinear,format=gray",
        "-vframes",
        "100",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
    res = subprocess.run(cmd, capture_output=True, check=False)
    buf = res.stdout
    frame_bytes = w * h
    n_frames = len(buf) // frame_bytes
    if n_frames < 2:
        return {"skipped": True}

    frames = np.frombuffer(buf[: n_frames * frame_bytes], dtype=np.uint8).reshape(n_frames, h, w).astype(np.float32)
    diffs = np.abs(frames[1:] - frames[:-1])
    mean_energy = diffs.mean(axis=(1, 2))

    # Compare border ring motion (camera pan/zoom indicator) vs center motion
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[:8, :] = True
    border_mask[-8:, :] = True
    border_mask[:, :8] = True
    border_mask[:, -8:] = True
    border_energy = float(diffs[:, border_mask].mean())
    center_energy = float(diffs[:, ~border_mask].mean())
    overall_energy = float(mean_energy.mean())

    measured_tags: list[str] = []
    proposed_tags: list[str] = []

    if overall_energy < 1.2:
        proposed_tags.append("still")
    else:
        measured_tags.append("movement")
        if overall_energy < 6.5:
            measured_tags.append("slow")
        elif overall_energy > 14.0:
            measured_tags.append("fast")

    if border_energy < 3.5 and border_energy <= center_energy * 0.85:
        if "static-camera" not in item.get("tags", []):
            measured_tags.append("static-camera")
    elif border_energy > 8.5:
        proposed_tags.append("moving-camera")

    # Normalize motion curve to 16 bins for clip picking
    bins = min(16, len(mean_energy))
    splits = np.array_split(mean_energy, bins)
    curve = [round(float(s.mean()), 2) for s in splits]

    return {
        "measured_tags": measured_tags,
        "measured_fields": {"motion_curve": curve},
        "proposals": {
            "tags": proposed_tags,
            "mean_motion": round(overall_energy, 2),
            "border_motion": round(border_energy, 2),
        },
        "confidence": 0.85,
    }
