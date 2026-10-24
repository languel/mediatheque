#!/usr/bin/env python3
"""Mediathèque build tool: cuts clip derivatives and generates catalog.json, catalog.jsonl, review.json, and llms.txt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None

try:
    from PIL import Image
except ImportError:
    Image = None

REPO_ROOT = Path(__file__).resolve().parent.parent


def bootstrap_venv(script_path: Path) -> None:
    if os.environ.get("_MEDIATHEQUE_VENV_ACTIVE"):
        return
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    if not in_venv:
        venv_python = script_path.resolve().parent.parent / ".venv" / "bin" / "python"
        if venv_python.exists():
            os.environ["_MEDIATHEQUE_VENV_ACTIVE"] = "1"
            os.execv(str(venv_python), [str(venv_python), str(script_path.resolve())] + sys.argv[1:])


def load_config() -> dict[str, Any]:
    cfg_path = REPO_ROOT / "mediatheque.yaml"
    if not cfg_path.exists():
        return {}
    if yaml is not None:
        return yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    # Zero-dependency fallback parser for mediatheque.yaml
    cfg: dict[str, Any] = {}
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            k = k.strip()
            v = v.split("#")[0].strip().strip('"').strip("'")
            if v.isdigit():
                cfg[k] = int(v)
            elif v:
                cfg[k] = v
    return cfg


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_clip_files(item_dir: Path, item: dict[str, Any]) -> bool:
    """Cut clip media and thumbnail files if defined in item['clips'] and missing on disk."""
    clips = item.get("clips") or []
    if not clips:
        return False

    media_rel = item.get("files", {}).get("media", {}).get("path")
    if not media_rel:
        return False
    parent_media = item_dir / media_rel
    if not parent_media.exists():
        return False

    changed = False
    today = str(date.today())

    for clip in clips:
        n = int(clip.get("n", 1))
        t_in = float(clip.get("in", 0.0))
        t_out = float(clip.get("out", 0.0))
        dur = max(0.1, round(t_out - t_in, 3))
        clip_rel = clip.get("file")
        thumb_rel = clip.get("thumb")

        if clip_rel:
            clip_path = item_dir / clip_rel
            clip_path.parent.mkdir(parents=True, exist_ok=True)
            if not clip_path.exists():
                ext = clip_path.suffix.lower()
                if ext == ".webm":
                    args = [
                        "-ss",
                        str(t_in),
                        "-t",
                        str(dur),
                        "-i",
                        str(parent_media),
                        "-vf",
                        "scale='min(768,iw)':-2",
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
                        "-an",
                        str(clip_path),
                    ]
                elif ext == ".mp3":
                    args = [
                        "-ss",
                        str(t_in),
                        "-t",
                        str(dur),
                        "-i",
                        str(parent_media),
                        "-vn",
                        "-c:a",
                        "libmp3lame",
                        "-b:a",
                        "192k",
                        str(clip_path),
                    ]
                else:
                    args = [
                        "-ss",
                        str(t_in),
                        "-t",
                        str(dur),
                        "-i",
                        str(parent_media),
                        "-c:v",
                        "libx264",
                        "-crf",
                        "23",
                        "-an",
                        str(clip_path),
                    ]
                subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)
                prov_entry = {
                    "step": "derived",
                    "file": clip_rel,
                    "tool": "ffmpeg",
                    "args": f"-ss {t_in} -t {dur} (clip {n:02d})",
                    "date": today,
                }
                if not any(p.get("file") == clip_rel for p in item.get("provenance", [])):
                    item.setdefault("provenance", []).append(prov_entry)
                changed = True

        if thumb_rel and item.get("kind") in ("video", "animation"):
            thumb_path = item_dir / thumb_rel
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            if not thumb_path.exists():
                mid_t = round(t_in + dur * 0.35, 2)
                tmp_frame = thumb_path.with_suffix(".tmp.png")
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-ss",
                        str(mid_t),
                        "-i",
                        str(parent_media),
                        "-frames:v",
                        "1",
                        str(tmp_frame),
                    ],
                    check=False,
                )
                if tmp_frame.exists():
                    with Image.open(tmp_frame) as im:
                        rgb = im.convert("RGB")
                        w, h = rgb.size
                        side = min(w, h)
                        crop = rgb.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
                        crop.resize((480, 480), Image.Resampling.LANCZOS).save(thumb_path, "WEBP", quality=85)
                    tmp_frame.unlink()
                    changed = True

    return changed


def format_aspect_ratio_str(w: Any, h: Any) -> str | None:
    if not w or not h:
        return None
    try:
        wf = float(w)
        hf = float(h)
        if wf <= 0 or hf <= 0:
            return None
    except Exception:
        return None

    import math

    val = wf / hf
    standards = [
        (1.0, "1:1"),
        (4 / 3, "4:3"),
        (3 / 4, "3:4"),
        (16 / 9, "16:9"),
        (9 / 16, "9:16"),
        (3 / 2, "3:2"),
        (2 / 3, "2:3"),
        (5 / 4, "5:4"),
        (4 / 5, "4:5"),
        (21 / 9, "21:9"),
        (1.85, "1.85:1"),
        (2.39, "2.39:1"),
    ]
    for r_val, r_label in standards:
        if abs(val - r_val) / r_val <= 0.02:
            return r_label
    g = math.gcd(int(round(wf)), int(round(hf)))
    simp_w, simp_h = int(round(wf)) // g, int(round(hf)) // g
    if simp_w <= 24 and simp_h <= 24:
        return f"{simp_w}:{simp_h}"
    if val >= 1.0:
        return f"{round(val, 2)}:1"
    return f"1:{round(1 / val, 2)}"


def compact_item_entry(item: dict[str, Any], base_url: str) -> dict[str, Any]:
    item_id = item["id"]
    files = item.get("files", {})
    media_info = files.get("media", {})
    proxy_info = files.get("proxy", {})
    thumb_info = files.get("thumb", {})
    poster_info = files.get("poster", {})
    orig_info = files.get("original", {})
    rights = item.get("rights", {})
    creators = item.get("creators", [])

    # For animations where original.gif is kept, expose both gif and mp4/webm clearly
    media_rel = media_info.get("path")
    orig_rel = orig_info.get("path") if orig_info.get("kept") else None
    primary_stream_rel = (
        orig_rel
        if (item.get("kind") == "animation" and orig_rel and orig_rel.endswith(".gif"))
        else media_rel
    )

    entry_w = media_info.get("width") or orig_info.get("width")
    entry_h = media_info.get("height") or orig_info.get("height")

    entry: dict[str, Any] = {
        "id": item_id,
        "type": "item",
        "title": item.get("title", ""),
        "kind": item.get("kind", ""),
        "status": item.get("status", "published"),
        "summary": item.get("summary", ""),
        "tags": item.get("tags", []),
        "keywords": item.get("keywords", []),
        "collections": item.get("collections", []),
        "demos": item.get("demos", []),
        "date": item.get("date"),
        "creators": [c.get("name") for c in creators if c.get("name")],
        "creator_roles": creators,
        "rights": {
            "status": rights.get("status", "unknown"),
            "license": rights.get("license"),
            "license_url": rights.get("license_url"),
        },
        "credit": rights.get("credit", ""),
        "source_url": item.get("source", {}).get("url") or item.get("source", {}).get("origin"),
        "archive": item.get("source", {}).get("archive"),
        "thumb": f"items/{item_id}/{thumb_info['path']}" if thumb_info.get("path") else None,
        "poster": f"items/{item_id}/{poster_info['path']}" if poster_info.get("path") else None,
        "media": f"items/{item_id}/{primary_stream_rel}" if primary_stream_rel else None,
        "video_media": f"items/{item_id}/{media_rel}" if media_rel else None,
        "proxy": f"items/{item_id}/{proxy_info['path']}" if proxy_info.get("path") else None,
        "original": (
            f"items/{item_id}/{orig_rel}"
            if orig_rel
            else orig_info.get("url")
        ),
        "width": entry_w,
        "height": entry_h,
        "aspect_ratio": format_aspect_ratio_str(entry_w, entry_h),
        "duration": media_info.get("duration"),
        "fps": media_info.get("fps"),
        "frames": media_info.get("frames"),
        "triangles": item.get("triangles") or media_info.get("triangles"),
        "splats": item.get("splats") or media_info.get("splats"),
        "formula": item.get("formula"),
        "math_type": item.get("math_type"),
        "bytes": (orig_info.get("bytes") if orig_rel and item.get("kind") == "animation" else media_info.get("bytes")),
        "url": f"{base_url}/items/{item_id}/{primary_stream_rel}" if primary_stream_rel else f"{base_url}/items/{item_id}/item.json",
        "added": item.get("added"),
    }

    if item.get("derived_from"):
        entry["derived_from"] = item["derived_from"]
    if item.get("plate"):
        entry["plate"] = item["plate"]
    if item.get("sequence"):
        entry["sequence"] = item["sequence"]
    if item.get("clips"):
        entry["clips_count"] = len(item["clips"])

    return entry


def compact_clip_entry(item: dict[str, Any], clip: dict[str, Any], base_url: str) -> dict[str, Any]:
    parent_id = item["id"]
    n = int(clip.get("n", 1))
    clip_id = f"{parent_id}/{n:02d}"
    t_in = float(clip.get("in", 0.0))
    t_out = float(clip.get("out", 0.0))
    duration = round(max(0.0, t_out - t_in), 2)

    parent_files = item.get("files", {})
    parent_media_rel = parent_files.get("media", {}).get("path", "media.webm")
    parent_thumb_rel = parent_files.get("thumb", {}).get("path", "thumb.webp")
    rights = item.get("rights", {})
    creators = item.get("creators", [])

    clip_file_rel = clip.get("file")
    clip_thumb_rel = clip.get("thumb")

    if clip_file_rel and (REPO_ROOT / "items" / parent_id / clip_file_rel).exists():
        media_path_str = f"items/{parent_id}/{clip_file_rel}"
        clip_bytes = (REPO_ROOT / "items" / parent_id / clip_file_rel).stat().st_size
    else:
        media_path_str = f"items/{parent_id}/{parent_media_rel}#t={t_in},{t_out}"
        clip_bytes = None

    if clip_thumb_rel and (REPO_ROOT / "items" / parent_id / clip_thumb_rel).exists():
        thumb_path_str = f"items/{parent_id}/{clip_thumb_rel}"
    else:
        thumb_path_str = f"items/{parent_id}/{parent_thumb_rel}"

    # Merge clip tags with inherited format/look/era tags if not overridden
    clip_tags = list(clip.get("tags") or item.get("tags", []))
    clip_demos = list(clip.get("demos") or item.get("demos", []))

    return {
        "id": clip_id,
        "type": "clip",
        "parent": parent_id,
        "parent_title": item.get("title", ""),
        "n": n,
        "title": clip.get("title", f"Clip {n:02d}"),
        "kind": item.get("kind", "video"),
        "status": "published",
        "summary": clip.get("summary") or item.get("summary", ""),
        "tags": clip_tags,
        "keywords": item.get("keywords", []),
        "collections": item.get("collections", []),
        "demos": clip_demos,
        "date": item.get("date"),
        "creators": [c.get("name") for c in creators if c.get("name")],
        "rights": {
            "status": rights.get("status", "unknown"),
            "license": rights.get("license"),
            "license_url": rights.get("license_url"),
        },
        "credit": rights.get("credit", ""),
        "in": t_in,
        "out": t_out,
        "duration": duration,
        "width": parent_files.get("media", {}).get("width"),
        "height": parent_files.get("media", {}).get("height"),
        "aspect_ratio": format_aspect_ratio_str(
            parent_files.get("media", {}).get("width"),
            parent_files.get("media", {}).get("height"),
        ),
        "bytes": clip_bytes,
        "thumb": thumb_path_str,
        "media": media_path_str,
        "parent_media": f"items/{parent_id}/{parent_media_rel}#t={t_in},{t_out}",
        "url": f"{base_url}/{media_path_str}",
        "added": item.get("added"),
    }


def generate_llms_txt(
    cfg: dict[str, Any],
    published_items: list[dict[str, Any]],
    clip_entries: list[dict[str, Any]],
) -> str:
    base_url = cfg.get("base_url", "https://languel.github.io/mediatheque").rstrip("/")
    raw_url = cfg.get("raw_base_url", "https://raw.githubusercontent.com/languel/mediatheque/main").rstrip("/")
    jsdelivr_url = cfg.get("jsdelivr_base_url", "https://cdn.jsdelivr.net/gh/languel/mediatheque@main").rstrip("/")

    tags_data = json.loads((REPO_ROOT / "tools" / "tags.json").read_text(encoding="utf-8"))
    counts_by_kind: dict[str, int] = {}
    for it in published_items:
        k = it.get("kind", "other")
        counts_by_kind[k] = counts_by_kind.get(k, 0) + 1

    kind_summary = ", ".join(f"{v} {k}" for k, v in sorted(counts_by_kind.items())) or "0 items"

    lines = [
        "# Mediathèque — Agent & LLM Guide (`llms.txt`)",
        "",
        "> A personal, public archive of teaching media: film, images, animated GIFs, sound,",
        "> 3D models, Gaussian splats, SVG vectors, and text. Served statically with",
        "> `Access-Control-Allow-Origin: *` so any browser sketch, Genereti node, p5.js",
        "> canvas, Three.js scene, or student assignment can stream or download by stable URL.",
        "",
        f"Published inventory: {len(published_items)} items ({kind_summary}) and {len(clip_entries)} clips.",
        "",
        "## 1. Machine-Readable Indexes (Never Scrape HTML)",
        "",
        f"- **Compact Catalog (`catalog.json`)**: `{base_url}/catalog.json`",
        "  JSON array of all published items (`type: \"item\"`) and clips (`type: \"clip\"`, `parent: \"<id>\"`).",
        "  Fields: `id`, `type`, `title`, `kind`, `summary`, `tags`, `keywords`, `collections`,",
        "  `demos`, `date`, `creators`, `rights` (`status`, `license`, `license_url`), `credit`,",
        "  `thumb`, `poster`, `media`, `proxy`, `original`, `width`, `height`, `duration`, `bytes`, `url`.",
        f"- **Full Records (`catalog.jsonl`)**: `{base_url}/catalog.jsonl`",
        "  One complete `item.json` object per line (ideal for `grep`, `jq -c`, and streaming parsers).",
        f"- **Per-Item Authoritative Record**: `{base_url}/items/<id>/item.json`",
        "  Includes full `files` hashes, frame timings, `clips`, and `provenance` derivation history.",
        f"- **Controlled Vocabulary**: `{base_url}/tools/tags.json`",
        "",
        "## 2. Stable URL Patterns & CORS",
        "",
        "All endpoints send `Access-Control-Allow-Origin: *`:",
        "",
        f"1. **GitHub Pages (Primary, correct MIME types)**:",
        f"   - Web derivative: `{base_url}/items/<id>/media.<ext>`",
        f"   - Perception proxy (768px, 15fps WebM): `{base_url}/items/<id>/proxy.webm`",
        f"   - Original GIF (when `kind == \"animation\"`): `{base_url}/items/<id>/original.gif`",
        f"   - Clip file: `{base_url}/items/<id>/clips/<nn>.webm`",
        f"   - Media fragment on full work: `{base_url}/items/<id>/media.webm#t=<in>,<out>`",
        f"   - Square thumbnail (480px WebP): `{base_url}/items/<id>/thumb.webp`",
        f"   - Detail page in gallery: `{base_url}/site/index.html#/<id>` (or `#/<id>/<nn>` for clips)",
        f"2. **jsDelivr CDN (Versioned, cached, up to 20 MB)**:",
        f"   - `{jsdelivr_url}/items/<id>/media.<ext>`",
        f"3. **GitHub Raw (Fallback)**:",
        f"   - `{raw_url}/items/<id>/media.<ext>`",
        "",
        "## 3. Controlled Vocabulary (`tags` & `demos`)",
        "",
        "### Facets and Allowed Tags",
    ]

    for facet_key, facet_obj in tags_data.get("facets", {}).items():
        tag_names = ", ".join(f"`{t}`" for t in facet_obj.get("tags", {}).keys())
        kinds_str = "/".join(facet_obj.get("kinds", []))
        lines.append(f"- **{facet_key}** ({kinds_str}): {tag_names}")

    demos_list = ", ".join(f"`{d}`" for d in tags_data.get("demos", {}).keys())
    lines.extend(
        [
            "",
            "### Teaching Demos (`demos`)",
            demos_list,
            "",
            "## 4. Query Recipes",
            "",
            "### Recipe A: Find a public-domain clip or animation under 5s with a full figure walking",
            "```bash",
            "jq '[.[] | select(",
            '  .rights.status == "public-domain" and',
            "  (.duration != null and .duration <= 5.0) and",
            '  (.tags | index("person")) and',
            '  (.tags | index("fullbody")) and',
            '  (.tags | index("walk"))',
            ")]' catalog.json",
            "```",
            "",
            "### Recipe B: Find a clean single-person pose-estimation video with a static camera",
            "```bash",
            "jq '[.[] | select(",
            '  (.demos | index("pose")) and',
            '  (.tags | index("single")) and',
            '  (.tags | index("static-camera"))',
            ") | {id, title, url, proxy, credit}]' catalog.json",
            "```",
            "",
            "### Recipe C: Give me the credit lines for a list of item IDs or URLs",
            "```bash",
            'python3 tools/media.py credit sandow-1894 muybridge-human-male-walking-animated',
            "```",
            "Or with `jq` directly on `catalog.json`:",
            "```bash",
            'jq -r \'.[] | select(.id == "sandow-1894") | "\\(.title): \\(.credit) (\\(.source_url))"\' catalog.json',
            "```",
            "",
            "## 5. Genereti / ComfyUI Integration (`GeneretiMediaStream`)",
            "",
            "The **ꘇ 2D stream** node in Genereti (`custom_nodes.genereti`) is registered under the internal ComfyUI node `type`: `\"GeneretiMediaStream\"`.",
            "- Configure `properties.genereti_media_url` with the full CORS-enabled Mediathèque URL (`proxy.webm`, `original.gif`, or `media.<ext>`).",
            "- Configure `properties.genereti_media_kind` (`\"auto\"`, `\"video\"`, or `\"image\"`) and `properties.genereti_media_fps` (`30`).",
            "- In the gallery detail view (`#/<id>`), the **ꘇ 2D stream** tab's **Copy Node for ComfyUI** button copies both ComfyUI's native `data-metadata` node clipboard format (press `Cmd/Ctrl+V` directly on any ComfyUI canvas to drop the node at the cursor) and a standalone workflow `.json`.",
            "",
            "## 6. Attribution & Credit Rule",
            "",
            "Every item and clip carries `credit`, `rights.status`, `rights.license`, and `source_url`.",
            "When generating code (HTML, p5.js, Three.js, shaders, notebooks) or embedding media from",
            "Mediathèque, **always include the item's `credit` line in a code comment or caption**.",
            "",
        ]
    )
    return "\n".join(lines)


def build_all(cut_clips: bool = True) -> dict[str, Any]:
    cfg = load_config()
    base_url = cfg.get("base_url", "https://languel.github.io/mediatheque").rstrip("/")
    items_dir = REPO_ROOT / "items"

    published_full: list[dict[str, Any]] = []
    catalog_entries: list[dict[str, Any]] = []
    clip_entries: list[dict[str, Any]] = []
    review_entries: list[dict[str, Any]] = []

    # First pass: collect derived_from backlinks ("GIFs made from this")
    derived_children: dict[str, list[dict[str, str]]] = {}
    all_items: list[tuple[Path, dict[str, Any]]] = []

    if items_dir.exists():
        for item_json_path in sorted(items_dir.glob("*/item.json")):
            item = json.loads(item_json_path.read_text(encoding="utf-8"))
            all_items.append((item_json_path, item))
            parent_ref = item.get("derived_from")
            if parent_ref and item.get("status") == "published":
                derived_children.setdefault(parent_ref, []).append(
                    {"id": item["id"], "title": item.get("title", item["id"]), "kind": item.get("kind", "")}
                )

    for item_json_path, item in all_items:
        item_dir = item_json_path.parent
        if cut_clips and item.get("clips"):
            if ensure_clip_files(item_dir, item):
                item_json_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        status = item.get("status", "draft")
        if status == "published":
            published_full.append(item)
            compact = compact_item_entry(item, base_url)
            if item["id"] in derived_children:
                compact["derivatives"] = derived_children[item["id"]]
            catalog_entries.append(compact)

            for clip in item.get("clips") or []:
                c_entry = compact_clip_entry(item, clip, base_url)
                catalog_entries.append(c_entry)
                clip_entries.append(c_entry)
        elif status in ("draft", "review"):
            compact = compact_item_entry(item, base_url)
            compact["proposed"] = item.get("proposed", {})
            compact["proposed_tags"] = item.get("proposed_tags", [])
            compact["notes"] = item.get("rights", {}).get("notes", "")
            review_entries.append(compact)

    # Sort deterministically
    catalog_entries.sort(key=lambda x: (x["id"], 0 if x["type"] == "item" else x.get("n", 1)))
    published_full.sort(key=lambda x: x["id"])
    review_entries.sort(key=lambda x: x["id"])

    # Write catalog.json
    (REPO_ROOT / "catalog.json").write_text(
        json.dumps(catalog_entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Write catalog.jsonl
    jsonl_lines = [json.dumps(it, ensure_ascii=False, sort_keys=False) for it in published_full]
    (REPO_ROOT / "catalog.jsonl").write_text(
        ("\n".join(jsonl_lines) + "\n") if jsonl_lines else "",
        encoding="utf-8",
    )

    # Write review.json (used by the gallery Review Queue view)
    (REPO_ROOT / "review.json").write_text(
        json.dumps(review_entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Write llms.txt
    llms_content = generate_llms_txt(cfg, published_full, clip_entries)
    (REPO_ROOT / "llms.txt").write_text(llms_content, encoding="utf-8")

    return {
        "published_items": len(published_full),
        "published_clips": len(clip_entries),
        "review_items": len(review_entries),
    }


def main() -> None:
    bootstrap_venv(Path(__file__))
    parser = argparse.ArgumentParser(description="Build catalog.json, catalog.jsonl, review.json, and llms.txt")
    parser.add_argument("--no-cut-clips", action="store_true", help="Skip cutting clip video/audio files")
    args = parser.parse_args()

    stats = build_all(cut_clips=not args.no_cut_clips)
    print(
        f"[build] wrote catalog.json ({stats['published_items']} items + {stats['published_clips']} clips), "
        f"catalog.jsonl, review.json ({stats['review_items']} draft/review), and llms.txt"
    )


if __name__ == "__main__":
    main()
