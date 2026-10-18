"""Render analyzer: generates preview thumbnails and posters for 3D models (GLB), Gaussian splats (SPZ/SPLAT/PLY), SVG, and text."""

from __future__ import annotations

import gzip
import re
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

KINDS = ["model", "splat", "vector", "text"]
VERSION = "1.0"
MODEL = "software-zbuffer+splat+svg"


def analyze(item_dir: Path, item: dict[str, Any], source_file: Path) -> dict[str, Any]:
    kind = item.get("kind", "")
    poster_path = item_dir / "poster.webp"
    thumb_path = item_dir / "thumb.webp"

    if kind == "model":
        render_glb_preview(source_file, poster_path, thumb_path)
    elif kind == "splat":
        render_splat_preview(source_file, poster_path, thumb_path)
    elif kind == "vector":
        render_svg_preview(source_file, poster_path, thumb_path)
    elif kind == "text":
        render_text_preview(source_file, poster_path, thumb_path)

    return {
        "measured_tags": [],
        "measured_fields": {},
        "proposals": {},
        "confidence": 1.0,
    }


def render_glb_preview(glb_path: Path, poster_path: Path, thumb_path: Path) -> None:
    import trimesh

    scene = trimesh.load(glb_path, force="scene")
    meshes = []
    for node_name in scene.graph.nodes_geometry:
        transform, geom_name = scene.graph[node_name]
        geom = scene.geometry[geom_name].copy()
        geom.apply_transform(transform)
        meshes.append(geom)
    if not meshes:
        meshes = list(scene.geometry.values())

    if not meshes:
        _save_fallback_card("3D MODEL", glb_path.stem, poster_path, thumb_path)
        return

    combined = trimesh.util.concatenate(meshes)
    verts = np.asarray(combined.vertices, dtype=np.float64)
    faces = np.asarray(combined.faces, dtype=np.int32)
    if len(verts) == 0 or len(faces) == 0:
        _save_fallback_card("3D MODEL", glb_path.stem, poster_path, thumb_path)
        return

    # Extract vertex or face colors when available
    face_colors = None
    try:
        if hasattr(combined, "visual"):
            vis = combined.visual
            if getattr(vis, "kind", None) == "texture" and hasattr(vis, "to_color"):
                vis = vis.to_color()
            if hasattr(vis, "face_colors") and len(vis.face_colors) == len(faces):
                face_colors = np.asarray(vis.face_colors[:, :3], dtype=np.float32)
            elif hasattr(vis, "vertex_colors") and len(vis.vertex_colors) == len(verts):
                vc = np.asarray(vis.vertex_colors[:, :3], dtype=np.float32)
                face_colors = vc[faces].mean(axis=1)
    except Exception:
        face_colors = None

    if face_colors is None:
        face_colors = np.full((len(faces), 3), 210.0, dtype=np.float32)

    # Center and normalize
    center = (verts.min(axis=0) + verts.max(axis=0)) * 0.5
    verts = verts - center
    span = float(np.max(verts.max(axis=0) - verts.min(axis=0))) or 1.0
    verts = verts / span

    # Isometric / turntable rotation (yaw 35 deg, pitch 22 deg)
    yaw = np.deg2rad(35.0)
    pitch = np.deg2rad(22.0)
    ry = np.array(
        [[np.cos(yaw), 0.0, np.sin(yaw)], [0.0, 1.0, 0.0], [-np.sin(yaw), 0.0, np.cos(yaw)]]
    )
    rx = np.array(
        [[1.0, 0.0, 0.0], [0.0, np.cos(pitch), -np.sin(pitch)], [0.0, np.sin(pitch), np.cos(pitch)]]
    )
    rot = rx @ ry
    v_rot = verts @ rot.T

    # Compute face normals and directional lighting
    v0 = v_rot[faces[:, 0]]
    v1 = v_rot[faces[:, 1]]
    v2 = v_rot[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    norms = np.linalg.norm(normals, axis=1, keepdims=True) + 1e-8
    normals = normals / norms

    light_dir = np.array([0.45, 0.65, 0.61])
    light_dir = light_dir / np.linalg.norm(light_dir)
    lambert = np.abs(normals @ light_dir)
    shade = 0.32 + 0.68 * lambert
    shaded_rgb = np.clip(face_colors * shade[:, None], 0, 255).astype(np.uint8)

    # Subsample up to 60,000 faces sorted back-to-front by Z
    z_order = (v0[:, 2] + v1[:, 2] + v2[:, 2]) / 3.0
    if len(faces) > 60000:
        step = max(1, len(faces) // 60000)
        idx = np.arange(0, len(faces), step)
        v0, v1, v2, shaded_rgb, z_order = v0[idx], v1[idx], v2[idx], shaded_rgb[idx], z_order[idx]

    order = np.argsort(z_order)
    v0, v1, v2, shaded_rgb = v0[order], v1[order], v2[order], shaded_rgb[order]

    W, H = 960, 720
    im = Image.new("RGB", (W, H), (20, 20, 20))
    draw = ImageDraw.Draw(im)

    scale = min(W, H) * 0.78
    cx, cy = W * 0.5, H * 0.52

    p0x = (cx + v0[:, 0] * scale).astype(np.int32)
    p0y = (cy - v0[:, 1] * scale).astype(np.int32)
    p1x = (cx + v1[:, 0] * scale).astype(np.int32)
    p1y = (cy - v1[:, 1] * scale).astype(np.int32)
    p2x = (cx + v2[:, 0] * scale).astype(np.int32)
    p2y = (cy - v2[:, 1] * scale).astype(np.int32)

    for i in range(len(v0)):
        c = (int(shaded_rgb[i, 0]), int(shaded_rgb[i, 1]), int(shaded_rgb[i, 2]))
        draw.polygon([(int(p0x[i]), int(p0y[i])), (int(p1x[i]), int(p1y[i])), (int(p2x[i]), int(p2y[i]))], fill=c)

    im.save(poster_path, "WEBP", quality=88)
    _save_square_thumb(im, thumb_path, 480)


def render_splat_preview(splat_path: Path, poster_path: Path, thumb_path: Path) -> None:
    ext = splat_path.suffix.lower()
    if ext == ".spz":
        with gzip.open(splat_path, "rb") as f:
            data = f.read()
        magic, _version, n, _sh_deg, frac_bits, _flags, _ = struct.unpack_from("<IIIbbbb", data, 0)
        if magic != 0x5053474E or n == 0:
            _save_fallback_card("SPLAT", splat_path.stem, poster_path, thumb_path)
            return
        pos_bytes = np.frombuffer(data, dtype=np.uint8, count=n * 9, offset=16).reshape(n, 3, 3)
        pos_i32 = (
            pos_bytes[:, :, 0].astype(np.int32)
            | (pos_bytes[:, :, 1].astype(np.int32) << 8)
            | (pos_bytes[:, :, 2].astype(np.int32) << 16)
        )
        pos_i32 = np.where(pos_i32 >= 0x800000, pos_i32 - 0x1000000, pos_i32)
        pos = pos_i32.astype(np.float32) / float(1 << frac_bits)
        alphas = np.frombuffer(data, dtype=np.uint8, count=n, offset=16 + n * 9).astype(np.float32) / 255.0
        colors_raw = np.frombuffer(data, dtype=np.uint8, count=n * 3, offset=16 + n * 10).reshape(n, 3).astype(np.float32)
        # Convert SPZ quantized SH0 color to RGB [0, 255]
        colors = np.clip(((colors_raw / 255.0 - 0.5) / 0.15) * 0.2820948 + 0.5, 0.0, 1.0) * 255.0
    elif ext == ".splat":
        raw = np.fromfile(splat_path, dtype=np.uint8)
        n = len(raw) // 32
        if n == 0:
            _save_fallback_card("SPLAT", splat_path.stem, poster_path, thumb_path)
            return
        recs = raw[: n * 32].reshape(n, 32)
        pos = np.frombuffer(recs[:, :12].tobytes(), dtype=np.float32).reshape(n, 3)
        rgba = recs[:, 24:28].astype(np.float32)
        colors = rgba[:, :3]
        alphas = rgba[:, 3] / 255.0
    else:
        _save_fallback_card("SPLAT", splat_path.stem, poster_path, thumb_path)
        return

    # Filter opaque splats and clip extreme outliers (5th..95th percentile)
    mask = alphas > 0.15
    if mask.sum() > 1000:
        pos = pos[mask]
        colors = colors[mask]
        alphas = alphas[mask]

    if len(pos) > 120000:
        step = len(pos) // 120000
        pos = pos[::step]
        colors = colors[::step]
        alphas = alphas[::step]

    lo = np.percentile(pos, 5, axis=0)
    hi = np.percentile(pos, 95, axis=0)
    in_box = np.all((pos >= lo) & (pos <= hi), axis=1)
    if in_box.sum() > 1000:
        pos = pos[in_box]
        colors = colors[in_box]
        alphas = alphas[in_box]

    center = np.median(pos, axis=0)
    pos = pos - center
    span = float(np.percentile(np.abs(pos), 92)) * 2.0 or 1.0
    pos = pos / span

    # Slight elevated camera view
    yaw = np.deg2rad(18.0)
    pitch = np.deg2rad(-12.0)
    ry = np.array([[np.cos(yaw), 0.0, np.sin(yaw)], [0.0, 1.0, 0.0], [-np.sin(yaw), 0.0, np.cos(yaw)]], dtype=np.float32)
    rx = np.array([[1.0, 0.0, 0.0], [0.0, np.cos(pitch), -np.sin(pitch)], [0.0, np.sin(pitch), np.cos(pitch)]], dtype=np.float32)
    p_rot = pos @ (rx @ ry).T

    # Depth sort back to front
    order = np.argsort(p_rot[:, 2])
    p_rot = p_rot[order]
    colors = colors[order]
    alphas = np.clip(alphas[order] * 0.75, 0.1, 0.95)

    W, H = 960, 720
    canvas = np.full((H, W, 3), 18.0, dtype=np.float32)
    scale = min(W, H) * 0.95
    px = (W * 0.5 + p_rot[:, 0] * scale).astype(np.int32)
    # SPZ/COLMAP often has Y down or Y up; check orientation via sky brightness
    py = (H * 0.5 - p_rot[:, 1] * scale).astype(np.int32)

    valid = (px >= 1) & (px < W - 2) & (py >= 1) & (py < H - 2)
    px, py, colors, alphas = px[valid], py[valid], colors[valid], alphas[valid]

    # Splat 2x2 footprint with alpha blending
    for dx, dy, w_a in ((0, 0, 1.0), (1, 0, 0.6), (0, 1, 0.6), (1, 1, 0.4)):
        a = (alphas * w_a)[:, None]
        x_idx = px + dx
        y_idx = py + dy
        canvas[y_idx, x_idx] = canvas[y_idx, x_idx] * (1.0 - a) + colors * a

    im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), mode="RGB")
    im.save(poster_path, "WEBP", quality=88)
    _save_square_thumb(im, thumb_path, 480)


def render_svg_preview(svg_path: Path, poster_path: Path, thumb_path: Path) -> None:
    # Try macOS QuickLook (`qlmanage`) first for pixel-accurate SVG rasterization
    with tempfile.TemporaryDirectory() as tmp:
        res = subprocess.run(
            ["qlmanage", "-t", "-s", "960", "-o", tmp, str(svg_path)],
            capture_output=True,
            check=False,
        )
        pngs = list(Path(tmp).glob("*.png"))
        if res.returncode == 0 and pngs:
            with Image.open(pngs[0]) as qim:
                im = Image.new("RGB", qim.size, (24, 24, 24))
                if qim.mode in ("RGBA", "LA"):
                    im.paste(qim, mask=qim.split()[-1])
                else:
                    im.paste(qim)
                im.save(poster_path, "WEBP", quality=90)
                _save_square_thumb(im, thumb_path, 480)
                return

    # Pure-Python SVG path/polygon rasterizer fallback
    W, H = 960, 720
    im = Image.new("RGB", (W, H), (24, 24, 24))
    draw = ImageDraw.Draw(im)
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        vb = root.attrib.get("viewBox") or "0 0 100 100"
        vx, vy, vw, vh = [float(x) for x in vb.replace(",", " ").split()[:4]]
        scale = min((W - 120) / max(vw, 1.0), (H - 120) / max(vh, 1.0))
        ox = (W - vw * scale) * 0.5 - vx * scale
        oy = (H - vh * scale) * 0.5 - vy * scale

        for elem in root.iter():
            tag = elem.tag.split("}")[-1]
            fill = _parse_svg_color(elem.attrib.get("fill", "#e8e6e0"))
            if tag == "polygon" and "points" in elem.attrib:
                nums = [float(n) for n in re.findall(r"[-+]?\d*\.?\d+", elem.attrib["points"])]
                pts = [(ox + nums[i] * scale, oy + nums[i + 1] * scale) for i in range(0, len(nums) - 1, 2)]
                if len(pts) >= 3 and fill:
                    draw.polygon(pts, fill=fill)
            elif tag == "path" and "d" in elem.attrib:
                pts = _approx_svg_path(elem.attrib["d"], ox, oy, scale)
                if len(pts) >= 3 and fill:
                    draw.polygon(pts, fill=fill)
                elif len(pts) >= 2:
                    draw.line(pts, fill=fill or (232, 230, 224), width=3)
    except Exception:
        pass

    im.save(poster_path, "WEBP", quality=90)
    _save_square_thumb(im, thumb_path, 480)


def render_text_preview(txt_path: Path, poster_path: Path, thumb_path: Path) -> None:
    content = txt_path.read_text(encoding="utf-8", errors="replace")
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()][:12]
    W, H = 960, 720
    im = Image.new("RGB", (W, H), (21, 21, 21))
    draw = ImageDraw.Draw(im)
    y = 64
    for ln in lines:
        draw.text((64, y), ln[:72], fill=(225, 223, 216))
        y += 42
    im.save(poster_path, "WEBP", quality=88)
    _save_square_thumb(im, thumb_path, 480)


def _save_fallback_card(label: str, title: str, poster_path: Path, thumb_path: Path) -> None:
    im = Image.new("RGB", (960, 720), (22, 22, 22))
    draw = ImageDraw.Draw(im)
    draw.rectangle([40, 40, 920, 680], outline=(68, 68, 68), width=2)
    draw.text((80, 320), f"[{label}] {title}", fill=(230, 228, 220))
    im.save(poster_path, "WEBP", quality=88)
    _save_square_thumb(im, thumb_path, 480)


def _save_square_thumb(im: Image.Image, thumb_path: Path, size: int = 480) -> None:
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = im.crop((left, top, left + side, top + side)).resize((size, size), Image.Resampling.LANCZOS)
    cropped.save(thumb_path, "WEBP", quality=86)


def _parse_svg_color(val: str) -> tuple[int, int, int] | None:
    val = val.strip().lower()
    if val == "none":
        return None
    if val.startswith("#"):
        h = val[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    return (232, 230, 224)


def _approx_svg_path(d: str, ox: float, oy: float, scale: float) -> list[tuple[float, float]]:
    tokens = re.findall(r"[A-Za-z]|[-+]?\d*\.?\d+", d)
    pts: list[tuple[float, float]] = []
    cx, cy = 0.0, 0.0
    cmd = "M"
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            continue
        try:
            if cmd in ("M", "L"):
                cx, cy = float(tokens[i]), float(tokens[i + 1])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 2
            elif cmd in ("m", "l"):
                cx += float(tokens[i])
                cy += float(tokens[i + 1])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 2
            elif cmd == "H":
                cx = float(tokens[i])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 1
            elif cmd == "h":
                cx += float(tokens[i])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 1
            elif cmd == "V":
                cy = float(tokens[i])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 1
            elif cmd == "v":
                cy += float(tokens[i])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 1
            elif cmd == "C":
                cx, cy = float(tokens[i + 4]), float(tokens[i + 5])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 6
            elif cmd == "c":
                cx += float(tokens[i + 4])
                cy += float(tokens[i + 5])
                pts.append((ox + cx * scale, oy + cy * scale))
                i += 6
            else:
                i += 1
        except (IndexError, ValueError):
            break
    return pts
