"""Scenes analyzer: ffmpeg scene change & audio silence detection for clip proposals and cut tags."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

KINDS = ["video", "audio"]
VERSION = "1.0"
MODEL = "ffmpeg-scene+silence"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    kind = item.get("kind", "")
    media_rel = item.get("files", {}).get("media", {}).get("path")
    target = (item_dir / media_rel) if media_rel and (item_dir / media_rel).exists() else source_file
    duration = float(item.get("files", {}).get("media", {}).get("duration") or 0.0)

    measured_tags: list[str] = []
    proposals: dict[str, Any] = {}

    if kind == "video":
        cuts = detect_video_scenes(target, threshold=0.3)
        if cuts:
            measured_tags.append("cuts")
        else:
            measured_tags.append("static-camera")
        proposed_clips = build_clip_proposals(cuts, duration, min_clip_len=2.0)
        if proposed_clips:
            proposals["clips"] = proposed_clips
            proposals["scene_cuts"] = [round(t, 2) for t in cuts]

    elif kind == "audio":
        silences = detect_audio_silences(target)
        proposed_clips = build_clip_proposals(silences, duration, min_clip_len=2.0)
        if proposed_clips:
            proposals["clips"] = proposed_clips
            proposals["silence_splits"] = [round(t, 2) for t in silences]

    return {
        "measured_tags": measured_tags,
        "measured_fields": {},
        "proposals": proposals,
        "confidence": 0.85,
    }


def detect_video_scenes(video_path: Path, threshold: float = 0.3) -> list[float]:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(video_path),
        "-vf",
        f"select='gt(scene,{threshold})',showinfo",
        "-f",
        "null",
        "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (res.stderr or "") + (res.stdout or "")
    times: list[float] = []
    for m in re.finditer(r"pts_time:([0-9.]+)", output):
        try:
            t = float(m.group(1))
            if not times or (t - times[-1]) >= 1.0:
                times.append(t)
        except ValueError:
            pass
    return times


def detect_audio_silences(audio_path: Path) -> list[float]:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(audio_path),
        "-af",
        "silencedetect=noise=-32dB:d=0.4",
        "-f",
        "null",
        "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (res.stderr or "") + (res.stdout or "")
    midpoints: list[float] = []
    starts: list[float] = []
    for line in output.splitlines():
        m_start = re.search(r"silence_start:\s*([0-9.]+)", line)
        if m_start:
            starts.append(float(m_start.group(1)))
        m_end = re.search(r"silence_end:\s*([0-9.]+)", line)
        if m_end and starts:
            s = starts.pop(0)
            e = float(m_end.group(1))
            midpoints.append((s + e) / 2.0)
    return midpoints


def build_clip_proposals(
    split_times: list[float],
    duration: float,
    min_clip_len: float = 2.0,
    fallback_segment: bool = False,
) -> list[dict[str, Any]]:
    if duration <= 0:
        return []
    points = [0.0] + [t for t in sorted(split_times) if 0.5 < t < (duration - 0.5)] + [duration]

    # When fallback_segment is requested (e.g., `ingest.py --clips <id>` on a single-shot early film),
    # divide into ~4–8s segments if no hard scene cuts were found.
    if len(points) == 2 and fallback_segment and duration >= 6.0:
        n_segs = max(2, min(6, int(round(duration / 6.0))))
        step = duration / n_segs
        points = [round(i * step, 2) for i in range(n_segs)] + [round(duration, 2)]

    if len(points) <= 2:
        return []

    clips: list[dict[str, Any]] = []
    cur_in = points[0]
    n = 1
    for pt in points[1:]:
        if (pt - cur_in) < min_clip_len and pt < duration:
            continue
        clips.append(
            {
                "n": n,
                "title": f"Clip {n:02d} ({cur_in:.1f}s–{pt:.1f}s)",
                "summary": f"Segment {n} from {cur_in:.1f}s to {pt:.1f}s.",
                "tags": [],
                "demos": [],
                "in": round(cur_in, 2),
                "out": round(pt, 2),
                "file": f"clips/{n:02d}.webm",
                "thumb": f"clips/{n:02d}.thumb.webp",
            }
        )
        cur_in = pt
        n += 1
    return clips
