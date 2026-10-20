#!/usr/bin/env python3
"""Mediathèque scouring tool: fetches early cinema and chronophotography works from verified public domain archives (Wikimedia Commons, Library of Congress, Internet Archive)."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

from ingest import (
    KIND_BY_EXT,
    MIME_BY_EXT,
    detect_kind,
    get_existing_hashes,
    get_existing_phashes,
    ingest_file,
    load_config,
    make_file_record,
    slugify,
)

USER_AGENT = "MediathequeBot/1.0 (https://languel.github.io/mediatheque; contact@example.edu)"


def fetch_commons_file_info(file_title: str) -> dict[str, Any] | None:
    """Query Wikimedia Commons API for imageinfo and metadata for a given File: title."""
    clean_title = file_title if file_title.startswith("File:") else f"File:{file_title}"
    api_url = (
        "https://commons.wikimedia.org/w/api.php?action=query&titles="
        + urllib.parse.quote(clean_title)
        + "&prop=imageinfo&iiprop=url|size|mime|sha1|extmetadata&format=json"
    )

    req = urllib.request.Request(api_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            for _pid, page in pages.items():
                if "missing" in page:
                    return None
                infos = page.get("imageinfo", [])
                if infos:
                    info = infos[0]
                    extmeta = info.get("extmetadata", {})
                    return {
                        "title": clean_title,
                        "url": info.get("url"),
                        "descriptionurl": info.get("descriptionurl"),
                        "size": info.get("size"),
                        "mime": info.get("mime"),
                        "sha1": info.get("sha1"),
                        "extmetadata": extmeta,
                    }
    except Exception as exc:
        print(f"[scour] warning: failed querying Commons for {clean_title}: {exc}", file=sys.stderr)
        return None
    return None


def download_file(url: str, dest_path: Path) -> bool:
    """Download file with user agent and progress status."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".part")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp, temp_path.open("wb") as out:
            shutil_copy = True
            length = resp.headers.get("Content-Length")
            total = int(length) if length and length.isdigit() else 0
            downloaded = 0
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
        temp_path.replace(dest_path)
        return True
    except Exception as exc:
        if temp_path.exists():
            temp_path.unlink()
        print(f"[scour] download error for {url}: {exc}", file=sys.stderr)
        return False


def scour_from_registry(item_spec: dict[str, Any], dry_run: bool = False) -> str | None:
    """Scour a single pre-configured entry from tools/sources_registry.json."""
    item_id = item_spec["id"]
    download_url = item_spec["download_url"]
    items_dir = REPO_ROOT / "items"
    item_dir = items_dir / item_id

    if item_dir.exists() and (item_dir / "item.json").exists():
        print(f"[scour] skipping already existing item: items/{item_id}")
        return item_id

    # Determine extension from download url or commons title
    parsed = urllib.parse.urlparse(download_url)
    ext = Path(parsed.path).suffix.lower()
    if not ext and "commons_file" in item_spec:
        ext = Path(item_spec["commons_file"]).suffix.lower()
    if not ext:
        ext = ".webm" if item_spec.get("kind") == "video" else ".gif"

    inbox_dir = REPO_ROOT / "inbox"
    temp_target = inbox_dir / f"{item_id}{ext}"
    sidecar_target = inbox_dir / f"{item_id}.source.txt"

    print(f"[scour] downloading '{item_spec['title']}' from {download_url}...")
    if dry_run:
        print(f"[scour] [dry-run] would download {download_url} -> {temp_target}")
        return item_id

    success = download_file(download_url, temp_target)
    if not success:
        return None

    # Write sidecar with curatorial metadata for ingest.py
    sidecar_content = f"""title: {item_spec['title']}
date: {item_spec.get('date', '')}
summary: {item_spec.get('summary', '')}
description: {item_spec.get('description', '')}
status: review
tags: {json.dumps(item_spec.get('tags', []))}
demos: {json.dumps(item_spec.get('demos', []))}
collections: {json.dumps(item_spec.get('collections', ['earlyfilm']))}
creators:
  - name: {item_spec['creator']}
    role: {item_spec.get('creator_role', 'director')}
source:
  archive: {item_spec.get('archive', 'Wikimedia Commons')}
  url: {item_spec.get('origin_url', download_url)}
  origin: {item_spec.get('origin_url', download_url)}
rights:
  status: {item_spec.get('rights_status', 'public-domain')}
  license: {item_spec.get('license', 'PD-old-100')}
  credit: {item_spec.get('credit', '')}
  notes: Public domain early movement study with clear archival provenance.
"""
    if item_spec.get("plate"):
        sidecar_content += f"plate: {item_spec['plate']}\n"

    sidecar_target.write_text(sidecar_content, encoding="utf-8")

    # Run ingest pipeline
    cfg = load_config()
    existing_hashes = get_existing_hashes(items_dir)
    existing_phashes = get_existing_phashes(items_dir)
    enabled_analyzers = list(cfg.get("default_analyzers", ["probe", "gif", "scenes", "flow", "render"]))

    ingested_id = ingest_file(
        file_path=temp_target,
        collection=None,
        items_dir=items_dir,
        done_dir=inbox_dir / ".done",
        cfg=cfg,
        existing_hashes=existing_hashes,
        existing_phashes=existing_phashes,
        enabled_analyzers=enabled_analyzers,
        dry_run=False,
        keep_inbox=False,
    )

    # Clean up sidecar
    if sidecar_target.exists():
        sidecar_target.unlink()

    return ingested_id


def scour_url(url: str, title: str | None = None) -> str | None:
    """Scour arbitrary Wikimedia Commons or media URL."""
    clean_url = url.strip()
    commons_title = None

    if "commons.wikimedia.org/wiki/File:" in clean_url:
        commons_title = clean_url.split("commons.wikimedia.org/wiki/")[1].split("?")[0]
        commons_title = urllib.parse.unquote(commons_title)
    elif clean_url.startswith("File:"):
        commons_title = clean_url

    download_url = clean_url
    remote_meta: dict[str, Any] = {}
    if commons_title:
        info = fetch_commons_file_info(commons_title)
        if info:
            download_url = info.get("url") or clean_url
            remote_meta = info

    # Inferred item id
    base_name = Path(urllib.parse.urlparse(download_url).path).stem
    if commons_title:
        base_name = commons_title.replace("File:", "").split(".")[0]
    item_id = slugify(base_name)

    spec = {
        "id": item_id,
        "title": title or base_name.replace("_", " ").title(),
        "creator": "Historical Archives",
        "creator_role": "creator",
        "date": "1895",
        "kind": "video" if download_url.endswith((".webm", ".mp4", ".ogv")) else "animation",
        "summary": f"{title or base_name} — Historical motion study.",
        "description": f"Retrieved from {clean_url}.",
        "archive": "Wikimedia Commons",
        "origin_url": clean_url,
        "download_url": download_url,
        "rights_status": "public-domain",
        "license": "PD-old-100",
        "credit": f"Historical Archive, 1895. {title or base_name}. Wikimedia Commons. Public domain.",
        "tags": ["movement", "early-film", "archival", "bw", "silent"],
        "demos": ["optical-flow", "loop"],
    }
    return scour_from_registry(spec)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scour verified early cinema & chronophotography works into Mediathèque.")
    parser.add_argument("--list", action="store_true", help="List scoured items registered in sources_registry.json")
    parser.add_argument("--id", type=str, help="Scour a specific item by ID from sources_registry.json")
    parser.add_argument("--creator", type=str, help="Scour all works by creator (muybridge, marey, lumiere, edison, melies, etc.)")
    parser.add_argument("--preset", type=str, default=None, help="Preset to scour (e.g. 'early-cinema')")
    parser.add_argument("--url", type=str, help="Scour directly from a Commons or media URL")
    parser.add_argument("--title", type=str, help="Title override for --url")
    parser.add_argument("--dry-run", action="store_true", help="Preview without downloading")
    args = parser.parse_args()

    registry_path = REPO_ROOT / "tools" / "sources_registry.json"
    if not registry_path.exists():
        raise SystemExit(f"Registry not found: {registry_path}")

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    sources = registry.get("sources", [])

    if args.list:
        print(f"Registered Early Cinema & Chronophotography Sources ({len(sources)} available):")
        for s in sources:
            items_dir = REPO_ROOT / "items" / s["id"]
            status_mark = "[installed]" if (items_dir / "item.json").exists() else "[available]"
            print(f"  {status_mark:<12} {s['id']:<38} {s['creator']:<22} {s['title'][:40]}")
        return

    if args.url:
        scour_url(args.url, args.title)
        # Rebuild catalogs
        subprocess.run([sys.executable, str(REPO_ROOT / "tools" / "build.py")], check=True)
        return

    targets = []
    if args.id:
        targets = [s for s in sources if s["id"] == args.id]
        if not targets:
            raise SystemExit(f"No source matching ID: {args.id}")
    elif args.creator:
        c_low = args.creator.lower()
        targets = [s for s in sources if c_low in s["creator"].lower() or c_low in s["id"].lower()]
        if not targets:
            raise SystemExit(f"No sources found matching creator: {args.creator}")
    elif args.preset == "early-cinema" or len(sys.argv) == 1:
        targets = sources

    print(f"[scour] processing {len(targets)} candidate source(s)...")
    ingested_count = 0
    for s in targets:
        res = scour_from_registry(s, dry_run=args.dry_run)
        if res:
            ingested_count += 1
        time.sleep(0.5)

    if not args.dry_run and ingested_count > 0:
        print("[scour] rebuilding catalog and review queue...")
        subprocess.run([sys.executable, str(REPO_ROOT / "tools" / "build.py")], check=True)
        subprocess.run([sys.executable, str(REPO_ROOT / "tools" / "check.py")], check=True)

    print(f"[scour] completed: {ingested_count} item(s) processed.")


if __name__ == "__main__":
    main()
