"""Analyzer plugin registry and caching for Mediathèque ingest."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any, Callable

import importlib

_MODULE_NAMES = ["audio", "detector", "flow", "gif", "mediapipe", "probe", "render", "scenes", "text", "vlm"]
ANALYZERS: dict[str, Any] = {}

for _mod_name in _MODULE_NAMES:
    try:
        ANALYZERS[_mod_name] = importlib.import_module(f".{_mod_name}", package=__name__)
    except Exception:
        pass

COST_ORDER = [
    "probe",
    "gif",
    "render",
    "text",
    "scenes",
    "flow",
    "audio",
    "mediapipe",
    "detector",
    "vlm",
]


def load_valid_tags(repo_root: Path) -> tuple[set[str], set[str]]:
    tags_path = repo_root / "tools" / "tags.json"
    if not tags_path.exists():
        return set(), set()
    data = json.loads(tags_path.read_text(encoding="utf-8"))
    valid_tags: set[str] = set()
    for facet in data.get("facets", {}).values():
        valid_tags.update(facet.get("tags", {}).keys())
    valid_demos = set(data.get("demos", {}).keys())
    return valid_tags, valid_demos


def run_analyzers(
    item_dir: Path,
    item: dict[str, Any],
    source_file: Path,
    enabled: list[str],
    repo_root: Path,
    allow_remote: bool = False,
) -> dict[str, Any]:
    """Run enabled analyzers in cost order, caching by (file_sha256, analyzer, version)."""
    cache_dir = repo_root / ".cache" / "analyzers"
    cache_dir.mkdir(parents=True, exist_ok=True)
    valid_tags, valid_demos = load_valid_tags(repo_root)

    file_sha = (
        item.get("files", {}).get("original", {}).get("sha256")
        or item.get("files", {}).get("media", {}).get("sha256")
        or _hash_file(source_file)
    )
    kind = item.get("kind", "")

    ordered = [name for name in COST_ORDER if name in enabled]
    for name in enabled:
        if name not in ordered and name in ANALYZERS:
            ordered.append(name)

    for name in ordered:
        mod = ANALYZERS.get(name)
        if mod is None:
            continue
        supported_kinds = getattr(mod, "KINDS", [])
        if "all" not in supported_kinds and kind not in supported_kinds:
            continue
        if getattr(mod, "REQUIRES_REMOTE", False) and (not allow_remote or item.get("private")):
            continue

        version = getattr(mod, "VERSION", "1.0")
        cache_key = f"{file_sha}_{name}_{version}.json"
        cache_file = cache_dir / cache_key

        result: dict[str, Any] | None = None
        skip_cache = (name == "render") or (
            name == "audio" and kind == "audio" and not (item_dir / "poster.webp").exists()
        )
        if cache_file.exists() and not skip_cache:
            try:
                result = json.loads(cache_file.read_text(encoding="utf-8"))
            except Exception:
                result = None

        if result is None:
            try:
                result = mod.analyze(item_dir=item_dir, item=item, source_file=source_file)
                if result is not None and name != "render":
                    cache_file.write_text(json.dumps(result, indent=2), encoding="utf-8")
            except Exception as exc:
                result = {"error": str(exc), "confidence": 0.0}

        if not result or result.get("skipped"):
            continue

        # Merge measured facts directly; put model/heuristic proposals into proposed
        measured_tags = result.get("measured_tags", [])
        for t in measured_tags:
            if t in valid_tags and t not in item["tags"]:
                item["tags"].append(t)
            elif t not in valid_tags and t not in item.setdefault("proposed_tags", []):
                item["proposed_tags"].append(t)

        measured_fields = result.get("measured_fields", {})
        if measured_fields:
            media_entry = item.setdefault("files", {}).setdefault("media", {})
            for k, v in measured_fields.items():
                if k in ("plate", "sequence", "language", "bpm", "key", "triangles", "bbox", "splats"):
                    item[k] = v
                else:
                    media_entry[k] = v

        # Store full proposal record
        if result.get("proposals"):
            item.setdefault("proposed", {})[name] = {
                "analyzer": name,
                "version": version,
                "confidence": result.get("confidence", 0.8),
                "date": str(date.today()),
                **result["proposals"],
            }
            # Any unknown tags proposed go into proposed_tags
            for t in result["proposals"].get("tags", []):
                if t not in valid_tags and t not in item.setdefault("proposed_tags", []):
                    item["proposed_tags"].append(t)

        # Record provenance step
        prov_step = {
            "step": "analyzed",
            "tool": f"{name} {version}",
            "model": result.get("model", getattr(mod, "MODEL", "builtin")),
            "date": str(date.today()),
        }
        if not any(
            p.get("step") == "analyzed" and p.get("tool") == prov_step["tool"]
            for p in item.get("provenance", [])
        ):
            item.setdefault("provenance", []).append(prov_step)

    return item


def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
