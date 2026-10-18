#!/usr/bin/env python3
"""Mediathèque ingest tool: processes inbox/ files into items/<id>/ with derivatives, provenance, and analyzers."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path
from typing import Any

import yaml
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

from analyzers import load_valid_tags, run_analyzers  # noqa: E402
from analyzers.scenes import build_clip_proposals, detect_audio_silences, detect_video_scenes  # noqa: E402

KIND_BY_EXT: dict[str, str] = {
    ".mp4": "video",
    ".webm": "video",
    ".mov": "video",
    ".mkv": "video",
    ".avi": "video",
    ".ogv": "video",
    ".gif": "animation",
    ".apng": "animation",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
    ".avif": "image",
    ".tif": "image",
    ".tiff": "image",
    ".mp3": "audio",
    ".wav": "audio",
    ".flac": "audio",
    ".ogg": "audio",
    ".m4a": "audio",
    ".aac": "audio",
    ".glb": "model",
    ".gltf": "model",
    ".obj": "model",
    ".stl": "model",
    ".spz": "splat",
    ".splat": "splat",
    ".ply": "splat",
    ".svg": "vector",
    ".md": "text",
    ".txt": "text",
    ".pdf": "text",
}

MIME_BY_EXT: dict[str, str] = {
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".avif": "image/avif",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".spz": "application/x-gaussian-splat-spz",
    ".splat": "application/x-gaussian-splat",
    ".ply": "application/x-ply",
    ".svg": "image/svg+xml",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
}

SIDECAR_SUFFIXES = (".source.txt", ".json", ".html", ".htm")


def load_config() -> dict[str, Any]:
    cfg_path = REPO_ROOT / "mediatheque.yaml"
    if cfg_path.exists():
        return yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    return {}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def slugify(name: str) -> str:
    # Normalize unicode (NFD/NFKD) to strip accents cleanly
    norm = unicodedata.normalize("NFKD", name)
    ascii_str = norm.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "item"


def human_title(stem: str) -> str:
    norm = unicodedata.normalize("NFC", stem)
    cleaned = norm.replace("_", " ").strip()
    return re.sub(r"\s{2,}", " ", cleaned)


def detect_kind(path: Path) -> str | None:
    ext = path.suffix.lower()
    kind = KIND_BY_EXT.get(ext)
    if kind == "image" and ext in (".webp", ".png"):
        try:
            with Image.open(path) as im:
                if getattr(im, "is_animated", False) and getattr(im, "n_frames", 1) > 1:
                    return "animation"
        except Exception:
            pass
    return kind


def get_existing_hashes(items_dir: Path) -> dict[str, str]:
    """Map sha256 -> item_id for all existing items."""
    hashes: dict[str, str] = {}
    if not items_dir.exists():
        return hashes
    for item_json in sorted(items_dir.glob("*/item.json")):
        try:
            data = json.loads(item_json.read_text(encoding="utf-8"))
            item_id = data.get("id", item_json.parent.name)
            for fobj in data.get("files", {}).values():
                if isinstance(fobj, dict) and fobj.get("sha256"):
                    hashes[fobj["sha256"]] = item_id
            for pstep in data.get("provenance", []):
                if isinstance(pstep, dict) and pstep.get("sha256"):
                    hashes[pstep["sha256"]] = item_id
        except Exception:
            continue
    return hashes


def get_existing_phashes(items_dir: Path) -> dict[str, str]:
    """Map perceptual dHash -> item_id for existing animation/image items."""
    phashes: dict[str, str] = {}
    if not items_dir.exists():
        return phashes
    for item_json in sorted(items_dir.glob("*/item.json")):
        try:
            data = json.loads(item_json.read_text(encoding="utf-8"))
            item_id = data.get("id", item_json.parent.name)
            ph = data.get("files", {}).get("media", {}).get("phash")
            if ph:
                phashes[ph] = item_id
        except Exception:
            continue
    return phashes


def read_macos_wherefroms(path: Path) -> list[str]:
    """Read com.apple.metadata:kMDItemWhereFroms extended attribute on macOS when present."""
    try:
        res = subprocess.run(
            ["xattr", "-px", "com.apple.metadata:kMDItemWhereFroms", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            raw_bytes = bytes.fromhex("".join(res.stdout.split()))
            urls = plistlib.loads(raw_bytes)
            if isinstance(urls, list):
                return [
                    str(u)
                    for u in urls
                    if isinstance(u, str)
                    and u.startswith(("http://", "https://"))
                    and u != "about:client"
                ]
    except Exception:
        pass
    return []


def parse_wikimedia_url(url: str) -> dict[str, Any]:
    """Extract canonical Commons/Wikipedia File page URL and archive metadata from an upload.wikimedia.org URL."""
    parsed = urllib.parse.urlparse(url)
    clean_url = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))
    info: dict[str, Any] = {"url": clean_url}
    if "upload.wikimedia.org" in parsed.netloc:
        parts = [p for p in parsed.path.split("/") if p]
        filename = urllib.parse.unquote(parts[-1]) if parts else ""
        if "commons" in parts:
            wiki_page = f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(filename)}"
            info["url"] = wiki_page
            info["direct_url"] = clean_url
            info["archive"] = "Wikimedia Commons"
        elif "en" in parts:
            wiki_page = f"https://en.wikipedia.org/wiki/File:{urllib.parse.quote(filename)}"
            info["url"] = wiki_page
            info["direct_url"] = clean_url
            info["archive"] = "English Wikipedia"
    return info


def read_sidecars(file_path: Path) -> dict[str, Any]:
    """Read optional sidecars (<name>.source.txt, <name>.json, <name>.html, File_<name>.html) and macOS xattrs."""
    meta: dict[str, Any] = {}
    parent = file_path.parent
    stem = file_path.stem

    # 1. macOS WhereFroms
    where_urls = read_macos_wherefroms(file_path)
    if where_urls:
        primary = where_urls[0]
        w_info = parse_wikimedia_url(primary)
        meta.setdefault("source", {})
        meta["source"]["url"] = w_info["url"]
        if w_info.get("archive"):
            meta["source"]["archive"] = w_info["archive"]
        if len(where_urls) > 1 and where_urls[1] != primary and not where_urls[1].endswith(".org/"):
            meta["source"]["via"] = where_urls[1]

    # 2. <name>.source.txt
    src_txt = parent / f"{stem}.source.txt"
    if src_txt.exists():
        lines = [ln.strip() for ln in src_txt.read_text(encoding="utf-8").splitlines() if ln.strip()]
        for ln in lines:
            if ln.startswith(("http://", "https://")) and " " not in ln:
                meta.setdefault("source", {})["url"] = ln
            elif ":" in ln:
                k, v = ln.split(":", 1)
                k, v = k.strip().lower(), v.strip()
                if k in ("url", "origin", "archive", "retrieved", "via"):
                    meta.setdefault("source", {})[k] = v
                elif k in ("license", "status", "credit", "license_url", "notes"):
                    meta.setdefault("rights", {})[k] = v
                elif k in ("title", "summary", "description", "date"):
                    meta[k] = v

    # 3. Saved HTML page (<name>.html or File_<name>.html)
    for html_cand in (
        parent / f"{stem}.html",
        parent / f"File_{stem}.html",
        parent / f"File:{stem}.html",
    ):
        if html_cand.exists():
            html_text = html_cand.read_text(encoding="utf-8", errors="ignore")
            m_canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', html_text)
            if m_canon:
                meta.setdefault("source", {})["url"] = m_canon.group(1)
                if "wikimedia.org" in m_canon.group(1):
                    meta.setdefault("source", {})["archive"] = "Wikimedia Commons"
            if "PD-US" in html_text or "Public domain" in html_text:
                meta.setdefault("rights", {})["status"] = "public-domain"
                meta.setdefault("rights", {})["license"] = "PD-US"

    # 4. Partial <name>.json
    json_sidecar = parent / f"{stem}.json"
    if json_sidecar.exists():
        try:
            partial = json.loads(json_sidecar.read_text(encoding="utf-8"))
            for k, v in partial.items():
                if isinstance(v, dict) and isinstance(meta.get(k), dict):
                    meta[k].update(v)
                else:
                    meta[k] = v
        except Exception:
            pass

    return meta


def ffmpeg_version() -> str:
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=False)
        first = (res.stdout or "").splitlines()[0]
        m = re.search(r"ffmpeg version ([^\s]+)", first)
        return f"ffmpeg {m.group(1)}" if m else "ffmpeg"
    except Exception:
        return "ffmpeg"


def make_file_record(path: Path, rel_path: str) -> dict[str, Any]:
    ext = path.suffix.lower()
    rec: dict[str, Any] = {
        "path": rel_path,
        "type": MIME_BY_EXT.get(ext, "application/octet-stream"),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }
    if ext in (".webp", ".png", ".jpg", ".jpeg", ".gif"):
        try:
            with Image.open(path) as im:
                rec["width"], rec["height"] = im.size
        except Exception:
            pass
    return rec


def derive_video(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    ff_ver = ffmpeg_version()
    today = str(date.today())
    files: dict[str, Any] = {}

    # Probe duration and dimensions
    probe_res = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(src)],
        capture_output=True,
        text=True,
        check=False,
    )
    pinfo = json.loads(probe_res.stdout) if probe_res.returncode == 0 and probe_res.stdout else {}
    vstream = next((s for s in pinfo.get("streams", []) if s.get("codec_type") == "video"), {})
    duration = float(pinfo.get("format", {}).get("duration") or vstream.get("duration") or 0.0)
    src_bytes = src.stat().st_size
    ext = src.suffix.lower()

    # Web derivative: if source is already compact (<18 MB) webm/mp4 and <=1080p, copy or transcode
    w = int(vstream.get("width") or 0)
    h = int(vstream.get("height") or 0)
    if ext in (".webm", ".mp4") and src_bytes <= 15 * 1024 * 1024 and max(w, h) <= 1080:
        media_name = f"media{ext}"
        media_path = item_dir / media_name
        shutil.copy2(src, media_path)
        provenance.append(
            {
                "step": "derived",
                "file": media_name,
                "tool": "copy (web-ready source)",
                "args": f"cp {src.name} {media_name}",
                "date": today,
            }
        )
    else:
        media_name = "media.webm"
        media_path = item_dir / media_name
        vf = "scale='min(1280,iw)':-2"
        args_list = [
            "-vf",
            vf,
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "33",
            "-b:v",
            "0",
            "-row-mt",
            "1",
            "-cpu-used",
            "4",
            "-c:a",
            "libopus",
            "-b:a",
            "96k",
        ]
        if not media_path.exists() or media_path.stat().st_size == 0:
            subprocess.run(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), *args_list, str(media_path)],
                check=True,
            )
        provenance.append(
            {
                "step": "derived",
                "file": media_name,
                "tool": ff_ver,
                "args": " ".join(args_list),
                "date": today,
            }
        )

    files["media"] = make_file_record(media_path, media_name)

    # Proxy: 768px, 15fps, muted webm
    proxy_path = item_dir / "proxy.webm"
    proxy_args = [
        "-vf",
        "fps=15,scale='min(768,iw)':-2",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "35",
        "-b:v",
        "0",
        "-row-mt",
        "1",
        "-cpu-used",
        "4",
        "-an",
    ]
    if not proxy_path.exists() or proxy_path.stat().st_size == 0:
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(media_path), *proxy_args, str(proxy_path)],
            check=True,
        )
    provenance.append(
        {
            "step": "derived",
            "file": "proxy.webm",
            "tool": ff_ver,
            "args": " ".join(proxy_args),
            "date": today,
        }
    )
    files["proxy"] = make_file_record(proxy_path, "proxy.webm")

    # Poster at 10% of duration (extracted as PNG via ffmpeg, encoded to WebP via Pillow)
    seek_t = round(max(0.0, duration * 0.10), 2)
    poster_path = item_dir / "poster.webp"
    tmp_png = item_dir / "_poster_tmp.png"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(seek_t),
            "-i",
            str(media_path),
            "-frames:v",
            "1",
            str(tmp_png),
        ],
        check=False,
    )
    if not tmp_png.exists():
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(media_path),
                "-frames:v",
                "1",
                str(tmp_png),
            ],
            check=True,
        )
    with Image.open(tmp_png) as pim:
        pim.convert("RGB").save(poster_path, "WEBP", quality=88)
    tmp_png.unlink(missing_ok=True)
    provenance.append(
        {
            "step": "derived",
            "file": "poster.webp",
            "tool": f"{ff_ver} + Pillow",
            "args": f"-ss {seek_t} -frames:v 1 -> webp",
            "date": today,
        }
    )
    files["poster"] = make_file_record(poster_path, "poster.webp")

    thumb_path = item_dir / "thumb.webp"
    _make_square_thumb(poster_path, thumb_path, 480)
    provenance.append(
        {
            "step": "derived",
            "file": "thumb.webp",
            "tool": "Pillow",
            "args": "center-crop 480x480 webp",
            "date": today,
        }
    )
    files["thumb"] = make_file_record(thumb_path, "thumb.webp")
    return files


def derive_animation(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    ff_ver = ffmpeg_version()
    today = str(date.today())
    files: dict[str, Any] = {}

    # Always keep original GIF as original.gif (spec: "Keep the GIF. The original is the artifact")
    orig_ext = src.suffix.lower()
    orig_name = f"original{orig_ext}"
    orig_path = item_dir / orig_name
    shutil.copy2(src, orig_path)

    # Also produce seekable MP4 (H.264) and WebM (VP9) loop derivatives for tools/streaming
    mp4_path = item_dir / "media.mp4"
    mp4_args = [
        "-vf",
        "scale='max(2,trunc(iw/2)*2):max(2,trunc(ih/2)*2)'",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        "-an",
    ]
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(orig_path), *mp4_args, str(mp4_path)],
        check=True,
    )
    provenance.append(
        {
            "step": "derived",
            "file": "media.mp4",
            "tool": ff_ver,
            "args": " ".join(mp4_args),
            "date": today,
        }
    )

    proxy_path = item_dir / "proxy.webm"
    webm_args = [
        "-vf",
        "scale='max(2,trunc(min(768,iw)/2)*2):max(2,trunc(ih/2)*2)'",
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-crf",
        "32",
        "-b:v",
        "0",
        "-row-mt",
        "1",
        "-cpu-used",
        "4",
        "-an",
    ]
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(orig_path), *webm_args, str(proxy_path)],
        check=True,
    )
    provenance.append(
        {
            "step": "derived",
            "file": "proxy.webm",
            "tool": ff_ver,
            "args": " ".join(webm_args),
            "date": today,
        }
    )

    # Extract middle frame for poster.webp and square thumb.webp
    poster_path = item_dir / "poster.webp"
    thumb_path = item_dir / "thumb.webp"
    with Image.open(orig_path) as im:
        n_frames = getattr(im, "n_frames", 1)
        im.seek(n_frames // 2)
        rgba = im.convert("RGBA")
        poster_im = Image.new("RGBA", rgba.size, (20, 20, 20, 255))
        poster_im.alpha_composite(rgba)
        poster_im.convert("RGB").save(poster_path, "WEBP", quality=88)

    _make_square_thumb(poster_path, thumb_path, 480)
    provenance.append(
        {
            "step": "derived",
            "file": "poster.webp",
            "tool": "Pillow",
            "args": "middle-frame webp",
            "date": today,
        }
    )
    provenance.append(
        {
            "step": "derived",
            "file": "thumb.webp",
            "tool": "Pillow",
            "args": "center-crop 480x480 webp",
            "date": today,
        }
    )

    # For GIFs, `original.gif` is the primary artifact, `media.mp4` is the streamable video derivative,
    # and `proxy.webm` is the VP9 loop.
    files["media"] = make_file_record(mp4_path, "media.mp4")
    files["proxy"] = make_file_record(proxy_path, "proxy.webm")
    files["poster"] = make_file_record(poster_path, "poster.webp")
    files["thumb"] = make_file_record(thumb_path, "thumb.webp")
    files["original"] = {**make_file_record(orig_path, orig_name), "kept": True}
    return files


def derive_image(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    today = str(date.today())
    files: dict[str, Any] = {}
    media_path = item_dir / "media.webp"
    poster_path = item_dir / "poster.webp"
    thumb_path = item_dir / "thumb.webp"

    with Image.open(src) as im:
        w, h = im.size
        max_dim = max(w, h)
        if max_dim > 3000:
            scale = 3000.0 / max_dim
            new_size = (int(round(w * scale)), int(round(h * scale)))
            im_web = im.resize(new_size, Image.Resampling.LANCZOS)
            resize_arg = f"resize {new_size[0]}x{new_size[1]} webp"
        else:
            im_web = im.copy()
            resize_arg = "webp quality=90"

        if im_web.mode not in ("RGB", "RGBA"):
            im_web = im_web.convert("RGBA" if "A" in im_web.mode or "transparency" in im_web.info else "RGB")
        im_web.save(media_path, "WEBP", quality=90)

        # Poster and thumb
        if im_web.mode == "RGBA":
            bg = Image.new("RGBA", im_web.size, (20, 20, 20, 255))
            bg.alpha_composite(im_web)
            bg.convert("RGB").save(poster_path, "WEBP", quality=88)
        else:
            im_web.convert("RGB").save(poster_path, "WEBP", quality=88)

    _make_square_thumb(poster_path, thumb_path, 480)
    provenance.append(
        {"step": "derived", "file": "media.webp", "tool": "Pillow", "args": resize_arg, "date": today}
    )
    provenance.append(
        {"step": "derived", "file": "thumb.webp", "tool": "Pillow", "args": "center-crop 480x480 webp", "date": today}
    )

    files["media"] = make_file_record(media_path, "media.webp")
    files["poster"] = make_file_record(poster_path, "poster.webp")
    files["thumb"] = make_file_record(thumb_path, "thumb.webp")
    return files


def derive_audio(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    ff_ver = ffmpeg_version()
    today = str(date.today())
    files: dict[str, Any] = {}
    media_path = item_dir / "media.mp3"

    if src.suffix.lower() == ".mp3" and src.stat().st_size <= 20 * 1024 * 1024:
        shutil.copy2(src, media_path)
        provenance.append(
            {"step": "derived", "file": "media.mp3", "tool": "copy", "args": "cp mp3", "date": today}
        )
    else:
        args_list = ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), *args_list, str(media_path)],
            check=True,
        )
        provenance.append(
            {"step": "derived", "file": "media.mp3", "tool": ff_ver, "args": " ".join(args_list), "date": today}
        )

    files["media"] = make_file_record(media_path, "media.mp3")
    return files


def derive_model_or_splat(
    src: Path, item_dir: Path, kind: str, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    today = str(date.today())
    ext = src.suffix.lower()
    media_name = f"media{ext}"
    media_path = item_dir / media_name
    shutil.copy2(src, media_path)
    provenance.append(
        {"step": "derived", "file": media_name, "tool": "copy", "args": f"cp {src.name} {media_name}", "date": today}
    )
    return {"media": make_file_record(media_path, media_name)}


def sanitize_svg(svg_text: str) -> str:
    """Remove <script> elements, on* event attributes, and external http(s) hrefs from SVG."""
    cleaned = re.sub(r"<script\b[^>]*>.*?</script>", "", svg_text, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\son[a-z]+\s*=\s*(['\"]).*?\1", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(
        r"\s(xlink:href|href)\s*=\s*(['\"])https?://.*?\2",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned


def derive_vector(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    today = str(date.today())
    raw_svg = src.read_text(encoding="utf-8", errors="replace")
    sanitized = sanitize_svg(raw_svg)
    media_path = item_dir / "media.svg"
    media_path.write_text(sanitized, encoding="utf-8")
    provenance.append(
        {
            "step": "derived",
            "file": "media.svg",
            "tool": "svg-sanitizer",
            "args": "strip scripts, event handlers, external refs",
            "date": today,
        }
    )
    return {"media": make_file_record(media_path, "media.svg")}


def derive_text(
    src: Path, item_dir: Path, cfg: dict[str, Any], provenance: list[dict[str, Any]]
) -> dict[str, Any]:
    today = str(date.today())
    ext = src.suffix.lower()
    media_name = f"media{ext}"
    media_path = item_dir / media_name
    if ext in (".md", ".txt"):
        raw = src.read_text(encoding="utf-8", errors="replace")
        clean = re.sub(r"<script\b[^>]*>.*?</script>", "", raw, flags=re.IGNORECASE | re.DOTALL)
        media_path.write_text(clean, encoding="utf-8")
    else:
        shutil.copy2(src, media_path)
    provenance.append(
        {"step": "derived", "file": media_name, "tool": "text-sanitizer", "args": "strip raw scripts", "date": today}
    )
    return {"media": make_file_record(media_path, media_name)}


def _make_square_thumb(src_img: Path, thumb_path: Path, size: int = 480) -> None:
    with Image.open(src_img) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        cropped = rgb.crop((left, top, left + side, top + side)).resize((size, size), Image.Resampling.LANCZOS)
        cropped.save(thumb_path, "WEBP", quality=86)


def generate_gif_frames_and_sheet(item_id: str) -> None:
    """Generate optional frames.zip (numbered PNGs) and sheet.png (sprite sheet + grid metadata) for an animation item."""
    item_dir = REPO_ROOT / "items" / item_id
    item_json_path = item_dir / "item.json"
    if not item_json_path.exists():
        raise SystemExit(f"Item not found: {item_id}")
    item = json.loads(item_json_path.read_text(encoding="utf-8"))
    orig_rel = item.get("files", {}).get("original", {}).get("path", "original.gif")
    gif_path = item_dir / orig_rel
    if not gif_path.exists():
        raise SystemExit(f"Original GIF not found at {gif_path}")

    frames_zip_path = item_dir / "frames.zip"
    sheet_path = item_dir / "sheet.png"

    pil_frames: list[Image.Image] = []
    with Image.open(gif_path) as im:
        n_frames = getattr(im, "n_frames", 1)
        for i in range(n_frames):
            im.seek(i)
            pil_frames.append(im.convert("RGBA").copy())

    w, h = pil_frames[0].size
    cols = min(8, len(pil_frames))
    rows = (len(pil_frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * w, rows * h), (0, 0, 0, 0))

    with zipfile.ZipFile(frames_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, frame in enumerate(pil_frames):
            r, c = divmod(idx, cols)
            sheet.paste(frame, (c * w, r * h))
            tmp_png = item_dir / f"_tmp_{idx:03d}.png"
            frame.save(tmp_png, "PNG")
            zf.write(tmp_png, arcname=f"{idx:03d}.png")
            tmp_png.unlink()

    sheet.save(sheet_path, "PNG")
    item["files"]["frames"] = {
        **make_file_record(frames_zip_path, "frames.zip"),
        "count": len(pil_frames),
    }
    item["files"]["sheet"] = {
        **make_file_record(sheet_path, "sheet.png"),
        "cols": cols,
        "rows": rows,
        "frame_width": w,
        "frame_height": h,
        "count": len(pil_frames),
    }
    item["provenance"].append(
        {
            "step": "derived",
            "file": "sheet.png, frames.zip",
            "tool": "Pillow",
            "args": f"sprite sheet {cols}x{rows} ({len(pil_frames)} frames)",
            "date": str(date.today()),
        }
    )
    item["updated"] = str(date.today())
    item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[frames] generated sheet.png ({cols}x{rows}) and frames.zip for {item_id}")


def propose_clips_for_item(item_id: str) -> None:
    """Run scene/silence detection (with teaching-segment fallback) to populate clips in item.json."""
    item_dir = REPO_ROOT / "items" / item_id
    item_json_path = item_dir / "item.json"
    if not item_json_path.exists():
        raise SystemExit(f"Item not found: {item_id}")
    item = json.loads(item_json_path.read_text(encoding="utf-8"))
    media_rel = item.get("files", {}).get("media", {}).get("path")
    if not media_rel:
        raise SystemExit(f"No media file in {item_id}")
    media_path = item_dir / media_rel
    duration = float(item.get("files", {}).get("media", {}).get("duration") or 0.0)
    kind = item.get("kind", "video")

    if kind == "video":
        splits = detect_video_scenes(media_path, threshold=0.25)
    elif kind == "audio":
        splits = detect_audio_silences(media_path)
    else:
        splits = []

    clips = build_clip_proposals(splits, duration, min_clip_len=2.5, fallback_segment=True)
    if not clips:
        print(f"[clips] {item_id}: duration {duration:.1f}s too short for multiple clips")
        return

    item["clips"] = clips
    item["updated"] = str(date.today())
    item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[clips] proposed {len(clips)} clips for {item_id}")


def accept_proposals(item_id: str) -> None:
    """Merge analyzer proposals in `proposed` into top-level item.json fields and set status to review."""
    item_dir = REPO_ROOT / "items" / item_id
    item_json_path = item_dir / "item.json"
    if not item_json_path.exists():
        raise SystemExit(f"Item not found: {item_id}")
    item = json.loads(item_json_path.read_text(encoding="utf-8"))
    valid_tags, valid_demos = load_valid_tags(REPO_ROOT)

    proposed = item.get("proposed", {})
    for _aname, pdata in proposed.items():
        if not isinstance(pdata, dict):
            continue
        for t in pdata.get("tags", []):
            if t in valid_tags and t not in item["tags"]:
                item["tags"].append(t)
        for d in pdata.get("demos", []):
            if d in valid_demos and d not in item["demos"]:
                item["demos"].append(d)
        if pdata.get("summary") and not item.get("summary"):
            item["summary"] = pdata["summary"]
        if pdata.get("clips") and not item.get("clips"):
            item["clips"] = pdata["clips"]

    if item.get("status") == "draft":
        item["status"] = "review"
    item["updated"] = str(date.today())
    item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[accept] merged proposals for {item_id} (status={item['status']})")


def publish_item(item_id: str) -> None:
    """Validate publishing requirements and mark an item as `published`."""
    item_dir = REPO_ROOT / "items" / item_id
    item_json_path = item_dir / "item.json"
    if not item_json_path.exists():
        raise SystemExit(f"Item not found: {item_id}")
    item = json.loads(item_json_path.read_text(encoding="utf-8"))

    missing = []
    for k in ("id", "title", "kind", "summary"):
        if not item.get(k):
            missing.append(k)
    src = item.get("source", {})
    if not (src.get("url") or src.get("origin")):
        missing.append("source.url|source.origin")
    rights = item.get("rights", {})
    if not rights.get("status") or rights.get("status") == "unknown":
        missing.append("rights.status (!= unknown)")
    if not rights.get("credit"):
        missing.append("rights.credit")
    if not item.get("files", {}).get("media", {}).get("path"):
        missing.append("files.media")

    if missing:
        raise SystemExit(f"Cannot publish {item_id}; missing required fields: {', '.join(missing)}")

    item["status"] = "published"
    item["updated"] = str(date.today())
    item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[publish] {item_id} -> published")


def collect_inbox_files(inbox_dir: Path) -> list[tuple[Path, str | None]]:
    """Return list of (file_path, collection_name) from inbox_dir, skipping sidecars and hidden files."""
    entries: list[tuple[Path, str | None]] = []
    if not inbox_dir.exists():
        return entries

    for path in sorted(inbox_dir.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(inbox_dir).parts
        if any(p.startswith(".") for p in rel_parts):
            continue
        if any(path.name.endswith(sfx) for sfx in SIDECAR_SUFFIXES):
            continue
        kind = detect_kind(path)
        if not kind:
            continue
        collection = rel_parts[0] if len(rel_parts) > 1 else None
        entries.append((path, collection))
    return entries


def ingest_file(
    file_path: Path,
    collection: str | None,
    items_dir: Path,
    done_dir: Path,
    cfg: dict[str, Any],
    existing_hashes: dict[str, str],
    existing_phashes: dict[str, str],
    enabled_analyzers: list[str],
    dry_run: bool = False,
    keep_inbox: bool = False,
) -> str | None:
    kind = detect_kind(file_path)
    if not kind:
        return None

    file_sha = sha256_file(file_path)
    if file_sha in existing_hashes:
        dup_id = existing_hashes[file_sha]
        print(f"[skip] {file_path.name} is an exact sha256 duplicate of '{dup_id}'")
        if not dry_run and not keep_inbox:
            done_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(file_path), str(done_dir / file_path.name))
        return None

    sidecar = read_sidecars(file_path)
    raw_title = sidecar.get("title") or human_title(file_path.stem)
    base_slug = sidecar.get("id") or slugify(file_path.stem)
    item_id = base_slug
    idx = 2
    while (items_dir / item_id / "item.json").exists():
        item_id = f"{base_slug}-{idx}"
        idx += 1

    if dry_run:
        print(f"[dry-run] would ingest '{file_path.name}' -> items/{item_id}/ (kind={kind}, collection={collection})")
        existing_hashes[file_sha] = item_id
        return item_id

    item_dir = items_dir / item_id
    item_dir.mkdir(parents=True, exist_ok=True)
    today = str(date.today())

    src_info = {
        "url": None,
        "origin": None,
        "archive": None,
        "retrieved": today,
        "via": None,
        **(sidecar.get("source") or {}),
    }
    rights_info = {
        "status": "unknown",
        "license": None,
        "license_url": None,
        "credit": "",
        "notes": "",
        **(sidecar.get("rights") or {}),
    }

    provenance: list[dict[str, Any]] = [
        {
            "step": "obtained",
            "from": src_info.get("url") or file_path.name,
            "date": src_info.get("retrieved") or today,
            "sha256": file_sha,
        }
    ]

    # Derive web media, proxy, poster, thumb
    if kind == "video":
        files = derive_video(file_path, item_dir, cfg, provenance)
    elif kind == "animation":
        files = derive_animation(file_path, item_dir, cfg, provenance)
    elif kind == "image":
        files = derive_image(file_path, item_dir, cfg, provenance)
    elif kind == "audio":
        files = derive_audio(file_path, item_dir, cfg, provenance)
    elif kind in ("model", "splat"):
        files = derive_model_or_splat(file_path, item_dir, kind, cfg, provenance)
    elif kind == "vector":
        files = derive_vector(file_path, item_dir, cfg, provenance)
    elif kind == "text":
        files = derive_text(file_path, item_dir, cfg, provenance)
    else:
        files = {}

    # Handle original file retention policy (< keep_original_max_bytes)
    max_orig = int(cfg.get("keep_original_max_bytes", 26214400))
    orig_ext = file_path.suffix.lower()
    orig_name = f"original{orig_ext}"
    orig_dest = item_dir / orig_name

    if "original" not in files:
        if file_path.stat().st_size <= max_orig:
            if not orig_dest.exists():
                shutil.copy2(file_path, orig_dest)
            files["original"] = {
                **make_file_record(orig_dest, orig_name),
                "kept": True,
            }
        else:
            files["original"] = {
                "path": orig_name,
                "type": MIME_BY_EXT.get(orig_ext, "application/octet-stream"),
                "bytes": file_path.stat().st_size,
                "sha256": file_sha,
                "kept": False,
                "url": src_info.get("direct_url") or src_info.get("url"),
            }

    # Remove direct_url helper key if present
    src_info.pop("direct_url", None)

    # Extract year hint from filename if present (e.g. (1894), 1895, 1900, 1887)
    m_year = re.search(r"\b(18[7-9]\d|19\d\d|20[0-2]\d)\b", file_path.stem)
    inferred_date = sidecar.get("date") or (m_year.group(1) if m_year else None)

    item: dict[str, Any] = {
        "id": item_id,
        "title": raw_title,
        "kind": kind,
        "status": sidecar.get("status", "draft"),
        "summary": sidecar.get("summary", f"{raw_title} ({kind})."),
        "description": sidecar.get("description", ""),
        "tags": list(sidecar.get("tags", [])),
        "keywords": list(sidecar.get("keywords", [])),
        "collections": list(sidecar.get("collections") or ([collection] if collection else [])),
        "demos": list(sidecar.get("demos", [])),
        "creators": list(sidecar.get("creators", [])),
        "date": inferred_date,
        "source": src_info,
        "rights": rights_info,
        "files": files,
        "provenance": provenance,
        "added": today,
        "updated": today,
    }

    # Run analyzer chain
    run_source = orig_dest if orig_dest.exists() else file_path
    run_analyzers(
        item_dir=item_dir,
        item=item,
        source_file=run_source,
        enabled=enabled_analyzers,
        repo_root=REPO_ROOT,
        allow_remote=False,
    )

    # Refresh poster/thumb file records if render/audio analyzers created them
    for key, fname in (("poster", "poster.webp"), ("thumb", "thumb.webp")):
        fpath = item_dir / fname
        if fpath.exists() and key not in item["files"]:
            item["files"][key] = make_file_record(fpath, fname)

    # Check perceptual hash duplicate for GIFs
    ph = item.get("files", {}).get("media", {}).get("phash")
    if ph:
        if ph in existing_phashes and existing_phashes[ph] != item_id:
            item.setdefault("proposed", {}).setdefault("gif", {})["near_duplicate_of"] = existing_phashes[ph]
        else:
            existing_phashes[ph] = item_id

    existing_hashes[file_sha] = item_id
    if item["files"].get("media", {}).get("sha256"):
        existing_hashes[item["files"]["media"]["sha256"]] = item_id

    # Write item.json
    item_json_path = item_dir / "item.json"
    item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Move processed file out of inbox unless keep_inbox is set
    if not keep_inbox:
        done_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(file_path), str(done_dir / file_path.name))

    print(f"[ingested] {file_path.name} -> items/{item_id}/ ({kind})")
    return item_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest media from inbox/ into items/<id>/")
    parser.add_argument("--inbox", type=Path, default=REPO_ROOT / "inbox", help="Inbox directory to scan")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without modifying files")
    parser.add_argument("--keep-inbox", action="store_true", help="Copy from inbox instead of moving files out")
    parser.add_argument(
        "--analyze",
        type=str,
        default=None,
        help="Comma-separated analyzers to run (default from mediatheque.yaml)",
    )
    parser.add_argument("--item", type=str, default=None, help="Re-run analyzers on an existing item ID")
    parser.add_argument("--clips", type=str, default=None, metavar="ID", help="Propose clips for item ID")
    parser.add_argument("--frames", type=str, default=None, metavar="ID", help="Generate frames.zip and sheet.png for GIF item ID")
    parser.add_argument("--accept", type=str, default=None, metavar="ID", help="Accept analyzer proposals for item ID")
    parser.add_argument("--publish", type=str, default=None, metavar="ID", help="Mark item ID as published after checking requirements")
    args = parser.parse_args()

    cfg = load_config()
    enabled_analyzers = (
        [x.strip() for x in args.analyze.split(",") if x.strip()]
        if args.analyze
        else list(cfg.get("default_analyzers", ["probe", "gif", "scenes", "flow", "audio", "render", "text"]))
    )

    if args.clips:
        propose_clips_for_item(args.clips)
        return
    if args.frames:
        generate_gif_frames_and_sheet(args.frames)
        return
    if args.accept:
        accept_proposals(args.accept)
        return
    if args.publish:
        publish_item(args.publish)
        return

    items_dir = REPO_ROOT / "items"
    items_dir.mkdir(parents=True, exist_ok=True)

    if args.item:
        item_dir = items_dir / args.item
        item_json = item_dir / "item.json"
        if not item_json.exists():
            raise SystemExit(f"Item not found: {args.item}")
        item = json.loads(item_json.read_text(encoding="utf-8"))
        orig_rel = item.get("files", {}).get("original", {}).get("path")
        media_rel = item.get("files", {}).get("media", {}).get("path")
        src = item_dir / (orig_rel if orig_rel and (item_dir / orig_rel).exists() else media_rel)
        run_analyzers(item_dir, item, src, enabled_analyzers, REPO_ROOT)
        item["updated"] = str(date.today())
        item_json.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[analyzed] {args.item}")
        return

    inbox_dir: Path = args.inbox.resolve()
    done_dir = (REPO_ROOT / "inbox" / ".done").resolve()
    files_to_process = collect_inbox_files(inbox_dir)
    if not files_to_process:
        print(f"No media files found in {inbox_dir}")
        return

    existing_hashes = get_existing_hashes(items_dir)
    existing_phashes = get_existing_phashes(items_dir)

    ingested_ids: list[str] = []
    for fpath, collection in files_to_process:
        new_id = ingest_file(
            file_path=fpath,
            collection=collection,
            items_dir=items_dir,
            done_dir=done_dir,
            cfg=cfg,
            existing_hashes=existing_hashes,
            existing_phashes=existing_phashes,
            enabled_analyzers=enabled_analyzers,
            dry_run=args.dry_run,
            keep_inbox=args.keep_inbox,
        )
        if new_id:
            ingested_ids.append(new_id)

    print(f"Processed {len(ingested_ids)} new item(s).")


if __name__ == "__main__":
    main()
