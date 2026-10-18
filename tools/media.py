#!/usr/bin/env python3
"""Mediathèque CLI (`media search`, `media get`, `media credit`) for human and agent queries."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_catalog() -> list[dict[str, Any]]:
    cat_path = REPO_ROOT / "catalog.json"
    if not cat_path.exists():
        return []
    return json.loads(cat_path.read_text(encoding="utf-8"))


def cmd_search(args: argparse.Namespace) -> None:
    entries = load_catalog()
    q = (args.query or "").lower().split()

    results = []
    for e in entries:
        if args.type != "both" and e.get("type") != args.type:
            continue
        if args.kind and e.get("kind") != args.kind:
            continue
        if args.pd and e.get("rights", {}).get("status") != "public-domain":
            continue
        if args.tag and args.tag not in e.get("tags", []):
            continue
        if args.demo and args.demo not in e.get("demos", []):
            continue
        if args.max_duration is not None:
            dur = e.get("duration")
            if dur is None or float(dur) > args.max_duration:
                continue

        haystack = " ".join(
            [
                e.get("id", ""),
                e.get("title", ""),
                e.get("summary", ""),
                " ".join(e.get("tags", [])),
                " ".join(e.get("keywords", [])),
                " ".join(e.get("demos", [])),
                " ".join(e.get("creators", [])),
                e.get("date") or "",
            ]
        ).lower()
        if all(term in haystack for term in q):
            results.append(e)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return

    for r in results:
        dur_str = f" ({r['duration']}s)" if r.get("duration") else ""
        print(f"{r['id']:42s} [{r['kind']}/{r['type']}]{dur_str} — {r['title']}")
        print(f"  URL:    {r['url']}")
        print(f"  Credit: {r.get('credit', '')}")


def cmd_get(args: argparse.Namespace) -> None:
    target_id = args.id.strip().lstrip("#/")
    item_path = REPO_ROOT / "items" / target_id.split("/")[0] / "item.json"
    if item_path.exists() and "/" not in target_id:
        print(item_path.read_text(encoding="utf-8"))
        return
    for e in load_catalog():
        if e.get("id") == target_id:
            print(json.dumps(e, indent=2, ensure_ascii=False))
            return
    sys.exit(f"Item or clip not found: {target_id}")


def cmd_credit(args: argparse.Namespace) -> None:
    entries = {e["id"]: e for e in load_catalog()}
    by_url = {e["url"]: e for e in entries.values() if e.get("url")}
    for ref in args.targets:
        clean = ref.strip().lstrip("#/")
        e = entries.get(clean) or by_url.get(clean)
        if not e:
            # Try matching item slug in a URL
            for eid, cand in entries.items():
                if f"/items/{eid}/" in clean:
                    e = cand
                    break
        if not e:
            print(f"# Unknown item: {ref}", file=sys.stderr)
            continue
        if args.markdown:
            src = e.get("source_url") or e.get("url")
            print(f"- **{e['title']}** — {e.get('credit', '')} ([source]({src}))")
        else:
            print(f"{e['title']}: {e.get('credit', '')} ({e.get('source_url') or e.get('url')})")


def main() -> None:
    parser = argparse.ArgumentParser( prog="media", description="Query Mediathèque catalog from CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_search = sub.add_parser("search", help="Search items and clips")
    p_search.add_argument("query", nargs="?", default="", help="Search terms")
    p_search.add_argument("--kind", type=str, default=None, help="Filter by kind (video, animation, image, ...)")
    p_search.add_argument("--type", choices=["item", "clip", "both"], default="both", help="Item or clip filter")
    p_search.add_argument("--tag", type=str, default=None, help="Require tag")
    p_search.add_argument("--demo", type=str, default=None, help="Require demo fit")
    p_search.add_argument("--pd", action="store_true", help="Only public-domain items")
    p_search.add_argument("--max-duration", type=float, default=None, help="Maximum duration in seconds")
    p_search.add_argument("--json", action="store_true", help="Output JSON")
    p_search.set_defaults(func=cmd_search)

    p_get = sub.add_parser("get", help="Get full JSON record for an item or clip ID")
    p_get.add_argument("id", help="Item or clip ID (e.g. sandow-1894 or sandow-1894/01)")
    p_get.set_defaults(func=cmd_get)

    p_credit = sub.add_parser("credit", help="Print credit lines for item IDs or URLs")
    p_credit.add_argument("targets", nargs="+", help="Item IDs or URLs")
    p_credit.add_argument("--markdown", "-m", action="store_true", help="Format as Markdown list")
    p_credit.set_defaults(func=cmd_credit)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
