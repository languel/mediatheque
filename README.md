# Mediathèque

A personal, public archive of teaching media — early film, chronophotography, animated GIFs, still images, audio, 3D GLB models, Gaussian splats (`.spz`), SVG vectors, and text. Served statically from GitHub Pages with `Access-Control-Allow-Origin: *` so any page, sketch, or tool (Genereti's 2D stream, p5.js, Three.js, or student homework) can stream or download an item by a stable URL with full provenance and attribution.

## Quick Start

### 1. Add Media (`Drop to Publish`)

1. Drop files (or collection folders) into `inbox/` with optional sidecars (`<name>.source.txt`, `<name>.json`, or saved Wikimedia/Archive HTML):
   ```bash
   cp path/to/media.webm inbox/
   ```
2. Run ingest to probe, generate web derivatives (`media.*`, `proxy.webm`, `poster.webp`, `thumb.webp`), run analyzers, and create `items/<id>/item.json`:
   ```bash
   .venv/bin/python tools/ingest.py
   ```
3. Fill in or verify `source`, `rights`, `tags`, and `demos` in `items/<id>/item.json`, then publish and rebuild the catalogs:
   ```bash
   .venv/bin/python tools/ingest.py --publish <id>
   .venv/bin/python tools/build.py
   .venv/bin/python tools/check.py
   ```

### 2. Clips & GIF Sprite Sheets

- **Propose and cut clips** for a video or audio item:
  ```bash
  .venv/bin/python tools/ingest.py --clips sandow-1894
  .venv/bin/python tools/build.py
  ```
- **Generate a sprite sheet (`sheet.png`) and numbered frame archive (`frames.zip`)** for an animated GIF:
  ```bash
  .venv/bin/python tools/ingest.py --frames muybridge-human-male-walking-animated
  ```

### 3. CLI & Agent Search

Query the catalog from the terminal with `tools/media.py` or `jq`:

```bash
# Search public-domain walking animations under 5 seconds
.venv/bin/python tools/media.py search "walking" --kind animation --pd --max-duration 5

# Search items or clips suited for pose estimation
.venv/bin/python tools/media.py search --demo pose

# Inspect an item or clip record
.venv/bin/python tools/media.py get sandow-1894
.venv/bin/python tools/media.py get sandow-1894/01

# Print plain-text or Markdown credit lines for item IDs or URLs
.venv/bin/python tools/media.py credit sandow-1894 muybridge-race-horse-animated --markdown
```

Agents and scripts should read:
- [`llms.txt`](llms.txt) — schema, controlled vocabulary, URL patterns, and query recipes
- [`catalog.json`](catalog.json) — compact index of all published items and clips
- [`catalog.jsonl`](catalog.jsonl) — one full `item.json` record per line
- `items/<id>/item.json` — authoritative per-item metadata and provenance

### 4. Stable URLs & CORS

- **GitHub Pages (Primary)**:
  - Web stream: `https://languel.github.io/mediatheque/items/<id>/media.<ext>`
  - Perception proxy (768px, 15fps WebM): `https://languel.github.io/mediatheque/items/<id>/proxy.webm`
  - Original GIF: `https://languel.github.io/mediatheque/items/<id>/original.gif`
  - Clip file: `https://languel.github.io/mediatheque/items/<id>/clips/<nn>.webm`
  - Thumbnail: `https://languel.github.io/mediatheque/items/<id>/thumb.webp`
- **jsDelivr CDN (Versioned, up to 20 MB)**:
  - `https://cdn.jsdelivr.net/gh/languel/mediatheque@main/items/<id>/media.<ext>`
- **GitHub Raw (Fallback)**:
  - `https://raw.githubusercontent.com/languel/mediatheque/main/items/<id>/media.<ext>`

### 5. Local Gallery Preview

Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8000
# Open http://localhost:8000/site/
```
