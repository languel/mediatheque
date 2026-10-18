"""Audio analyzer: signal energy, silence, stereo/mono, onset BPM estimation, and waveform rendering."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

KINDS = ["audio", "video"]
VERSION = "1.0"
MODEL = "ffmpeg-pcm+onset-bpm"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    kind = item.get("kind", "")
    media_rel = item.get("files", {}).get("media", {}).get("path")
    target = (item_dir / media_rel) if media_rel and (item_dir / media_rel).exists() else source_file
    if not target.exists():
        return {"skipped": True}

    # Check if an audio stream exists
    probe_cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=channels,sample_rate",
        "-of",
        "json",
        str(target),
    ]
    res = subprocess.run(probe_cmd, capture_output=True, text=True, check=False)
    streams = []
    if res.returncode == 0 and res.stdout.strip():
        try:
            streams = json.loads(res.stdout).get("streams", [])
        except Exception:
            streams = []

    if not streams:
        if kind == "video":
            return {"measured_tags": ["silent"], "measured_fields": {}, "proposals": {}, "confidence": 1.0}
        return {"skipped": True}

    channels = int(streams[0].get("channels", 1))
    sr = 8000
    pcm_cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(target),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sr),
        "-t",
        "90",
        "-f",
        "s16le",
        "pipe:1",
    ]
    pcm_res = subprocess.run(pcm_cmd, capture_output=True, check=False)
    samples = np.frombuffer(pcm_res.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    if len(samples) < sr // 4:
        return {"measured_tags": ["silent"], "measured_fields": {}, "proposals": {}, "confidence": 0.9}

    rms = float(np.sqrt(np.mean(samples**2)))
    measured_tags: list[str] = []
    measured_fields: dict[str, Any] = {}
    proposed_tags: list[str] = []

    if rms < 0.002:
        measured_tags.append("silent")
        return {
            "measured_tags": measured_tags,
            "measured_fields": measured_fields,
            "proposals": {},
            "confidence": 0.95,
        }

    if kind == "audio":
        if channels == 1:
            measured_tags.append("mono")
        elif channels == 2:
            measured_tags.append("stereo")
        elif channels > 2:
            measured_tags.append("multichannel")

    # Compute amplitude envelope at 50 Hz (hop = 160 samples)
    hop = 160
    n_hops = len(samples) // hop
    if n_hops > 20:
        env = np.sqrt(np.mean(samples[: n_hops * hop].reshape(n_hops, hop) ** 2, axis=1))
        onset = np.maximum(0.0, env[1:] - env[:-1])
        if onset.std() > 1e-5 and len(onset) > 100:
            onset_norm = (onset - onset.mean()) / (onset.std() + 1e-6)
            ac = np.correlate(onset_norm, onset_norm, mode="full")[len(onset_norm) - 1 :]
            # BPM range 60..180 at 50 Hz -> lag 16..50
            min_lag, max_lag = 17, min(50, len(ac) - 1)
            if max_lag > min_lag:
                best_lag = int(min_lag + np.argmax(ac[min_lag:max_lag]))
                bpm = round(60.0 * (50.0 / best_lag), 1)
                peak_strength = float(ac[best_lag] / max(ac[0], 1e-6))
                if peak_strength > 0.18:
                    measured_fields["bpm"] = bpm
                    if kind == "audio":
                        if bpm < 90:
                            measured_tags.append("tempo-slow")
                        elif bpm <= 130:
                            measured_tags.append("tempo-mid")
                        else:
                            measured_tags.append("tempo-fast")
                        if peak_strength > 0.30:
                            proposed_tags.append("steady-beat")

    # Render waveform poster/thumb for audio items if needed
    if kind == "audio":
        poster_path = item_dir / "poster.webp"
        thumb_path = item_dir / "thumb.webp"
        render_waveform(samples, poster_path, width=960, height=540)
        render_waveform(samples, thumb_path, width=480, height=480)

    return {
        "measured_tags": measured_tags,
        "measured_fields": measured_fields,
        "proposals": {"tags": proposed_tags, "rms": round(rms, 4)},
        "confidence": 0.85,
    }


def render_waveform(samples: np.ndarray, out_path: Path, width: int = 480, height: int = 480) -> None:
    im = Image.new("RGB", (width, height), (21, 21, 21))
    draw = ImageDraw.Draw(im)
    mid_y = height // 2
    draw.line([(0, mid_y), (width, mid_y)], fill=(52, 52, 52), width=1)
    if len(samples) > 0:
        bins = width - 48
        chunks = np.array_split(np.abs(samples), bins)
        peaks = np.array([float(np.percentile(c, 92)) if len(c) else 0.0 for c in chunks])
        max_p = max(float(peaks.max()), 1e-4)
        peaks = peaks / max_p
        for i, p in enumerate(peaks):
            x = 24 + i
            half_h = int(max(2, p * (height * 0.38)))
            draw.line([(x, mid_y - half_h), (x, mid_y + half_h)], fill=(232, 230, 224), width=1)
    im.save(out_path, "WEBP", quality=88)
