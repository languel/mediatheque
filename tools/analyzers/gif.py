"""GIF / animation analyzer: exact frame timing, loop type, palette, dithering, transparency, perceptual hash."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

KINDS = ["animation"]
VERSION = "1.0"
MODEL = "pillow-gif-walk+dhash"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    orig_path = item_dir / "original.gif"
    target = orig_path if orig_path.exists() else source_file
    if not target.exists():
        return {"skipped": True}

    measured_tags: list[str] = []
    measured_fields: dict[str, Any] = {}
    proposals: dict[str, Any] = {"tags": []}

    delays_ms: list[int] = []
    disposals: set[int] = set()
    palette_sizes: list[int] = []
    has_transparency = False
    frames_gray: list[np.ndarray] = []
    dither_scores: list[float] = []

    with Image.open(target) as im:
        n_frames = getattr(im, "n_frames", 1)
        loop_count = im.info.get("loop", 0)
        w, h = im.size

        for idx in range(n_frames):
            im.seek(idx)
            delay = int(im.info.get("duration", 100) or 100)
            delays_ms.append(delay)
            disp = int(getattr(im, "disposal_method", im.info.get("disposal", 0)) or 0)
            disposals.add(disp)

            if "transparency" in im.info or im.mode in ("RGBA", "LA"):
                rgba = im.convert("RGBA")
                if int(np.asarray(rgba)[:, :, 3].min()) < 250:
                    has_transparency = True

            rgb = im.convert("RGB")
            arr_small = np.asarray(rgb.resize((64, 64)), dtype=np.float32)
            gray = arr_small.mean(axis=2)
            frames_gray.append(gray)

            # Sample unique colors and dithering on up to 8 frames
            if idx < 8:
                arr_full = np.asarray(rgb.resize((min(w, 256), min(h, 256))), dtype=np.int32)
                packed = (arr_full[:, :, 0] << 16) | (arr_full[:, :, 1] << 8) | arr_full[:, :, 2]
                palette_sizes.append(int(len(np.unique(packed))))
                # High-frequency alternating neighbor check for dithering
                if arr_full.shape[0] > 4 and arr_full.shape[1] > 4:
                    lum = arr_full.mean(axis=2)
                    dx1 = lum[:, 1:-1] - lum[:, :-2]
                    dx2 = lum[:, 2:] - lum[:, 1:-1]
                    alternating = ((dx1 * dx2) < -4.0).mean()
                    dither_scores.append(float(alternating))

    total_duration_s = round(sum(delays_ms) / 1000.0, 3)
    unique_delays = sorted(set(delays_ms))
    avg_fps = round(n_frames / total_duration_s, 2) if total_duration_s > 0 else 10.0
    max_palette = max(palette_sizes) if palette_sizes else 256

    measured_fields.update(
        {
            "width": w,
            "height": h,
            "frames": n_frames,
            "duration": total_duration_s,
            "fps": avg_fps,
            "frame_delays_ms": delays_ms if len(delays_ms) <= 120 else delays_ms[:120],
            "variable_delays": len(unique_delays) > 1,
            "loop_count": loop_count,
            "disposal": sorted(disposals),
            "palette": max_palette,
        }
    )

    if total_duration_s <= 10.0:
        measured_tags.append("short")
    if has_transparency:
        measured_tags.append("transparent")
    if max_palette <= 32:
        measured_tags.append("low-palette")
    if dither_scores and (sum(dither_scores) / len(dither_scores)) > 0.22:
        measured_tags.append("dithered")

    # Loop structure analysis: seamless-loop vs pingpong vs one-shot-anim
    if len(frames_gray) >= 4:
        first_last_diff = float(np.abs(frames_gray[0] - frames_gray[-1]).mean())
        step_diffs = [
            float(np.abs(frames_gray[i + 1] - frames_gray[i]).mean())
            for i in range(len(frames_gray) - 1)
        ]
        median_step = float(np.median(step_diffs)) if step_diffs else 1.0

        # Check pingpong symmetry: frame[i] vs frame[N - 1 - i]
        half = len(frames_gray) // 2
        sym_diffs = [
            float(np.abs(frames_gray[i] - frames_gray[-1 - i]).mean())
            for i in range(1, half)
        ]
        mid_diff = float(np.abs(frames_gray[0] - frames_gray[half]).mean())
        if sym_diffs and (np.mean(sym_diffs) < max(median_step * 0.6, 2.5)) and mid_diff > median_step * 1.5:
            measured_tags.extend(["pingpong", "loop-friendly"])
        elif first_last_diff <= max(median_step * 1.65, 6.0):
            measured_tags.extend(["seamless-loop", "loop-friendly"])
        else:
            measured_tags.append("one-shot-anim")

    # Compute 64-bit dHash on middle frame for duplicate / repost detection
    mid_idx = len(frames_gray) // 2
    phash_hex = _dhash_from_pil(target, mid_idx)
    measured_fields["phash"] = phash_hex

    # Muybridge plate extraction from filename if present
    m_plate = re.search(r"plate[_ -]?(\d+)", source_file.stem, re.IGNORECASE)
    if m_plate:
        measured_fields["plate"] = m_plate.group(1)
        measured_fields["sequence"] = "Animal Locomotion (1887)"

    return {
        "measured_tags": list(dict.fromkeys(measured_tags)),
        "measured_fields": measured_fields,
        "proposals": proposals,
        "confidence": 0.95,
    }


def _dhash_from_pil(path: Path, frame_idx: int = 0) -> str:
    with Image.open(path) as im:
        try:
            im.seek(frame_idx)
        except EOFError:
            im.seek(0)
        gray = np.asarray(im.convert("L").resize((9, 8), Image.Resampling.BILINEAR), dtype=np.int16)
        diff = gray[:, 1:] > gray[:, :-1]
        bits = 0
        for b in diff.flatten():
            bits = (bits << 1) | int(bool(b))
        return f"{bits:016x}"
