# Mediathèque — Handoff Notes

Updated: 2026-11-11

## 1. Summary of Recent Changes

- **Ingested `jengahenge2` (`items/jengahenge2/`)**:
  - `kind: "splat"`, `status: "published"`, `75,319` splats, `CC0-1.0` (`public-domain`), collection `spatial`.
  - Source file is Niantic **SPZ v4** (`NGSP` uncompressed 32-byte header + 6 ZSTD attribute streams, SH degree 3, 12-bit fixed-point positions).
- **SPZ v4 Analyzer Support**:
  - `tools/analyzers/probe.py` (`_probe_splat_count`): detects raw `NGSP` headers alongside gzip-wrapped SPZ v2/v3.
  - `tools/analyzers/render.py` (`_decode_spz_for_preview`, `render_splat_preview`): decodes SPZ v4 ZSTD streams (via Python 3.14+ `compression.zstd`) and handles Y-down orientation when generating `poster.webp` and `thumb.webp`.
- **Splat Viewer Framing (`site/js/main.js`, `site/index.html`)**:
  - Updated `initSparkSplatViewer` so camera distance, `camera.near`, `camera.far`, and `controls.minDistance` scale with the bounding box `maxDim` (fixing overly distant framing for smaller object scans like `jengahenge2`).
  - Bumped cache-busting query string on `site/js/main.js` to `?v=zen16`.
- **Published Panoramic Images**:
  - `items/street-view-mh/item.json` (*Myrtle Hall Exterior*): moved `draft` → `published`, added `source` URL/origin/archive, `demos: ["projection", "depth"]`, `CC0` (`languel`).
  - `items/streetview-pratt-cannon/item.json` (*Street View — Pratt Campus Cannon Lawn*): moved `draft` → `published`, added `source` URL/origin/archive, set `rights.status` to `"fair-use-teaching"` with attribution so CI validation passes.
- **Rebuilt Catalogs**:
  - `tools/build.py` and `tools/check.py` ran cleanly: **89 published items** (`15 animation`, `17 image`, `39 model`, `6 sdf`, `2 splat`, `10 video`), **7 clips**, and **13 remaining draft/review items** in `review.json` (`102` total items validated).

## 2. Splat Viewer Notes & Next Decisions

- The gallery currently uses **Spark.js** (`@sparkjsdev/spark` `2.4.0`) + Three.js `0.180.0` via `<script type="importmap">` in `site/index.html`. Spark.js 2.4.0's WASM decoder includes SPZ v4 (`NGSP` + ZSTD) support.
- **Known gaps if needed later**:
  1. `site/item.html` lacks the `<script type="importmap">` (SPA links use `site/index.html#/<id>`).
  2. `site/js/curate.js` shows a `"splat preview"` placeholder in the curate workbench instead of an interactive canvas.
  3. Switching to **`gaussian-splat-lite@1.7.0`** (WebGPU/WebGL2, streaming LOD, PLY/SPZ/SOG/RAD/LCC2) remains an open option; it requires bumping Three.js in the import map from `0.180.0` to `>=0.187.0`.

## 3. Verification & Open Items

- **Live WebGL check**: Verify `https://languel.github.io/mediatheque/#/jengahenge2` in a browser to confirm `jengahenge2.spz` orientation (Y-up vs Y-down) and framing in Spark.js 2.4.0.
- **GitHub Pages deploy**: Triggered automatically on push to `main` via `.github/workflows/pages.yml` (`validate` runs `python3 tools/check.py`, `deploy` publishes `_site/`).
- **Remaining `review.json` queue**: 13 draft/review items remain in `items/` (e.g., `giphy-1`, `metastaseis2`, `edison-fred-otts-sneeze-1894`, `wayang-female-transparent`, `pileus-logo`, etc.).
- **Local untracked file**: `speech.wav` in the workspace root is untracked and intentionally left uncommitted.
