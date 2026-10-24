#!/usr/bin/env python3
"""Mediathèque validation tool (CI and pre-commit): checks item.json schema, vocabulary, hashes, limits, sanitization, and catalog freshness."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

from analyzers import load_valid_tags  # noqa: E402
from build import compact_clip_entry, compact_item_entry, generate_llms_txt  # noqa: E402
from ingest import MIME_BY_EXT  # noqa: E402


def bootstrap_venv(script_path: Path) -> None:
    if os.environ.get("_MEDIATHEQUE_VENV_ACTIVE"):
        return
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    if not in_venv:
        venv_python = script_path.resolve().parent.parent / ".venv" / "bin" / "python"
        if venv_python.exists():
            os.environ["_MEDIATHEQUE_VENV_ACTIVE"] = "1"
            os.execv(str(venv_python), [str(venv_python), str(script_path.resolve())] + sys.argv[1:])

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VALID_KINDS = {"video", "image", "animation", "audio", "model", "splat", "vector", "text", "dataset", "sdf"}
VALID_STATUSES = {"draft", "review", "published", "withdrawn"}
VALID_RIGHTS = {"public-domain", "cc", "licensed", "fair-use-teaching", "unknown"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


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


def check_svg_sanitized(svg_path: Path, item_id: str, errors: list[str]) -> None:
    text = svg_path.read_text(encoding="utf-8", errors="replace")
    if re.search(r"<script\b", text, re.IGNORECASE):
        errors.append(f"[{item_id}] SVG {svg_path.name} contains forbidden <script> element")
    if re.search(r"\son[a-z]+\s*=", text, re.IGNORECASE):
        errors.append(f"[{item_id}] SVG {svg_path.name} contains forbidden inline event handler")
    if re.search(r"\s(xlink:href|href)\s*=\s*(['\"])https?://", text, re.IGNORECASE):
        errors.append(f"[{item_id}] SVG {svg_path.name} contains forbidden external http(s) reference")


def check_no_raw_scripts(text: str, label: str, item_id: str, errors: list[str]) -> None:
    if re.search(r"<script\b", text, re.IGNORECASE):
        errors.append(f"[{item_id}] {label} contains forbidden <script> tag")


def validate_repo(verify_hashes: bool = True, verify_catalog: bool = True) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    cfg = load_config()
    hard_max_bytes = int(cfg.get("hard_max_bytes", 52428800))  # 50 MB
    base_url = cfg.get("base_url", "https://languel.github.io/mediatheque").rstrip("/")
    valid_tags, valid_demos = load_valid_tags(REPO_ROOT)

    items_dir = REPO_ROOT / "items"
    if not items_dir.exists():
        errors.append("items/ directory does not exist")
        return errors, warnings

    seen_ids: set[str] = set()
    published_full: list[dict[str, Any]] = []
    expected_catalog: list[dict[str, Any]] = []
    expected_clips: list[dict[str, Any]] = []
    derived_children: dict[str, list[dict[str, str]]] = {}

    item_files = sorted(items_dir.glob("*/item.json"))
    loaded_items: list[tuple[Path, dict[str, Any]]] = []

    for item_json_path in item_files:
        folder_name = item_json_path.parent.name
        try:
            item = json.loads(item_json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"[{folder_name}] invalid JSON in item.json: {exc}")
            continue
        loaded_items.append((item_json_path, item))
        if item.get("derived_from") and item.get("status") == "published":
            derived_children.setdefault(item["derived_from"], []).append(
                {"id": item.get("id", folder_name), "title": item.get("title", folder_name), "kind": item.get("kind", "")}
            )

    for item_json_path, item in loaded_items:
        item_dir = item_json_path.parent
        folder_name = item_dir.name
        item_id = item.get("id")

        # 1. ID and slug validation
        if not item_id or not isinstance(item_id, str):
            errors.append(f"[{folder_name}] missing or non-string 'id'")
            item_id = folder_name
        elif item_id != folder_name:
            errors.append(f"[{folder_name}] item.id '{item_id}' does not match folder name '{folder_name}'")

        if not SLUG_RE.match(item_id):
            errors.append(f"[{item_id}] id '{item_id}' is not a valid lowercase ASCII slug")
        if item_id in seen_ids:
            errors.append(f"[{item_id}] duplicate item id")
        seen_ids.add(item_id)

        # 2. Required top-level fields
        for req_key in (
            "id",
            "title",
            "kind",
            "status",
            "summary",
            "tags",
            "keywords",
            "collections",
            "demos",
            "creators",
            "source",
            "rights",
            "files",
            "provenance",
            "added",
            "updated",
        ):
            if req_key not in item:
                errors.append(f"[{item_id}] missing required field '{req_key}'")

        kind = item.get("kind")
        if kind not in VALID_KINDS:
            errors.append(f"[{item_id}] invalid kind '{kind}'")

        status = item.get("status")
        if status not in VALID_STATUSES:
            errors.append(f"[{item_id}] invalid status '{status}'")

        # 3. Vocabulary validation (tags & demos)
        for t in item.get("tags", []):
            if t not in valid_tags:
                errors.append(f"[{item_id}] unknown tag '{t}' not in tools/tags.json")
        for d in item.get("demos", []):
            if d not in valid_demos:
                errors.append(f"[{item_id}] unknown demo '{d}' not in tools/tags.json")

        # 4. Rights & publishing validation
        rights = item.get("rights") or {}
        r_status = rights.get("status")
        if r_status not in VALID_RIGHTS:
            errors.append(f"[{item_id}] invalid rights.status '{r_status}'")

        if status != "draft" and r_status == "unknown":
            errors.append(f"[{item_id}] rights.status cannot be 'unknown' when status is '{status}' (must be 'draft')")

        if status == "published":
            if not (item.get("title") or "").strip():
                errors.append(f"[{item_id}] published item missing title")
            if not (item.get("summary") or "").strip():
                errors.append(f"[{item_id}] published item missing summary")
            source = item.get("source") or {}
            if not (source.get("url") or source.get("origin")):
                errors.append(f"[{item_id}] published item requires source.url or source.origin")
            if not (rights.get("credit") or "").strip():
                errors.append(f"[{item_id}] published item requires rights.credit")
            if "media" not in (item.get("files") or {}):
                errors.append(f"[{item_id}] published item requires files.media")

        # 5. Files check (existence, size, sha256, MIME type, 50 MB limit)
        files = item.get("files") or {}
        for fkey, fobj in files.items():
            if not isinstance(fobj, dict):
                errors.append(f"[{item_id}] files.{fkey} must be an object")
                continue
            if fkey == "original" and fobj.get("kept") is False:
                continue
            rel_path = fobj.get("path")
            if not rel_path:
                errors.append(f"[{item_id}] files.{fkey} missing 'path'")
                continue
            disk_path = item_dir / rel_path
            if not disk_path.exists():
                errors.append(f"[{item_id}] files.{fkey} path '{rel_path}' does not exist on disk")
                continue

            actual_bytes = disk_path.stat().st_size
            if actual_bytes > hard_max_bytes:
                errors.append(
                    f"[{item_id}] files.{fkey} ('{rel_path}') is {actual_bytes} bytes, exceeding limit {hard_max_bytes}"
                )
            if fobj.get("bytes") != actual_bytes:
                errors.append(
                    f"[{item_id}] files.{fkey} byte size mismatch: item.json has {fobj.get('bytes')}, disk has {actual_bytes}"
                )

            expected_mime = MIME_BY_EXT.get(disk_path.suffix.lower())
            if expected_mime and fobj.get("type") and fobj.get("type") != expected_mime:
                errors.append(
                    f"[{item_id}] files.{fkey} MIME type '{fobj.get('type')}' does not match extension ({expected_mime})"
                )

            if verify_hashes and fobj.get("sha256"):
                actual_sha = sha256_file(disk_path)
                if actual_sha != fobj.get("sha256"):
                    errors.append(
                        f"[{item_id}] files.{fkey} sha256 mismatch: item.json has {fobj.get('sha256')[:12]}..., disk has {actual_sha[:12]}..."
                    )

            if disk_path.suffix.lower() == ".svg":
                check_svg_sanitized(disk_path, item_id, errors)
            if disk_path.suffix.lower() in (".md", ".txt"):
                check_no_raw_scripts(disk_path.read_text(encoding="utf-8", errors="replace"), rel_path, item_id, errors)

        # 6. Description & notes.md script check
        if item.get("description"):
            check_no_raw_scripts(str(item["description"]), "description", item_id, errors)
        notes_md = item_dir / "notes.md"
        if notes_md.exists():
            check_no_raw_scripts(notes_md.read_text(encoding="utf-8", errors="replace"), "notes.md", item_id, errors)

        # 7. Clips validation
        for clip in item.get("clips") or []:
            t_in = float(clip.get("in", 0.0))
            t_out = float(clip.get("out", 0.0))
            if t_out <= t_in:
                errors.append(f"[{item_id}] clip {clip.get('n')} has invalid range in={t_in} >= out={t_out}")
            for ct in clip.get("tags", []):
                if ct not in valid_tags:
                    errors.append(f"[{item_id}] clip {clip.get('n')} has unknown tag '{ct}'")
            for cd in clip.get("demos", []):
                if cd not in valid_demos:
                    errors.append(f"[{item_id}] clip {clip.get('n')} has unknown demo '{cd}'")
            if status == "published":
                for cfield in ("file", "thumb"):
                    crel = clip.get(cfield)
                    if crel and not (item_dir / crel).exists():
                        errors.append(f"[{item_id}] clip {clip.get('n')} missing {cfield} '{crel}'")

        if status == "published":
            published_full.append(item)
            compact = compact_item_entry(item, base_url)
            if item_id in derived_children:
                compact["derivatives"] = derived_children[item_id]
            expected_catalog.append(compact)
            for clip in item.get("clips") or []:
                ce = compact_clip_entry(item, clip, base_url)
                expected_catalog.append(ce)
                expected_clips.append(ce)

    # 8. Catalog determinism / freshness check
    if verify_catalog:
        expected_catalog.sort(key=lambda x: (x["id"], 0 if x["type"] == "item" else x.get("n", 1)))
        published_full.sort(key=lambda x: x["id"])

        cat_path = REPO_ROOT / "catalog.json"
        jsonl_path = REPO_ROOT / "catalog.jsonl"
        llms_path = REPO_ROOT / "llms.txt"

        if not cat_path.exists():
            errors.append("catalog.json is missing (run `python3 tools/build.py`)")
        else:
            expected_cat_str = json.dumps(expected_catalog, indent=2, ensure_ascii=False) + "\n"
            actual_cat_str = cat_path.read_text(encoding="utf-8")
            if actual_cat_str != expected_cat_str:
                errors.append("catalog.json is out of date with items/ (run `python3 tools/build.py`)")

        if not jsonl_path.exists():
            errors.append("catalog.jsonl is missing (run `python3 tools/build.py`)")
        else:
            expected_jsonl_str = (
                ("\n".join(json.dumps(it, ensure_ascii=False) for it in published_full) + "\n")
                if published_full
                else ""
            )
            actual_jsonl_str = jsonl_path.read_text(encoding="utf-8")
            if actual_jsonl_str != expected_jsonl_str:
                errors.append("catalog.jsonl is out of date with items/ (run `python3 tools/build.py`)")

        if not llms_path.exists():
            errors.append("llms.txt is missing (run `python3 tools/build.py`)")
        else:
            expected_llms = generate_llms_txt(cfg, published_full, expected_clips)
            if llms_path.read_text(encoding="utf-8") != expected_llms:
                errors.append("llms.txt is out of date with items/ (run `python3 tools/build.py`)")

    return errors, warnings


def main() -> None:
    bootstrap_venv(Path(__file__))
    parser = argparse.ArgumentParser(description="Validate Mediathèque items and generated catalog files")
    parser.add_argument("--fast", action="store_true", help="Skip full sha256 recomputation on large files")
    parser.add_argument("--no-catalog", action="store_true", help="Skip checking catalog.json freshness")
    args = parser.parse_args()

    errors, warnings = validate_repo(verify_hashes=not args.fast, verify_catalog=not args.no_catalog)
    for w in warnings:
        print(f"WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    if errors:
        print(f"[check] FAILED with {len(errors)} error(s).", file=sys.stderr)
        sys.exit(1)

    items_count = len(list((REPO_ROOT / "items").glob("*/item.json")))
    print(f"[check] OK — validated {items_count} item(s), all schemas, vocabularies, files, and catalogs match.")


if __name__ == "__main__":
    main()
