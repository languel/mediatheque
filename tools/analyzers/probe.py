"""Probe analyzer: extracts format metadata and deterministic tags across all media kinds."""

from __future__ import annotations

import gzip
import json
import struct
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

KINDS = ["all"]
VERSION = "1.0"
MODEL = "ffprobe+pillow+trimesh"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    kind = item.get("kind", "")
    measured_tags: list[str] = []
    measured_fields: dict[str, Any] = {}
    proposals: dict[str, Any] = {}

    media_rel = item.get("files", {}).get("media", {}).get("path")
    target = (item_dir / media_rel) if media_rel and (item_dir / media_rel).exists() else source_file

    if kind in ("video", "animation", "audio"):
        info = _ffprobe(target)
        streams = info.get("streams", [])
        fmt = info.get("format", {})
        vstream = next((s for s in streams if s.get("codec_type") == "video"), None)
        astream = next((s for s in streams if s.get("codec_type") == "audio"), None)

        duration = float(fmt.get("duration") or (vstream or {}).get("duration") or 0.0)
        if duration > 0:
            measured_fields["duration"] = round(duration, 3)
            if duration <= 10.0 and kind in ("video", "animation", "audio"):
                measured_tags.append("short")

        if vstream:
            w = int(vstream.get("width", 0))
            h = int(vstream.get("height", 0))
            if w and h:
                measured_fields["width"] = w
                measured_fields["height"] = h
                _add_aspect_tag(w, h, measured_tags)
            fps = _parse_fps(vstream.get("avg_frame_rate") or vstream.get("r_frame_rate"))
            if fps:
                measured_fields["fps"] = round(fps, 2)

        if kind in ("video", "animation") and astream is None:
            measured_tags.append("silent")

        # Check bw vs color from poster or thumb if available
        poster = item_dir / "poster.webp"
        if poster.exists():
            color_tag, has_alpha = _inspect_image_colors(poster)
            if color_tag:
                measured_tags.append(color_tag)
            if has_alpha:
                measured_tags.append("transparent")

    elif kind == "image":
        with Image.open(source_file) as im:
            w, h = im.size
            measured_fields["width"] = w
            measured_fields["height"] = h
            _add_aspect_tag(w, h, measured_tags)
            if w / max(h, 1) >= 1.85:
                if abs((w / max(h, 1)) - 2.0) <= 0.15:
                    measured_tags.extend(["panorama", "equirect"])
                else:
                    measured_tags.append("panorama")
            color_tag, has_alpha = _inspect_pil_image(im)
            if color_tag:
                measured_tags.append(color_tag)
            if has_alpha:
                measured_tags.extend(["transparent", "alpha"])

    elif kind == "model":
        try:
            import trimesh

            scene_or_mesh = trimesh.load(source_file, force="scene")
            tris = 0
            has_tex = False
            if hasattr(scene_or_mesh, "geometry"):
                for geom in scene_or_mesh.geometry.values():
                    if hasattr(geom, "faces"):
                        tris += int(len(geom.faces))
                    if hasattr(geom, "visual") and getattr(geom.visual, "kind", None) in ("texture", "vertex"):
                        has_tex = True
            bounds = getattr(scene_or_mesh, "bounds", None)
            measured_fields["triangles"] = tris
            if bounds is not None and len(bounds) == 2:
                extents = (bounds[1] - bounds[0]).tolist()
                measured_fields["bbox"] = [round(float(x), 3) for x in extents]
            if tris > 0 and tris < 10000:
                measured_tags.append("low-poly")
            measured_tags.append("textured" if has_tex else "untextured")
        except Exception as exc:
            proposals["note"] = f"trimesh probe partial: {exc}"

    elif kind == "splat":
        splat_count = _probe_splat_count(source_file)
        if splat_count:
            measured_fields["splats"] = splat_count

    elif kind == "vector":
        w, h, vec_tags = _probe_svg(source_file)
        if w and h:
            measured_fields["width"] = w
            measured_fields["height"] = h
            _add_aspect_tag(w, h, measured_tags)
        measured_tags.extend(vec_tags)

    elif kind == "text":
        text_content = source_file.read_text(encoding="utf-8", errors="replace")
        measured_fields["lines"] = len(text_content.splitlines())
        measured_fields["words"] = len(text_content.split())

    return {
        "measured_tags": list(dict.fromkeys(measured_tags)),
        "measured_fields": measured_fields,
        "proposals": proposals,
        "confidence": 1.0,
    }


def _add_aspect_tag(w: int, h: int, tags: list[str]) -> None:
    ratio = w / max(h, 1)
    if 0.92 <= ratio <= 1.08:
        tags.append("square")
    elif ratio < 0.92:
        tags.append("portrait")
    else:
        tags.append("landscape-format")


def _parse_fps(rate_str: str | None) -> float | None:
    if not rate_str or rate_str == "0/0":
        return None
    if "/" in rate_str:
        num, den = rate_str.split("/", 1)
        try:
            n, d = float(num), float(den)
            return n / d if d > 0 else None
        except ValueError:
            return None
    try:
        return float(rate_str)
    except ValueError:
        return None


def _ffprobe(path: Path) -> dict[str, Any]:
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0 or not res.stdout.strip():
        return {}
    try:
        return json.loads(res.stdout)
    except Exception:
        return {}


def _inspect_image_colors(path: Path) -> tuple[str | None, bool]:
    with Image.open(path) as im:
        return _inspect_pil_image(im)


def _inspect_pil_image(im: Image.Image) -> tuple[str | None, bool]:
    has_alpha = False
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        alpha = np.asarray(rgba)[:, :, 3]
        if int(alpha.min()) < 250:
            has_alpha = True
    rgb = np.asarray(im.convert("RGB").resize((96, 96)), dtype=np.float32)
    diff_rg = np.abs(rgb[:, :, 0] - rgb[:, :, 1]).mean()
    diff_gb = np.abs(rgb[:, :, 1] - rgb[:, :, 2]).mean()
    diff_rb = np.abs(rgb[:, :, 0] - rgb[:, :, 2]).mean()
    chroma = (diff_rg + diff_gb + diff_rb) / 3.0
    if chroma < 4.5:
        return "bw", has_alpha
    if chroma < 12.0:
        return "tinted", has_alpha
    return "color", has_alpha


def _probe_splat_count(path: Path) -> int | None:
    ext = path.suffix.lower()
    if ext == ".spz":
        with gzip.open(path, "rb") as f:
            hdr = f.read(16)
            if len(hdr) >= 12:
                magic, _version, num_points = struct.unpack("<III", hdr[:12])
                if magic == 0x5053474E:
                    return int(num_points)
    elif ext == ".splat":
        return path.stat().st_size // 32
    elif ext == ".ply":
        with path.open("rb") as f:
            head = f.read(2048).decode("ascii", errors="ignore")
            for line in head.splitlines():
                if line.startswith("element vertex "):
                    try:
                        return int(line.split()[-1])
                    except ValueError:
                        pass
    return None


def _probe_svg(path: Path) -> tuple[int | None, int | None, list[str]]:
    tags = ["transparent"]
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        vb = root.attrib.get("viewBox") or root.attrib.get("viewbox")
        w, h = None, None
        if vb:
            parts = [float(x) for x in vb.replace(",", " ").split() if x]
            if len(parts) == 4:
                w, h = int(round(parts[2])), int(round(parts[3]))
        path_elems = root.findall(".//{*}path")
        poly_elems = root.findall(".//{*}polygon") + root.findall(".//{*}rect") + root.findall(".//{*}circle")
        total_shapes = len(path_elems) + len(poly_elems)
        if total_shapes == 1 and len(path_elems) == 1:
            tags.append("single-path")
        tags.append("filled")
        return w, h, tags
    except Exception:
        return None, None, tags
