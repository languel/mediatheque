#!/usr/bin/env python3
"""Mediathèque Curator Studio Server: a zero-dependency, passcode-protected server for review, annotation, approval, and publishing of media items."""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import http.cookies
import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.parse
from datetime import date
from http import HTTPStatus
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

from build import build_all as build_catalog
from check import validate_repo

COOKIE_NAME = "mediatheque_curator_session"
DEFAULT_PASSCODE = os.environ.get("MEDIATHEQUE_PASSCODE", "curator1895")
SESSION_SECRET = os.environ.get("MEDIATHEQUE_SECRET", secrets.token_hex(32))


def sign_token(token_str: str) -> str:
    sig = hmac.new(SESSION_SECRET.encode("utf-8"), token_str.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{token_str}.{sig}"


def verify_token(signed_token: str) -> bool:
    if not signed_token or "." not in signed_token:
        return False
    token_str, sig = signed_token.split(".", 1)
    expected = hmac.new(SESSION_SECRET.encode("utf-8"), token_str.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


class CuratorRequestHandler(SimpleHTTPRequestHandler):
    server_passcode: str = DEFAULT_PASSCODE

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    # -------------------------------------------------------------------------
    # Authentication & Session Helpers
    # -------------------------------------------------------------------------
    def is_authenticated(self) -> bool:
        # Check Authorization Bearer header
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if verify_token(token):
                return True

        # Check Cookie header
        cookie_header = self.headers.get("Cookie", "")
        if cookie_header:
            c = http.cookies.SimpleCookie()
            try:
                c.load(cookie_header)
                if COOKIE_NAME in c:
                    return verify_token(c[COOKIE_NAME].value)
            except Exception:
                pass
        return False

    def send_json(self, data: Any, status: int = 200, extra_headers: list[tuple[str, str]] | None = None) -> None:
        raw = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    # -------------------------------------------------------------------------
    # Routing
    # -------------------------------------------------------------------------
    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Friendly redirects
        if path in ("/", "/curate", "/curate/"):
            self.send_response(HTTPStatus.MOVED_PERMANENTLY)
            self.send_header("Location", "/site/curate.html")
            self.end_headers()
            return

        # Public Auth Check endpoint
        if path == "/api/auth/check":
            authed = self.is_authenticated()
            self.send_json({"authenticated": authed})
            return

        # Protected API routes
        if path.startswith("/api/"):
            if not self.is_authenticated():
                self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
                return

            if path == "/api/items":
                self.handle_list_items(parsed.query)
                return
            m_item = re.match(r"^/api/items/([a-z0-9\-]+)$", path)
            if m_item:
                self.handle_get_item(m_item.group(1))
                return
            if path == "/api/tags":
                tags_path = REPO_ROOT / "tools" / "tags.json"
                if tags_path.exists():
                    self.send_json(json.loads(tags_path.read_text(encoding="utf-8")))
                else:
                    self.send_json({})
                return
            if path == "/api/git/status":
                self.handle_git_status()
                return

            self.send_json({"error": "Not Found"}, status=404)
            return

        # Serve static files from REPO_ROOT
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Public Login endpoint
        if path == "/api/auth/login":
            body = self.read_json_body()
            passcode = str(body.get("passcode", "")).strip()
            if hmac.compare_digest(passcode, self.server_passcode):
                session_raw = f"curator-{int(time.time())}-{secrets.token_hex(8)}"
                signed = sign_token(session_raw)
                cookie_val = f"{COOKIE_NAME}={signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"
                self.send_json(
                    {"success": True, "token": signed, "message": "Authentication successful"},
                    extra_headers=[("Set-Cookie", cookie_val)],
                )
            else:
                self.send_json({"error": "Invalid passcode", "success": False}, status=403)
            return

        if path == "/api/auth/logout":
            cookie_val = f"{COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0"
            self.send_json({"success": True}, extra_headers=[("Set-Cookie", cookie_val)])
            return

        # All remaining POST endpoints require authentication
        if not self.is_authenticated():
            self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
            return

        m_update = re.match(r"^/api/items/([a-z0-9\-]+)/update$", path)
        if m_update:
            self.handle_update_item(m_update.group(1))
            return

        m_publish = re.match(r"^/api/items/([a-z0-9\-]+)/publish$", path)
        if m_publish:
            self.handle_publish_item(m_publish.group(1))
            return

        m_unpublish = re.match(r"^/api/items/([a-z0-9\-]+)/unpublish$", path)
        if m_unpublish:
            self.handle_unpublish_item(m_unpublish.group(1))
            return

        m_reject = re.match(r"^/api/items/([a-z0-9\-]+)/reject$", path)
        if m_reject:
            self.handle_reject_item(m_reject.group(1))
            return

        if path == "/api/scour":
            self.handle_scour_action()
            return

        if path == "/api/build":
            self.handle_build_action()
            return

        if path == "/api/git/commit":
            self.handle_git_commit()
            return

        self.send_json({"error": "Not Found"}, status=404)

    # -------------------------------------------------------------------------
    # API Handlers
    # -------------------------------------------------------------------------
    def handle_list_items(self, query_str: str) -> None:
        items_dir = REPO_ROOT / "items"
        items_list: list[dict[str, Any]] = []

        if items_dir.exists():
            for p in sorted(items_dir.glob("*/item.json")):
                try:
                    data = json.loads(p.read_text(encoding="utf-8"))
                    item_id = data.get("id", p.parent.name)

                    # Compute publication readiness and missing fields
                    missing: list[str] = []
                    if not data.get("title"):
                        missing.append("title")
                    if not data.get("summary"):
                        missing.append("summary")
                    src = data.get("source", {})
                    if not (src.get("url") or src.get("origin")):
                        missing.append("source.url")
                    rights = data.get("rights", {})
                    if not rights.get("status") or rights.get("status") == "unknown":
                        missing.append("rights.status")
                    if not rights.get("credit"):
                        missing.append("rights.credit")
                    if not data.get("files", {}).get("media", {}).get("path"):
                        missing.append("files.media")

                    # Thumbnail path
                    files = data.get("files", {})
                    thumb_rel = (
                        (files.get("thumb") and f"items/{item_id}/{files['thumb']['path']}")
                        or (files.get("poster") and f"items/{item_id}/{files['poster']['path']}")
                        or ""
                    )
                    media_rel = (
                        (files.get("media") and f"items/{item_id}/{files['media']['path']}")
                        or (files.get("original") and f"items/{item_id}/{files['original']['path']}")
                        or ""
                    )

                    items_list.append(
                        {
                            "id": item_id,
                            "title": data.get("title", item_id),
                            "kind": data.get("kind", "unknown"),
                            "status": data.get("status", "draft"),
                            "summary": data.get("summary", ""),
                            "date": data.get("date"),
                            "creators": data.get("creators", []),
                            "tags": data.get("tags", []),
                            "demos": data.get("demos", []),
                            "collections": data.get("collections", []),
                            "rights": rights,
                            "missing": missing,
                            "ready": len(missing) == 0,
                            "thumb": thumb_rel,
                            "media": media_rel,
                            "added": data.get("added"),
                            "updated": data.get("updated"),
                        }
                    )
                except Exception as exc:
                    print(f"[curate] error reading {p}: {exc}", file=sys.stderr)

        self.send_json({"items": items_list, "count": len(items_list)})

    def handle_get_item(self, item_id: str) -> None:
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            self.send_json({"error": f"Item not found: {item_id}"}, status=404)
            return
        data = json.loads(item_path.read_text(encoding="utf-8"))
        self.send_json({"item": data})

    def handle_update_item(self, item_id: str) -> None:
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            self.send_json({"error": f"Item not found: {item_id}"}, status=404)
            return

        current = json.loads(item_path.read_text(encoding="utf-8"))
        updates = self.read_json_body()

        # Update allowed curatorial fields
        allowed_fields = [
            "title",
            "summary",
            "description",
            "date",
            "plate",
            "sequence",
            "tags",
            "demos",
            "keywords",
            "collections",
            "creators",
            "source",
            "rights",
            "clips",
        ]
        for field in allowed_fields:
            if field in updates:
                current[field] = updates[field]

        current["updated"] = str(date.today())

        # Write item.json
        item_path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        # Automatically rebuild catalogs
        try:
            build_catalog(REPO_ROOT)
        except Exception as exc:
            print(f"[curate] warning during catalog rebuild: {exc}", file=sys.stderr)

        self.send_json({"success": True, "item": current, "message": f"Updated {item_id}"})

    def handle_publish_item(self, item_id: str) -> None:
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            self.send_json({"error": f"Item not found: {item_id}"}, status=404)
            return

        current = json.loads(item_path.read_text(encoding="utf-8"))
        missing: list[str] = []
        if not current.get("title"):
            missing.append("title")
        if not current.get("summary"):
            missing.append("summary")
        src = current.get("source", {})
        if not (src.get("url") or src.get("origin")):
            missing.append("source.url")
        rights = current.get("rights", {})
        if not rights.get("status") or rights.get("status") == "unknown":
            missing.append("rights.status")
        if not rights.get("credit"):
            missing.append("rights.credit")
        if not current.get("files", {}).get("media", {}).get("path"):
            missing.append("files.media")

        if missing:
            self.send_json(
                {
                    "error": f"Cannot publish {item_id}; missing required fields: {', '.join(missing)}",
                    "missing": missing,
                    "success": False,
                },
                status=400,
            )
            return

        current["status"] = "published"
        current["updated"] = str(date.today())
        item_path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        # Rebuild catalogs
        build_catalog(REPO_ROOT)

        self.send_json({"success": True, "item": current, "message": f"Published {item_id} successfully!"})

    def handle_unpublish_item(self, item_id: str) -> None:
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            self.send_json({"error": f"Item not found: {item_id}"}, status=404)
            return
        current = json.loads(item_path.read_text(encoding="utf-8"))
        current["status"] = "review"
        current["updated"] = str(date.today())
        item_path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        build_catalog(REPO_ROOT)
        self.send_json({"success": True, "item": current, "message": f"Moved {item_id} to review"})

    def handle_reject_item(self, item_id: str) -> None:
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            self.send_json({"error": f"Item not found: {item_id}"}, status=404)
            return
        current = json.loads(item_path.read_text(encoding="utf-8"))
        current["status"] = "draft"
        current["updated"] = str(date.today())
        item_path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        build_catalog(REPO_ROOT)
        self.send_json({"success": True, "item": current, "message": f"Moved {item_id} to draft"})

    def handle_scour_action(self) -> None:
        body = self.read_json_body()
        target_id = body.get("id")
        target_url = body.get("url")
        preset = body.get("preset")

        cmd = [sys.executable, str(REPO_ROOT / "tools" / "scour.py")]
        if target_id:
            cmd += ["--id", target_id]
        elif target_url:
            cmd += ["--url", target_url]
            if body.get("title"):
                cmd += ["--title", body["title"]]
        elif preset:
            cmd += ["--preset", preset]
        else:
            self.send_json({"error": "Provide id, url, or preset to scour"}, status=400)
            return

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            self.send_json({"success": True, "output": res.stdout, "message": "Scour completed successfully"})
        except subprocess.CalledProcessError as err:
            self.send_json({"error": f"Scour failed: {err.stderr or err.stdout}", "success": False}, status=500)

    def handle_build_action(self) -> None:
        try:
            stats = build_catalog(REPO_ROOT)
            errors, warnings = validate_repo(verify_hashes=False, verify_catalog=True)
            self.send_json(
                {"success": len(errors) == 0, "stats": stats, "errors": errors, "warnings": warnings}
            )
        except Exception as exc:
            self.send_json({"error": str(exc), "success": False}, status=500)

    def handle_git_status(self) -> None:
        try:
            res = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, check=True)
            branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True).stdout.strip()
            self.send_json({"status": res.stdout, "branch": branch, "clean": len(res.stdout.strip()) == 0})
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def handle_git_commit(self) -> None:
        body = self.read_json_body()
        msg = body.get("message", "Curate and publish approved items").strip()
        try:
            subprocess.run(["git", "add", "."], check=True)
            res = subprocess.run(["git", "commit", "-m", msg], capture_output=True, text=True, check=True)
            self.send_json({"success": True, "output": res.stdout, "message": "Changes committed successfully"})
        except subprocess.CalledProcessError as err:
            self.send_json({"error": err.stderr or err.stdout, "success": False}, status=500)


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the Mediathèque Curator Studio server.")
    parser.add_argument("--port", type=int, default=8090, help="Port to listen on (default: 8090)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--passcode", type=str, default=DEFAULT_PASSCODE, help="Passcode for curator login")
    args = parser.parse_args()

    CuratorRequestHandler.server_passcode = args.passcode

    server = HTTPServer((args.host, args.port), CuratorRequestHandler)
    print(f"============================================================")
    print(f"  Mediathèque Curator Studio running at:")
    print(f"  http://{args.host}:{args.port}/site/curate.html")
    print(f"  Curator Passcode: {args.passcode}")
    print(f"============================================================")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Curator Studio.")
        server.server_close()


if __name__ == "__main__":
    main()
