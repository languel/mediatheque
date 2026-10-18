#!/usr/bin/env python3
"""End-to-end test suite for Mediathèque tools (ingest, analyzers, build, check, media CLI)."""

from __future__ import annotations

import copy
import json
import math
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

import check  # noqa: E402
import ingest  # noqa: E402


class TestMediatheque(unittest.TestCase):
    def test_repo_validates_cleanly(self) -> None:
        errors, _warnings = check.validate_repo(verify_hashes=True, verify_catalog=True)
        self.assertEqual(errors, [], f"Repo validation errors: {errors}")

    def test_catalog_and_llms_contents(self) -> None:
        cat = json.loads((REPO_ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(cat), 25)
        items = [e for e in cat if e["type"] == "item"]
        clips = [e for e in cat if e["type"] == "clip"]
        self.assertEqual(len(items), 26)
        self.assertGreaterEqual(len(clips), 7)

        # Verify Sandow and clips
        sandow = next((e for e in items if e["id"] == "sandow-1894"), None)
        self.assertIsNotNone(sandow)
        self.assertEqual(sandow["rights"]["status"], "public-domain")

        sandow_clip = next((e for e in clips if e["id"] == "sandow-1894/01"), None)
        self.assertIsNotNone(sandow_clip)
        self.assertTrue((REPO_ROOT / sandow_clip["media"]).exists())
        self.assertTrue((REPO_ROOT / sandow_clip["thumb"]).exists())

        # Verify GIF derivative backlink on danse-serpentine-lumiere-1897
        serp = next((e for e in items if e["id"] == "danse-serpentine-lumiere-1897"), None)
        self.assertIsNotNone(serp)
        self.assertTrue(any(d["id"] == "louie-fuller" for d in serp.get("derivatives", [])))

        # Verify draft items are in review.json and NOT in catalog.json
        published_ids = {e["id"] for e in items}
        self.assertNotIn("birds", published_ids)
        self.assertNotIn("metastaseis2", published_ids)
        rev = json.loads((REPO_ROOT / "review.json").read_text(encoding="utf-8"))
        rev_ids = {e["id"] for e in rev}
        self.assertIn("birds", rev_ids)
        self.assertIn("metastaseis2", rev_ids)

    def test_svg_sanitizer(self) -> None:
        dirty = '<svg viewBox="0 0 10 10" onload="alert(1)"><script>evil()</script><image href="https://evil.example/x.png"/><path d="M0 0 L10 10"/></svg>'
        clean = ingest.sanitize_svg(dirty)
        self.assertNotIn("<script", clean.lower())
        self.assertNotIn("onload=", clean.lower())
        self.assertNotIn("https://evil.example", clean.lower())
        self.assertIn("<path", clean)

    def test_audio_and_text_ingest_derivatives(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            items_dir = tmp_path / "items"
            done_dir = tmp_path / "done"
            items_dir.mkdir()

            # 1. Create a synthetic 2-second 120 BPM pulsed WAV file
            wav_path = tmp_path / "pulse_test_1920.wav"
            sr = 8000
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                frames = bytearray()
                for i in range(sr * 2):
                    # Pulse every 0.5s (120 BPM)
                    env = 0.8 if (i % (sr // 2)) < (sr // 10) else 0.02
                    sample = int(env * math.sin(2.0 * math.pi * 440.0 * (i / sr)) * 30000)
                    frames.extend(struct.pack("<h", sample))
                wf.writeframes(bytes(frames))

            cfg = ingest.load_config()
            aid = ingest.ingest_file(
                file_path=wav_path,
                collection="soundtest",
                items_dir=items_dir,
                done_dir=done_dir,
                cfg=cfg,
                existing_hashes={},
                existing_phashes={},
                enabled_analyzers=["probe", "audio"],
                dry_run=False,
                keep_inbox=True,
            )
            self.assertEqual(aid, "pulse-test-1920")
            self.assertTrue((items_dir / aid / "media.mp3").exists())
            self.assertTrue((items_dir / aid / "poster.webp").exists())
            self.assertTrue((items_dir / aid / "thumb.webp").exists())

            # 2. Create a synthetic Markdown manifesto text item
            md_path = tmp_path / "dada_manifesto_1918.md"
            md_path.write_text(
                "# Dada Manifesto (1918)\n\nTo launch a manifesto you must want: A, B, C.\n",
                encoding="utf-8",
            )
            tid = ingest.ingest_file(
                file_path=md_path,
                collection="texts",
                items_dir=items_dir,
                done_dir=done_dir,
                cfg=cfg,
                existing_hashes={},
                existing_phashes={},
                enabled_analyzers=["probe", "text", "render"],
                dry_run=False,
                keep_inbox=True,
            )
            self.assertEqual(tid, "dada-manifesto-1918")
            self.assertTrue((items_dir / tid / "media.md").exists())
            self.assertTrue((items_dir / tid / "poster.webp").exists())
            self.assertTrue((items_dir / tid / "thumb.webp").exists())

    def test_media_cli(self) -> None:
        res = subprocess.run(
            [sys.executable, str(REPO_ROOT / "tools" / "media.py"), "search", "muybridge", "--pd", "--json"],
            capture_output=True,
            text=True,
            check=True,
        )
        rows = json.loads(res.stdout)
        self.assertGreaterEqual(len(rows), 5)

        res_credit = subprocess.run(
            [sys.executable, str(REPO_ROOT / "tools" / "media.py"), "credit", "sandow-1894", "--markdown"],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertIn("William K. L. Dickson", res_credit.stdout)


if __name__ == "__main__":
    unittest.main()
