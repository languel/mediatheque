# Mediathèque — spec

A personal, public archive of teaching media: film, images, animated GIFs, sound,
3D, Gaussian splats, SVG and text. Served from GitHub with CORS so any page,
sketch or tool (Genereti's 2D stream, p5, three.js, a student's homework) can
stream or download an item by a stable URL. Every item carries its source,
credits, license and provenance.

Model: the Moving Image Archive (https://www.movingimagearchive.com/), and simpler
still: a search box over one grid of thumbnails, and one detail page per item, with
long works broken into **clips** you can search, watch and download one at a time.
On top of that it adds what that site lacks: agent access (JSON, `llms.txt`), easy
downloads and copyable stream URLs, and student-friendly snippets and credits.
`~/dev/portfolio-example` is only a reference for look and structure (plain static
files, a JSON index, the GitHub Pages workflow), not a template to copy.

## Goals

1. **Drop to publish.** Copy files into `inbox/`, run one command (or ask an agent),
   commit. Everything else — probing, derivatives, thumbnails, metadata stubs,
   catalog — is generated.
2. **Provenance first.** No item is published without a source, a rights status and
   a credit line. Original URL and archive links are kept, as are the commands that
   made each derivative from the original.
3. **Human and agent searchable.** A minimal gallery for people; a JSON catalog,
   per-item JSON and `llms.txt` for agents and scripts.
4. **Stream or download, with CORS.** Stable URLs that work cross-origin in the
   browser, in Genereti and from scripts.
5. **Clips, piecemeal.** A long film, recording or sound file is split into short
   clips, each with its own title, description, tags, thumbnail, file and URL, so a
   search finds "the serpentine turn at 0:42" and a student downloads only that.
6. **Small and maintainable.** Plain files in Git, one ingest script, no database,
   no server.

Non-goals (for now): accounts, uploads from the web, comments, a CMS, video
transcoding at scale, hosting large originals (see *Size and hosting*).

## Repository layout

```
mediatheque/
├── spec.md
├── README.md                  # how to add items, how to use URLs
├── inbox/                     # drop zone (ignored except .gitkeep)
├── items/
│   └── <id>/                  # one folder per item, id = slug
│       ├── item.json          # metadata (hand-editable, the source of truth)
│       ├── original.<ext>     # kept when small enough and redistributable
│       ├── media.<ext>        # the web derivative (mp4/webm/webp/mp3/glb/spz…)
│       ├── proxy.webm         # optional small/low-fps proxy (e.g. 768px, 15fps)
│       ├── thumb.webp         # grid thumbnail (square crop, 480px)
│       ├── poster.webp        # first/representative frame, full aspect
│       ├── clips/             # optional: one short file per clip
│       │   ├── 01.webm  01.thumb.webp
│       │   └── 02.webm  02.thumb.webp
│       └── notes.md           # optional longer teaching notes / transcript
├── catalog.json               # generated: all published items, compact fields
├── catalog.jsonl              # generated: one full item per line (agents/grep)
├── llms.txt                   # generated: how to query, fields, URL patterns
├── site/                      # static gallery (index.html, item.html, js, css)
├── tools/
│   ├── ingest.py              # inbox → items/<id>/
│   ├── tags.json              # controlled tag + demo vocabulary (extensible)
│   ├── analyzers/             # probe, scenes, mediapipe, flow, detector, vlm, audio, render, text
│   ├── build.py               # items → catalog.json / catalog.jsonl / llms.txt
│   └── check.py               # validation (CI and pre-commit)
└── .github/workflows/pages.yml
```

`items/<id>/item.json` is the only file a person edits by hand. Everything under
the catalog files is regenerated from items.

## Item metadata (`item.json`)

```jsonc
{
  "id": "sandow-1894",                 // stable slug; never reused or renamed
  "title": "Sandow",
  "kind": "video",                     // video | image | animation | audio | model | splat | vector | text | dataset
  "status": "published",               // draft | review | published | withdrawn
  "summary": "Eugen Sandow flexing, Edison/Dickson, 1894.",   // one line, shown in the grid
  "description": "…",                  // detail page; markdown allowed
  "tags": ["person", "single", "fullbody", "front", "static-camera", "plain-bg",
           "movement", "pose", "slow", "bw", "silent", "loop-friendly", "early-film"],   // controlled vocabulary, see *Tags*
  "keywords": ["Sandow", "strongman", "muscle", "Edison"],                          // free words for search
  "collections": ["earlyfilm"],
  "demos": ["pose", "segmentation", "body-zones"],     // demo/technique fit, see *Tags*
  "creators": [{ "name": "William K. L. Dickson", "role": "director" }, { "name": "Eugen Sandow", "role": "performer" }],
  "date": "1894",                      // of the work (EDTF-style: 1894, 1894-03, 189X)
  "source": {
    "url": "https://commons.wikimedia.org/wiki/File:Sandow_(1894).webm",  // where it was obtained
    "origin": "https://www.loc.gov/item/00694118/",                       // the holding institution, when known
    "archive": "Wikimedia Commons",
    "retrieved": "2026-10-17",
    "via": null                         // e.g. "movingimagearchive.com clip search"
  },
  "rights": {
    "status": "public-domain",          // public-domain | cc | licensed | fair-use-teaching | unknown
    "license": "PD-US",                 // SPDX id or a short name (CC-BY-4.0, CC0-1.0, PD-US, …)
    "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
    "credit": "William K. L. Dickson / Edison Manufacturing Co., 1894. Library of Congress. Public domain.",
    "notes": ""
  },
  "files": {                            // generated by ingest; checked by build
    "media":  { "path": "media.webm", "type": "video/webm", "bytes": 1543210, "width": 768, "height": 576, "duration": 9.0, "fps": 15, "sha256": "…" },
    "proxy":  { "path": "proxy.webm", … },
    "thumb":  { "path": "thumb.webp", … },
    "poster": { "path": "poster.webp", … },
    "original": { "path": "original.webm", "bytes": 9876543, "sha256": "…", "kept": true }
  },
  "provenance": [                       // generated + appended; how each file was made
    { "step": "obtained", "from": "https://commons.wikimedia.org/…", "date": "2026-10-17", "sha256": "…" },
    { "step": "derived", "file": "media.webm", "tool": "ffmpeg 7.1", "args": "-vf fps=15,scale=768:-2 -c:v libvpx-vp9 -crf 34", "date": "2026-10-18" }
  ],
  "added": "2026-10-18",
  "updated": "2026-10-18"
}
```

Required to publish: `id`, `title`, `kind`, `summary`, `source.url` (or
`source.origin`), `rights.status` other than `unknown`, `rights.credit`, and a
`media` file. `check.py` refuses `published` items that miss any of these, and
refuses `rights.status: unknown` outside `draft`.

## Clips

A clip is a named time range of an item (video, animation or audio), stored inside
its parent's `item.json` and published as a searchable entry of its own:

```jsonc
"clips": [
  {
    "n": 1,                               // clip id is "<item id>/<n>", e.g. sandow-1894/01
    "title": "Front double biceps",
    "summary": "Sandow faces the camera, arms raised.",
    "tags": ["person", "fullbody", "front", "arms-raised", "slow"],
    "demos": ["pose", "loop"],
    "in": 0.0, "out": 4.2,                // seconds in the parent media
    "file": "clips/01.webm",              // cut by ingest, short and self-contained
    "thumb": "clips/01.thumb.webp"
  }
]
```

- **Making clips**: `ingest.py --clips <id>` proposes cuts from scene detection
  (ffmpeg `select='gt(scene,0.3)'`) and silence detection for audio; a person or an
  agent names them and adjusts in/out in `item.json`, then `build.py` cuts the files.
  Cuts are recorded in `provenance` like any derivative.
- **Credits and rights** are inherited from the parent; a clip cannot be published
  if its parent is not.
- **Search**: clips are rows in `catalog.json` (`"type": "clip", "parent": "…"`), so
  the grid can show clips next to whole items (toggle: items / clips / both).
- **Detail page**: the parent shows its clip strip (thumbnails on a timeline); each
  clip has its own page and URL (`#/sandow-1894/01`) that plays the clip file, with a
  link to the full work at that time (`media.webm#t=0,4.2`).
- **Without cut files** (a clip whose `file` is absent) the clip plays as a media
  fragment of the parent, so cutting is optional for large items.

## Tags

Tags answer "what do I need for this demo?". They come from a small controlled
vocabulary in `tags.json` (facet → allowed tags, with a one-line meaning each), so
filters are reliable for people and agents; free words go in `keywords`.
`check.py` rejects tags not in the vocabulary; adding a tag or a whole facet is a
one-line edit to `tags.json` (an analyzer that proposes an unknown tag puts it in
`proposed_tags` for you to accept into the vocabulary or drop). Each facet lists the
kinds it applies to, so a sound file is not asked about `framing` and a 3D model is
not asked about `sound`. Clips have their own tags (a film may be `group`, one clip
`single`). The table below is the starting vocabulary, not a limit.

Shared facets (moving image and stills):

| facet | tags |
| --- | --- |
| subject | `person`, `animal`, `object`, `vehicle`, `landscape`, `cityscape`, `interior`, `abstract`, `text-content`, `pattern` |
| people | `single`, `pair`, `group`, `crowd` |
| framing | `fullbody`, `upper-body`, `face`, `hands`, `feet`, `closeup`, `wide` |
| view | `front`, `side`, `back`, `top-down`, `three-quarter` |
| action | `movement`, `dance`, `walk`, `run`, `jump`, `gesture`, `pose`, `fight`, `sport`, `work`, `talk`, `still` |
| motion | `slow`, `fast`, `repetitive`, `cyclic`, `static-camera`, `moving-camera`, `cuts` |
| look | `bw`, `color`, `tinted`, `high-contrast`, `low-light`, `plain-bg`, `busy-bg`, `silhouette`, `grain` |
| sound | `silent`, `music`, `speech`, `percussion`, `ambient`, `noise`, `loop` |
| format | `short` (≤ 10 s), `loop-friendly`, `portrait`, `landscape-format`, `square`, `transparent`, `seamless` |
| era/source | `early-film`, `chronophotography`, `animation`, `archival`, `contemporary`, `generated`, `own-capture` |

Per-kind facets:

| kind | facet | tags |
| --- | --- | --- |
| animation | gif | `seamless-loop`, `pingpong`, `one-shot-anim`, `cinemagraph`, `pixel-art`, `dithered`, `low-palette`, `transparent`, `frame-sequence`, `rotoscope`, `reaction`, `found-gif` (+ `frames`, `fps`, `loop_count`, `palette` fields) |
| image | still | `photo`, `painting`, `drawing`, `print`, `diagram`, `scan`, `sequence` (contact sheet, Muybridge plate), `panorama`, `equirect`, `depth-map`, `alpha` |
| audio | sound type | `music`, `speech`, `voice`, `field-recording`, `foley`, `sfx`, `drone`, `percussion`, `one-shot`, `loop`, `stem`, `impulse-response` |
| audio | music | `tempo-slow`/`mid`/`fast` (+ `bpm` field), `steady-beat`, `free-time`, `tonal`, `atonal`, `key` field, `mono`, `stereo`, `multichannel` |
| model | 3D | `character`, `rigged`, `animated`, `prop`, `scene`, `architecture`, `scan`, `low-poly`, `textured`, `untextured`, `pbr`, `watertight`, `printable` (+ `triangles`, `bbox` fields) |
| splat | splat | `object`, `room`, `outdoor`, `person`, `360`, `cropped`, `noisy` (+ `splats` count field) |
| vector | svg | `line-art`, `filled`, `single-path`, `plotter-ready`, `icon`, `map`, `font-glyph` |
| text | text | `poem`, `script`, `manifesto`, `transcript`, `score`, `code`, `data`, `language` field |

`demos` names what the item is good for in class, also controlled:
`pose`, `hands`, `face-mesh`, `face-expression`, `segmentation`, `object-detection`,
`optical-flow`, `motion-trails`, `background-subtraction`, `body-zones` (mediamime),
`tracking`, `depth`, `style-transfer`, `img2img`, `texture`, `color`, `glitch`,
`datamosh`, `audio-reactive`, `beat`, `sonification`, `typography`, `3d-viewer`,
`splat-viewer`, `projection`, `loop`, `granular`, `convolution`, `speech-to-text`,
`tts`, `midi`, `plotter`, `generative-text`, `photogrammetry`, `rigging`.

Some tags are derived at ingest instead of guessed: `bw`/`color`, `silent`, `short`,
`portrait`/`square`, `transparent`, `static-camera` (low global flow), `cuts`
(scene changes). An agent pass proposes the visual ones (`person`, `fullbody`,
`face`, `single`, `view`), optionally checked with MediaPipe (pose found in most
frames → `person`; all landmarks visible → `fullbody`; face box > 20 % → `face`),
and lists them for review. The gallery shows facets as filter chips, so "person +
fullbody + single + plain-bg + pose" finds a clean demo clip in two clicks.

## Kinds, derivatives and viewers

| kind | web derivative (`media`) | proxy | thumb/poster | viewer on the detail page |
| --- | --- | --- | --- | --- |
| video | mp4 (H.264, faststart) or webm (VP9), ≤ 1080p | webm, 768 px, 15 fps, muted, short | frame at 10% | `<video>` with loop/speed |
| animation (GIF, APNG, animated webp) | the GIF itself, plus mp4 (H.264) and webm (VP9, alpha when transparent) | small webm loop | middle frame + animated thumb | `<img>` (original) / `<video>` loop, frame scrubber |
| image | webp (≤ 3000 px) | — | square crop | `<img>`, zoom |
| audio | mp3 (192k) + original wav/flac when small | — | waveform PNG | `<audio>` + waveform |
| model | glb (Draco/Meshopt optional) | — | rendered turntable frame | `<model-viewer>` |
| splat | spz (preferred) or splat/ply | — | rendered frame | Spark / gsplat.js viewer |
| vector | svg (sanitized: no scripts, no external refs) | — | rasterized | inline `<img>` |
| text | md / txt / pdf | — | first lines | rendered markdown |

### Animated GIFs

GIFs are the most common source, so they are first-class rather than "video lite":

- **Keep the GIF.** The original is the artifact (palette, dithering, timing) and is
  usually small; it is always kept as `original.gif` and served as is. The mp4/webm
  derivatives are for streaming into tools (smaller, seekable, readable as video by
  Genereti, MediaPipe and p5).
- **Exact timing.** Ingest reads every frame's delay, not an average fps: the frame
  count, per-frame delays, total duration, loop count and disposal mode go in
  `files.media`, and the video derivative is made at the real timing (variable delays
  are preserved with a timestamp list, or noted when they are rounded).
- **Frames on demand.** `frames.zip` (PNG per frame, numbered) and `sheet.png` (a
  sprite sheet with its grid in `item.json`) are generated for animation/stop-motion
  and p5 sprite demos; both are optional per item to keep the repo small.
- **Loop analysis.** The `gif` analyzer compares the last and first frames and the
  sequence to tag `seamless-loop`, `pingpong` (A→B→A) or `one-shot-anim`, measures
  palette size and dithering, and detects transparency.
- **Found GIFs and provenance.** GIFs are often reposted and cropped from films. Ingest
  stores a perceptual hash per item so a repost is caught as a duplicate, and an item
  can name the work it was made from: `"derived_from": "sandow-1894"` (or a URL),
  with in/out times when known. The detail page links both ways (a film shows "GIFs
  made from this", a GIF shows "from the film, 0:03–0:06"). The GIF maker (a Tumblr
  or Giphy user, a museum) is credited as a creator with role `gif` alongside the
  original authors, and the source page URL is required like any other item.
- **Muybridge/chronophotography** GIFs record the plate they come from (`plate`,
  `sequence` fields) and link to a still of the plate when the archive has one.

Thumbnails are generated (ffmpeg, Pillow, a headless render for 3D/splats).
A missing renderer is not an error: the item uses a kind icon.

## Ingest (`tools/ingest.py`)

```
python3 tools/ingest.py            # process everything in inbox/
python3 tools/ingest.py --dry-run  # show what would happen
```

For each file (or folder treated as a collection) in `inbox/`:

1. **Identify**: kind from extension and probing (ffprobe, Pillow, glTF header,
   splat header). Hash (sha256). Skip exact duplicates already in `items/`.
2. **Read sidecars** when present, same basename:
   `name.source.txt` (a URL, or `key: value` lines), `name.json` (partial item.json),
   or a saved page like `File_Sandow_(1894).html` (extract the canonical URL,
   author, license template from Wikimedia/Archive.org pages).
3. **Create** `items/<id>/` with a slug from the title or filename (ASCII,
   lowercase, dated when useful: `sandow-1894`).
4. **Derive** media/proxy/thumb/poster with the recipes above; record every
   command in `provenance`.
5. **Write** `item.json` with `status: draft`, everything known filled in and
   `rights.status: unknown` unless a sidecar or source page says otherwise.
6. **Move** the processed file out of `inbox/` (to the item folder as `original.*`
   when it is kept, otherwise to `inbox/.done/`, ignored by Git).

Then `tools/build.py` regenerates the catalogs. An agent pass ("enrich") fills in
`title`, `summary`, `description`, `tags`, `keywords`, `demos`, `creators`, `date` and the rights
fields by looking up the source page — and leaves `status: review` for a human to
confirm. Publishing is a one-word edit (`status: published`) or `ingest.py --publish <id>`.

### Analyzers (VLMs, trackers, audio models)

Ingest runs a chain of **analyzers**, small plugins in `tools/analyzers/`, each
declaring the kinds it handles, what it proposes (tags, fields, clips, captions) and
what it needs (a local model, an API key). They run in cost order and only when
enabled (`ingest.py --analyze probe,mediapipe,vlm` or a `mediatheque.yaml` default),
and their results are cached by file hash, so a re-run is free.

| analyzer | kinds | proposes |
| --- | --- | --- |
| `gif` (Pillow frame walk, perceptual hash) | animation | frame delays, loop count, `seamless-loop`/`pingpong`, palette, `dithered`, `transparent`, duplicates of existing items |
| `probe` (ffprobe, Pillow, trimesh, splat header) | all | format tags, duration, size, bw/color, silent, alpha, triangles, splats |
| `scenes` (ffmpeg scene/silence detect) | video, audio | clip cuts, `cuts`, `static-camera` |
| `mediapipe` (pose, hands, face, segmentation) | video, image | `person`, counts, `fullbody`/`face`/`hands`, `view`, pose quality per clip, demo fit (`pose`, `segmentation`, `body-zones`) |
| `flow` (optical flow) | video | `slow`/`fast`, `moving-camera`, motion energy curve for clip picking |
| `detector` (YOLO / Florence / OWL) | video, image | objects, `animal`, `vehicle`, bounding boxes |
| `vlm` (a local VLM such as Qwen-VL, or an API model) | video (sampled frames), image, 3D/splat (rendered views), svg (raster) | title, summary, description, visual tags, clip names, a contact-sheet caption |
| `audio` (CLAP/PANNs/YAMNet, beat tracker, key detection, Whisper) | audio, video sound | sound type tags, `bpm`, `key`, onsets, `speech` + transcript into `notes.md` |
| `render` (headless three.js / Spark) | model, splat | turntable thumbnails used by `vlm` |
| `text` (LLM) | text | summary, `language`, form tags |

Rules: analyzer output is a **proposal**, written to `item.json` under `proposed`
with the analyzer name, version and confidence, and the item stays in `review` until
a person (or `--accept <id>`) merges it. Measured facts (duration, bpm, triangles)
can be accepted automatically; anything a model guessed is never published
unreviewed. Every analyzer run is recorded in `provenance` (tool, model, version,
date). Remote APIs are opt-in per run and never receive files marked `private`.
The Genereti perception nodes (MediaPipe tasks, the same pinned models) can serve
as the tracker backend, so tags match what the demos will actually detect.

## Catalog and agent access

- `catalog.json`: published items with `id, title, kind, summary, tags, keywords, demos, date,
  creators (names), rights.status, rights.license, credit, thumb, media, proxy,
  width, height, duration, bytes, url` — small enough to load in the gallery.
- `catalog.jsonl`: the complete item.json of each published item, one per line.
- `items/<id>/item.json`: the authoritative record (also served).
- `llms.txt`: what the archive is, field meanings, URL patterns, how to search
  (fetch `catalog.json`, filter by `kind`/`tags`/`demos`/`rights`), and the credit rule.

Agents and scripts never scrape HTML; they read these files. `llms.txt` also
documents recipes: "find a public-domain clip under 5 s with a full figure walking",
"give me the credit for these three URLs", and the stable URL patterns for items and
clips. A small CLI/MCP (`media search`, `media get`, `media credit`) can wrap the same
files later (open question 7).

## Gallery (`site/`)

Plain HTML/CSS/JS like `portfolio-example`, no build step:

- **Grid**: thumbnails, title on hover/below, a search box (title, summary, tags,
  creators; client-side, e.g. a few lines of scoring or MiniSearch), filter chips
  for kind and rights (PD / CC / other), and sort (added, date, title).
- **Detail page** (`item.html?id=…` or `#/id`): the viewer for its kind, title,
  summary, description, creators, date, the credit line, license with link, source
  and origin links, file list with sizes, and the provenance steps.
- **Copy buttons**: stream URL (media), proxy URL, download original, credit line,
  and a Genereti snippet (2D stream URL; MediaPipe-friendly proxy for video).
- **Download**: every file has a direct download link (`download` attribute, a
  readable filename such as `sandow-1894_01_front-double-biceps.webm`) and a
  `credit.txt` beside it; a "download selection" builds a zip in the browser
  (filtered results or picked items) with a `CREDITS.md` and the item JSON.
- **Students**: a "use this" panel with copyable snippets — HTML `<video>`, p5
  `createVideo`, three.js loader, Genereti 2D stream — each with the credit line
  already in a comment, plus a ready credit in plain text and Markdown.
- Mobile friendly; keyboard search (`/`); no tracking; works offline from a clone.

## URLs, CORS and hosting

- **GitHub Pages** serves the site and the files with correct MIME types and
  `Access-Control-Allow-Origin: *`:
  `https://languel.github.io/mediatheque/items/<id>/media.webm`. This is the primary URL.
- **raw.githubusercontent.com** also sends `access-control-allow-origin: *`
  (verified) and is a fallback for repos without Pages; some types arrive as
  `text/plain`, so prefer Pages for media.
- **jsDelivr** (`https://cdn.jsdelivr.net/gh/languel/mediatheque@<tag>/items/<id>/media.webm`)
  gives versioned, cached URLs; it serves files up to 20 MB from GitHub.
- URLs are stable: an item's id and file names never change. A replaced derivative
  keeps its name; the old one is in Git history and a release tag.

### Size and hosting

GitHub: keep files under 50 MB (100 MB is a hard limit), the repo under ~1–2 GB,
no Git LFS (Pages and raw do not serve LFS content). For larger originals: keep
only the web derivative and proxy in the repo, link the original at its source,
or put originals in a Cloudflare R2 bucket with a CORS rule (`AllowedOrigins: *`,
`AllowedMethods: GET, HEAD`) referenced from `files.original.url`.

## Genereti and other consumers

- Genereti's 2D stream takes the media or proxy URL directly.
- A small offline subset (a few short PD clips: Sandow, Serpentine dance, a
  Muybridge walk) is copied into Genereti under the same ids, with their item.json,
  so workflows can reference `mediatheque:<id>` and fall back to the bundled file.
- `catalog.json` is enough for a Genereti media picker or an agent tool later.

## Validation (`tools/check.py`, CI)

- JSON schema for item.json; ids unique and slug-shaped; files exist with matching
  size and sha256; MIME type by extension; file sizes under the limits.
- Published items have source, rights status, credit and a media file.
- SVG sanitized; text/markdown has no raw HTML scripts.
- Catalog files are up to date with items (build is deterministic).

## First collection

Start from `~/Desktop/_tmpassets/` (≈ 475 MB: 32 GIFs, 8 early films/webm, Muybridge
and Marey animations, Dada/Cabaret Voltaire portraits, audio (p_doom), glb models,
splats (spz/splat/ply), Street View panoramas). The saved Wikimedia page next to
Sandow is an example of a provenance sidecar. Remove anything not cleared for
redistribution before ingest; items whose rights cannot be established stay `draft`
and are never published.

## Milestones

1. Repo skeleton, item.json schema, `check.py`, README.
2. `ingest.py` for video, animation, image, audio; `build.py`; catalogs and `llms.txt`.
3. Gallery grid + detail page + copy buttons and downloads; Pages workflow.
3b. Clips: scene/silence proposals, cutting, clip pages and clip search.
4. 3D (glb), splats, SVG, text viewers and thumbnails.
5. Analyzers: probe + scenes + mediapipe first, then audio, vlm, render; the
   enrichment agent pass (source lookup, rights, credits); a review queue page.
6. Genereti offline subset and a media picker.

## Open questions

1. **Name and URL**: `mediatheque` on `languel.github.io/mediatheque`, or a custom domain?
2. **Originals**: keep originals in the repo when small (< 20–50 MB), or only web derivatives + source links?
3. **Scope of rights**: public domain and CC only, or also fair-use teaching material kept
   private (a separate private repo or `draft`-only folder that is never published)?
4. **Generated or AI-made media** (e.g. `Qwen_image_*.png`, splats you captured): how to credit
   models/tools and your own work — a `creators` role like `generated-with`?
5. **Proxies**: one standard proxy for perception (768 px, 15 fps webm), or per-use presets?
6. **Tags**: is the starting vocabulary in *Tags* right? What is missing for your demos?
7. **Agent tooling**: is `catalog.json` + `llms.txt` enough, or also a small MCP/CLI
   (`media search "walking muybridge" --kind animation --pd`)?
8. **Student use**: should students be able to submit items (PRs with an item.json template),
   matching the portfolio-example homework flow?
