(function () {
  "use strict";

  // Determine relative prefix to repository root (handles both /site/index.html and /index.html on Pages)
  const isSubdir = window.location.pathname.includes("/site/");
  const ROOT_PREFIX = isSubdir ? "../" : "./";

  const state = {
    catalog: [],
    review: [],
    tagsVocab: null,
    query: "",
    typeFilter: "both", // both | item | clip
    kindFilter: "all",
    rightsFilter: "all",
    activeTags: new Set(),
    activeDemos: new Set(),
    sortBy: "title",
    selectedIds: new Set(),
    itemCache: new Map(),
  };

  const els = {
    headerCount: document.getElementById("header-count"),
    searchInput: document.getElementById("search-input"),
    btnToggleFacets: document.getElementById("btn-toggle-facets"),
    facetDrawer: document.getElementById("facet-drawer"),
    facetDrawerContent: document.getElementById("facet-drawer-content"),
    activeFilters: document.getElementById("active-filters"),
    selectionStatus: document.getElementById("selection-status"),
    btnSelectFiltered: document.getElementById("btn-select-filtered"),
    btnClearSelection: document.getElementById("btn-clear-selection"),
    btnDownloadZip: document.getElementById("btn-download-zip"),
    sortSelect: document.getElementById("sort-select"),
    mediaGrid: document.getElementById("media-grid"),
    viewGallery: document.getElementById("view-gallery"),
    viewDetail: document.getElementById("view-detail"),
    viewReview: document.getElementById("view-review"),
    detailRoot: document.getElementById("detail-root"),
    reviewList: document.getElementById("review-list"),
    reviewBadge: document.getElementById("review-badge"),
    themeToggle: document.getElementById("theme-toggle"),
    toast: document.getElementById("toast"),
  };

  function resolveAssetUrl(relPath) {
    if (!relPath) return "";
    if (relPath.startsWith("http://") || relPath.startsWith("https://")) return relPath;
    return ROOT_PREFIX + relPath.replace(/^\/+/, "");
  }

  function resolveAbsoluteUrl(relPath) {
    if (!relPath) return "";
    if (relPath.startsWith("http://") || relPath.startsWith("https://")) return relPath;
    const a = document.createElement("a");
    a.href = resolveAssetUrl(relPath);
    return a.href;
  }

  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2200);
  }

  async function copyText(text, label, comfyClipboardData) {
    try {
      if (comfyClipboardData && navigator.clipboard && window.ClipboardItem) {
        const jsonBytes = new TextEncoder().encode(JSON.stringify(comfyClipboardData));
        let binary = "";
        for (let i = 0; i < jsonBytes.length; i++) {
          binary += String.fromCharCode(jsonBytes[i]);
        }
        const b64 = btoa(binary);
        const html = `<meta charset="utf-8"><div><span data-metadata="${b64}"></span></div><span style="white-space:pre-wrap;">Text</span>`;
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        showToast(`Copied ${label || "to clipboard"} (press Cmd/Ctrl+V on ComfyUI canvas)`);
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${label || "to clipboard"}`);
    } catch (_err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast(`Copied ${label || "to clipboard"}`);
    }
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDuration(sec) {
    if (!sec && sec !== 0) return "";
    const s = Number(sec);
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.round(s % 60);
    return `${m}:${String(rem).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Theme initialization
  function initTheme() {
    const saved = localStorage.getItem("mediatheque-theme");
    if (saved === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
    if (els.themeToggle) {
      els.themeToggle.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme");
        const next = cur === "light" ? "dark" : "light";
        if (next === "light") {
          document.documentElement.setAttribute("data-theme", "light");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
        localStorage.setItem("mediatheque-theme", next);
      });
    }
  }

  // Adjust header links for root vs /site/
  function initHeaderLinks() {
    document.querySelectorAll("[data-llms-link]").forEach((a) => {
      a.href = resolveAssetUrl("llms.txt");
    });
    document.querySelectorAll("[data-catalog-link]").forEach((a) => {
      a.href = resolveAssetUrl("catalog.json");
    });
  }

  // Fetch initial catalog, review queue, and tag vocabulary
  async function loadData() {
    const [catRes, revRes, tagsRes] = await Promise.allSettled([
      fetch(resolveAssetUrl("catalog.json")),
      fetch(resolveAssetUrl("review.json")),
      fetch(resolveAssetUrl("tools/tags.json")),
    ]);

    if (catRes.status === "fulfilled" && catRes.value.ok) {
      state.catalog = await catRes.value.json();
    }
    if (revRes.status === "fulfilled" && revRes.value.ok) {
      state.review = await revRes.value.json();
    }
    if (tagsRes.status === "fulfilled" && tagsRes.value.ok) {
      state.tagsVocab = await tagsRes.value.json();
    }

    if (els.reviewBadge && state.review.length > 0) {
      els.reviewBadge.textContent = String(state.review.length);
      els.reviewBadge.hidden = false;
    }

    renderFacetDrawer();
    handleRoute();
  }

  function renderFacetDrawer() {
    if (!els.facetDrawerContent || !state.tagsVocab) return;
    // Collect tags and demos actually present in catalog for quick discovery, plus full vocabulary
    const presentTags = new Set();
    const presentDemos = new Set();
    for (const entry of state.catalog) {
      (entry.tags || []).forEach((t) => presentTags.add(t));
      (entry.demos || []).forEach((d) => presentDemos.add(d));
    }

    const blocks = [];
    // Demos block first
    const demosObj = state.tagsVocab.demos || {};
    const demoKeys = Object.keys(demosObj).filter((d) => presentDemos.has(d) || state.activeDemos.has(d));
    const allDemoKeys = demoKeys.length ? demoKeys : Object.keys(demosObj).slice(0, 18);
    blocks.push(`
      <div class="facet-block">
        <div class="facet-block__title">Demos (Class Fit)</div>
        <div class="facet-block__chips">
          ${allDemoKeys
            .map(
              (d) =>
                `<button type="button" class="chip chip--small ${
                  state.activeDemos.has(d) ? "is-active" : ""
                }" data-demo-chip="${escapeHtml(d)}" title="${escapeHtml(demosObj[d])}">${escapeHtml(d)}</button>`
            )
            .join("")}
        </div>
      </div>
    `);

    const facets = state.tagsVocab.facets || {};
    for (const [facetKey, facetDef] of Object.entries(facets)) {
      const tagMap = facetDef.tags || {};
      const keys = Object.keys(tagMap).filter((t) => presentTags.has(t) || state.activeTags.has(t));
      if (!keys.length) continue;
      blocks.push(`
        <div class="facet-block">
          <div class="facet-block__title">${escapeHtml(facetDef.label || facetKey)}</div>
          <div class="facet-block__chips">
            ${keys
              .map(
                (t) =>
                  `<button type="button" class="chip chip--small ${
                    state.activeTags.has(t) ? "is-active" : ""
                  }" data-tag-chip="${escapeHtml(t)}" title="${escapeHtml(tagMap[t])}">${escapeHtml(t)}</button>`
              )
              .join("")}
          </div>
        </div>
      `);
    }

    els.facetDrawerContent.innerHTML = blocks.join("");
  }

  function getFilteredEntries() {
    const terms = state.query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = state.catalog.filter((entry) => {
      if (state.typeFilter !== "both" && entry.type !== state.typeFilter) return false;
      if (state.kindFilter !== "all" && entry.kind !== state.kindFilter) return false;

      if (state.rightsFilter !== "all") {
        const rs = (entry.rights && entry.rights.status) || "unknown";
        if (state.rightsFilter === "public-domain" && rs !== "public-domain") return false;
        if (state.rightsFilter === "cc" && rs !== "cc") return false;
        if (state.rightsFilter === "other" && (rs === "public-domain" || rs === "cc")) return false;
      }

      for (const reqTag of state.activeTags) {
        if (!(entry.tags || []).includes(reqTag)) return false;
      }
      for (const reqDemo of state.activeDemos) {
        if (!(entry.demos || []).includes(reqDemo)) return false;
      }

      if (terms.length > 0) {
        const hay = [
          entry.id,
          entry.title,
          entry.summary,
          entry.date,
          ...(entry.tags || []),
          ...(entry.keywords || []),
          ...(entry.demos || []),
          ...(entry.creators || []),
          ...(entry.collections || []),
        ]
          .join(" ")
          .toLowerCase();
        for (const t of terms) {
          if (!hay.includes(t)) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (state.sortBy === "date") {
        return String(a.date || "9999").localeCompare(String(b.date || "9999"));
      }
      if (state.sortBy === "added") {
        return String(b.added || "").localeCompare(String(a.added || ""));
      }
      if (state.sortBy === "duration") {
        return (Number(a.duration) || 9999) - (Number(b.duration) || 9999);
      }
      return String(a.title || "").localeCompare(String(b.title || ""));
    });

    return filtered;
  }

  function renderActiveFilterPills() {
    if (!els.activeFilters) return;
    const pills = [];
    for (const t of state.activeTags) {
      pills.push(
        `<button type="button" class="active-pill" data-remove-tag="${escapeHtml(t)}">tag:${escapeHtml(t)} ×</button>`
      );
    }
    for (const d of state.activeDemos) {
      pills.push(
        `<button type="button" class="active-pill" data-remove-demo="${escapeHtml(d)}">demo:${escapeHtml(
          d
        )} ×</button>`
      );
    }
    if (pills.length > 1) {
      pills.push(`<button type="button" class="btn-small" data-clear-all-facets>Clear filters</button>`);
    }
    els.activeFilters.innerHTML = pills.join("");
  }

  function updateSelectionUI() {
    if (!els.selectionStatus) return;
    const count = state.selectedIds.size;
    els.selectionStatus.textContent = `${count} selected`;
    if (els.btnClearSelection) {
      els.btnClearSelection.hidden = count === 0;
    }
  }

  function renderGallery() {
    if (!els.mediaGrid) return;
    const entries = getFilteredEntries();
    const itemCount = entries.filter((e) => e.type === "item").length;
    const clipCount = entries.filter((e) => e.type === "clip").length;
    if (els.headerCount) {
      els.headerCount.textContent = `${itemCount} items · ${clipCount} clips`;
    }

    renderActiveFilterPills();
    updateSelectionUI();

    if (entries.length === 0) {
      els.mediaGrid.innerHTML = `<p class="muted-copy" style="grid-column: 1 / -1; padding: 2rem 0;">No items or clips match the current filter.</p>`;
      return;
    }

    els.mediaGrid.innerHTML = entries
      .map((entry) => {
        const thumbUrl = resolveAssetUrl(entry.thumb || entry.poster);
        const isClip = entry.type === "clip";
        const dur = formatDuration(entry.duration);
        const rightsStatus = (entry.rights && entry.rights.status) || "";
        const rightsLabel =
          rightsStatus === "public-domain"
            ? "PD"
            : rightsStatus === "cc"
            ? entry.rights.license || "CC"
            : rightsStatus;
        const checked = state.selectedIds.has(entry.id) ? "checked" : "";
        const streamUrl = resolveAbsoluteUrl(entry.media);
        const hoverVideo =
          entry.kind === "video"
            ? resolveAssetUrl(entry.proxy || entry.media)
            : entry.kind === "animation" && entry.proxy
            ? resolveAssetUrl(entry.proxy)
            : "";

        return `
        <article class="media-card" data-entry-id="${escapeHtml(entry.id)}" data-hover-video="${escapeHtml(hoverVideo)}">
          <a class="media-card__thumb-wrap" href="#/${escapeHtml(entry.id)}">
            ${
              thumbUrl
                ? `<img class="media-card__thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(
                    entry.title
                  )}" loading="lazy" />`
                : `<div class="media-card__thumb"></div>`
            }
            <div class="media-card__badges">
              <div class="badge-group">
                ${isClip ? `<span class="card-badge card-badge--clip">Clip ${String(entry.n).padStart(2, "0")}</span>` : ""}
                <span class="card-badge">${escapeHtml(entry.kind)}</span>
                ${dur ? `<span class="card-badge">${escapeHtml(dur)}</span>` : ""}
                ${
                  rightsLabel
                    ? `<span class="card-badge ${
                        rightsStatus === "public-domain" ? "card-badge--pd" : ""
                      }">${escapeHtml(rightsLabel)}</span>`
                    : ""
                }
              </div>
              <input
                type="checkbox"
                class="card-select"
                data-select-id="${escapeHtml(entry.id)}"
                aria-label="Select ${escapeHtml(entry.title)}"
                ${checked}
              />
            </div>
          </a>
          <div class="media-card__body">
            <div class="media-card__head">
              <a href="#/${escapeHtml(entry.id)}" class="media-card__title">${escapeHtml(entry.title)}</a>
              ${entry.date ? `<span class="media-card__date">${escapeHtml(entry.date)}</span>` : ""}
            </div>
            <p class="media-card__summary">${escapeHtml(entry.summary)}</p>
            <div class="media-card__footer">
              <div class="media-card__tags">
                ${(entry.tags || [])
                  .slice(0, 3)
                  .map((t) => `<span class="tag-mini">${escapeHtml(t)}</span>`)
                  .join("")}
              </div>
              <button
                type="button"
                class="card-copy-btn"
                data-copy-url="${escapeHtml(streamUrl)}"
                data-tooltip="Copy Primary Stream URL: Full-fidelity, CORS-enabled web delivery file for HTML, p5.js, Three.js, or Genereti."
                title="Copy Primary Stream URL"
              >
                Copy URL
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join("");
  }

  // =========================================================================
  // Seamless Loop Finder & A/B Seam Comparison (ported from ~/dev/slopscore)
  // =========================================================================
  function frameDifference(a, b, channels = 4, step = 1) {
    const n = Math.min(a.length, b.length);
    let sq = 0;
    let abs = 0;
    let count = 0;
    const stride = channels * step;
    for (let i = 0; i + 2 < n; i += stride) {
      const dr = a[i] - b[i];
      const dg = a[i + 1] - b[i + 1];
      const db = a[i + 2] - b[i + 2];
      sq += dr * dr + dg * dg + db * db;
      abs += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
      count += 3;
    }
    const mse = count ? sq / (count * 255 * 255) : 1;
    const mad = count ? abs / (count * 255) : 1;
    const match = Math.max(0, Math.min(100, (1 - mad) * 100));
    return { mse, mad, match };
  }

  async function autoMatchLoop(
    grab,
    {
      inSec,
      outSec,
      duration = Infinity,
      window: scanWin = 1.0,
      step = 1 / 15,
      minLength = 0.25,
      channels = 4,
      refineIn = true,
      onProgress,
    } = {}
  ) {
    const candidates = [];
    const cache = new Map();
    const get = async (t) => {
      const k = t.toFixed(3);
      if (!cache.has(k)) cache.set(k, await grab(t));
      return cache.get(k);
    };
    const score = async (i, o) => {
      const r = frameDifference(await get(i), await get(o), channels, 1);
      const c = { inSec: +i.toFixed(3), outSec: +o.toFixed(3), ...r };
      candidates.push(c);
      return c;
    };

    let best = await score(inSec, outSec);
    const outLo = Math.max(inSec + minLength, outSec - scanWin);
    const outHi = Math.min(duration, outSec + scanWin);
    const totalSteps =
      Math.max(1, Math.ceil((outHi - outLo) / step)) +
      (refineIn ? Math.max(1, Math.ceil((2 * scanWin) / step)) : 0);
    let done = 0;
    for (let o = outLo; o <= outHi + 1e-9; o += step) {
      const c = await score(inSec, o);
      if (c.mse < best.mse) best = c;
      if (onProgress) onProgress(++done / totalSteps, best);
    }
    if (refineIn) {
      const inLo = Math.max(0, best.inSec - scanWin * 0.5);
      const inHi = Math.min(best.outSec - minLength, best.inSec + scanWin * 0.5);
      for (let i = inLo; i <= inHi + 1e-9; i += step) {
        const c = await score(i, best.outSec);
        if (c.mse < best.mse) best = c;
        if (onProgress) onProgress(++done / totalSteps, best);
      }
    }
    candidates.sort((x, y) => x.mse - y.mse);
    return {
      inSec: best.inSec,
      outSec: best.outSec,
      match: best.match,
      mse: best.mse,
      candidates: candidates.slice(0, 8),
    };
  }

  const probeVideoCache = new Map();
  async function getProbeVideo(src) {
    if (probeVideoCache.has(src)) return probeVideoCache.get(src);
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      v.onloadeddata = done;
      v.onerror = done;
      setTimeout(done, 800);
    });
    probeVideoCache.set(src, v);
    return v;
  }

  async function grabVideoFrame(videoSrc, timeSec, targetCanvas, { width = 96, height = 54 } = {}) {
    if (!videoSrc) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    }
    const probe = await getProbeVideo(videoSrc);
    const targetTime = Math.max(0, Math.min(probe.duration || timeSec, timeSec));
    if (Math.abs((probe.currentTime || 0) - targetTime) > 0.005) {
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        probe.onseeked = done;
        probe.onerror = done;
        try {
          probe.currentTime = targetTime;
        } catch (_e) {
          done();
        }
        setTimeout(done, 250);
      });
    }

    if (targetCanvas) {
      const cw = probe.videoWidth || 480;
      const ch = probe.videoHeight || 360;
      if (targetCanvas.width !== cw) targetCanvas.width = cw;
      if (targetCanvas.height !== ch) targetCanvas.height = ch;
      const tCtx = targetCanvas.getContext("2d");
      try {
        tCtx.drawImage(probe, 0, 0, cw, ch);
      } catch (_e) {
        // ignore CORS/seek transient
      }
    }

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const sCtx = sampleCanvas.getContext("2d");
    try {
      sCtx.drawImage(probe, 0, 0, width, height);
      const img = sCtx.getImageData(0, 0, width, height);
      return { width, height, data: img.data };
    } catch (_e) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    }
  }

  function compareCanvases(canvasA, canvasB, { width = 96, height = 54 } = {}) {
    if (!canvasA || !canvasB || !canvasA.width || !canvasB.width) {
      return { mse: 0, mad: 0, match: 100 };
    }
    const cA = document.createElement("canvas");
    cA.width = width;
    cA.height = height;
    const cB = document.createElement("canvas");
    cB.width = width;
    cB.height = height;
    const ctxA = cA.getContext("2d");
    const ctxB = cB.getContext("2d");
    ctxA.drawImage(canvasA, 0, 0, width, height);
    ctxB.drawImage(canvasB, 0, 0, width, height);
    const dataA = ctxA.getImageData(0, 0, width, height).data;
    const dataB = ctxB.getImageData(0, 0, width, height).data;
    return frameDifference(dataA, dataB, 4, 1);
  }

  // Fetch full item.json for detail view
  async function fetchFullItem(itemId) {
    if (state.itemCache.has(itemId)) return state.itemCache.get(itemId);
    const res = await fetch(resolveAssetUrl(`items/${itemId}/item.json`));
    if (!res.ok) return null;
    const data = await res.json();
    state.itemCache.set(itemId, data);
    return data;
  }

  function buildStudentSnippets(item, entry, activeClip, customLoop) {
    const title = activeClip ? `${item.title} — ${activeClip.title}` : item.title;
    const credit = (item.rights && item.rights.credit) || "";
    const srcUrl = (item.source && (item.source.url || item.source.origin)) || "";
    const hasCustomLoop =
      customLoop &&
      typeof customLoop.inSec === "number" &&
      typeof customLoop.outSec === "number" &&
      (customLoop.inSec > 0.01 ||
        (customLoop.duration && customLoop.outSec < customLoop.duration - 0.02));
    const loopFrag = hasCustomLoop
      ? `#t=${customLoop.inSec.toFixed(2)},${customLoop.outSec.toFixed(2)}`
      : "";

    const streamRel = activeClip
      ? activeClip.file
        ? `items/${item.id}/${activeClip.file}${loopFrag}`
        : `items/${item.id}/${item.files.media.path}#t=${activeClip.in},${activeClip.out}`
      : item.kind === "animation" && item.files.original && item.files.original.kept && !hasCustomLoop
      ? `items/${item.id}/${item.files.original.path}`
      : `items/${item.id}/${item.files.media.path}${loopFrag}`;
    const streamUrl = resolveAbsoluteUrl(streamRel);
    const videoStreamUrl = resolveAbsoluteUrl(
      (activeClip && activeClip.file
        ? `items/${item.id}/${activeClip.file}`
        : `items/${item.id}/${item.files.media.path}`) + loopFrag
    );
    const proxyUrl =
      item.files && item.files.proxy
        ? resolveAbsoluteUrl(`items/${item.id}/${item.files.proxy.path}${loopFrag}`)
        : videoStreamUrl;

    const commentHeader = `// Source: ${title}\n// Credit: ${credit}\n// Archive: ${srcUrl}\n`;

    let htmlSnippet = `<!--\n  Source: ${title}\n  Credit: ${credit}\n  URL: ${srcUrl}\n-->\n`;
    if (item.kind === "video" || activeClip || hasCustomLoop) {
      htmlSnippet += `<video src="${videoStreamUrl}" crossorigin="anonymous" controls loop muted playsinline></video>`;
    } else if (item.kind === "animation" || item.kind === "image" || item.kind === "vector") {
      htmlSnippet += `<img src="${streamUrl}" crossorigin="anonymous" alt="${title}" />`;
    } else if (item.kind === "audio") {
      htmlSnippet += `<audio src="${streamUrl}" crossorigin="anonymous" controls></audio>`;
    } else if (item.kind === "model") {
      htmlSnippet += `<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"><\/script>\n<model-viewer src="${streamUrl}" camera-controls auto-rotate></model-viewer>`;
    } else {
      htmlSnippet += `<a href="${streamUrl}">${title}</a>`;
    }

    let p5Snippet = commentHeader;
    if (item.kind === "video" || item.kind === "animation" || activeClip) {
      if (hasCustomLoop) {
        const inS = customLoop.inSec.toFixed(2);
        const outS = customLoop.outSec.toFixed(2);
        p5Snippet += `let vid;\nconst LOOP_IN = ${inS}, LOOP_OUT = ${outS};\nfunction setup() {\n  createCanvas(768, 576);\n  vid = createVideo("${videoStreamUrl}");\n  vid.elt.crossOrigin = "anonymous";\n  vid.volume(0);\n  vid.play();\n  vid.hide();\n}\nfunction draw() {\n  if (vid.time() < LOOP_IN || vid.time() >= LOOP_OUT) vid.time(LOOP_IN);\n  image(vid, 0, 0, width, height);\n}`;
      } else {
        p5Snippet += `let vid;\nfunction setup() {\n  createCanvas(768, 576);\n  vid = createVideo("${videoStreamUrl}");\n  vid.elt.crossOrigin = "anonymous";\n  vid.loop();\n  vid.hide();\n}\nfunction draw() {\n  image(vid, 0, 0, width, height);\n}`;
      }
    } else if (item.kind === "image" || item.kind === "vector") {
      p5Snippet += `let img;\nfunction preload() {\n  img = loadImage("${streamUrl}");\n}\nfunction setup() {\n  createCanvas(img.width, img.height);\n  image(img, 0, 0);\n}`;
    } else if (item.kind === "model") {
      p5Snippet += `// Use Three.js GLTFLoader or model-viewer for .glb files:\nconst MODEL_URL = "${streamUrl}";`;
    } else {
      p5Snippet += `const MEDIA_URL = "${streamUrl}";`;
    }

    let threeSnippet = commentHeader;
    if (item.kind === "model") {
      threeSnippet += `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";\n\nconst loader = new GLTFLoader();\nloader.load("${streamUrl}", (gltf) => {\n  scene.add(gltf.scene);\n});`;
    } else if (item.kind === "splat") {
      threeSnippet += `import { SplatMesh } from "@sparkjsdev/spark";\n\nconst splat = new SplatMesh({ url: "${streamUrl}" });\nscene.add(splat);`;
    } else if (item.kind === "video" || item.kind === "animation") {
      threeSnippet += `import * as THREE from "three";\n\nconst video = document.createElement("video");\nvideo.crossOrigin = "anonymous";\nvideo.src = "${videoStreamUrl}";\nvideo.loop = true;\nvideo.muted = true;\nvideo.play();\nconst texture = new THREE.VideoTexture(video);`;
    } else {
      threeSnippet += `import * as THREE from "three";\n\nconst texture = new THREE.TextureLoader().load("${streamUrl}");`;
    }

    const mediathequeId = activeClip
      ? `${item.id}/${String(activeClip.n).padStart(2, "0")}`
      : item.id;
    const generetiMediaUrl =
      item.kind === "video" || activeClip || hasCustomLoop ? proxyUrl || videoStreamUrl : streamUrl;
    const generetiMediaKind =
      item.kind === "video" || activeClip || hasCustomLoop
        ? "video"
        : item.kind === "image" || item.kind === "vector"
        ? "image"
        : "auto";
    const generetiNode = {
      id: 1,
      type: "GeneretiMediaStream",
      title: `ꘇ 2D stream · ${title}`,
      pos: [80, 80],
      size: [460, 480],
      flags: {},
      order: 0,
      mode: 0,
      inputs: [
        {
          localized_name: "image",
          name: "image",
          shape: 7,
          type: "IMAGE",
          link: null,
        },
        {
          localized_name: "capture",
          name: "capture",
          shape: 7,
          type: "STRING",
          widget: {
            name: "capture",
          },
          link: null,
        },
      ],
      outputs: [
        {
          localized_name: "image",
          name: "image",
          type: "IMAGE",
          links: [],
        },
      ],
      properties: {
        generetiPerformanceVersion: 1,
        "Node name for S&R": "GeneretiMediaStream",
        genereti_preview_fit: "contain",
        genereti_media_url: generetiMediaUrl,
        genereti_media_kind: generetiMediaKind,
        genereti_media_fps: 30,
        genereti_media_loop: true,
        mediatheque_id: mediathequeId,
        mediatheque_highres_url: streamUrl,
        mediatheque_credit: credit,
        ...(hasCustomLoop
          ? {
              mediatheque_loop_in: +customLoop.inSec.toFixed(3),
              mediatheque_loop_out: +customLoop.outSec.toFixed(3),
            }
          : {}),
      },
      widgets_values: ["GENERETI_OFF:2D stream"],
    };

    const generetiWorkflow = {
      version: 0.4,
      last_node_id: 1,
      last_link_id: 0,
      nodes: [generetiNode],
      links: [],
      groups: [],
      config: {},
      extra: {
        mediatheque_id: mediathequeId,
        mediatheque_credit: credit,
      },
    };

    const generetiClipboard = {
      nodes: [generetiNode],
      groups: [],
      reroutes: [],
      links: [],
      subgraphs: [],
    };

    const generetiSnippet = JSON.stringify(generetiWorkflow, null, 2);

    const creditsSnippet = `Plain text:\n${title} — ${credit} (${srcUrl})\n\nMarkdown:\n[${title}](${srcUrl}) — ${credit}`;

    return {
      html: htmlSnippet,
      p5: p5Snippet,
      three: threeSnippet,
      genereti: generetiSnippet,
      generetiClipboard: generetiClipboard,
      credits: creditsSnippet,
    };
  }

  async function renderDetailView(rawId) {
    if (!els.detailRoot) return;
    const parts = rawId.split("/");
    const parentId = parts[0];
    const clipNum = parts[1] ? parseInt(parts[1], 10) : null;

    els.detailRoot.innerHTML = `<p class="muted-copy">Loading ${escapeHtml(rawId)}…</p>`;
    const item = await fetchFullItem(parentId);
    if (!item) {
      els.detailRoot.innerHTML = `<p class="muted-copy">Item <code>${escapeHtml(
        rawId
      )}</code> not found. <a href="#/" class="btn-small">← Back to Gallery</a></p>`;
      return;
    }

    const catEntry = state.catalog.find((e) => e.id === parentId && e.type === "item") || {};
    const activeClip =
      clipNum !== null && Array.isArray(item.clips)
        ? item.clips.find((c) => Number(c.n) === clipNum) || null
        : null;

    const files = item.files || {};
    const mediaRel = files.media ? `items/${item.id}/${files.media.path}` : "";
    const proxyRel = files.proxy ? `items/${item.id}/${files.proxy.path}` : "";
    const origRel =
      files.original && files.original.kept ? `items/${item.id}/${files.original.path}` : "";
    const posterRel = files.poster ? `items/${item.id}/${files.poster.path}` : "";

    const activeMediaRel = activeClip
      ? activeClip.file
        ? `items/${item.id}/${activeClip.file}`
        : `${mediaRel}#t=${activeClip.in},${activeClip.out}`
      : mediaRel;

    const streamUrl = resolveAbsoluteUrl(
      item.kind === "animation" && origRel && !activeClip ? origRel : activeMediaRel
    );
    const videoStreamUrl = resolveAbsoluteUrl(activeMediaRel);
    const proxyUrl = proxyRel ? resolveAbsoluteUrl(proxyRel) : "";
    const origUrl = origRel
      ? resolveAbsoluteUrl(origRel)
      : (files.original && files.original.url) || "";

    const displayTitle = activeClip
      ? `${item.title} — Clip ${String(activeClip.n).padStart(2, "0")}: ${activeClip.title}`
      : item.title;
    const displaySummary = activeClip ? activeClip.summary || item.summary : item.summary;
    const displayTags = activeClip && activeClip.tags && activeClip.tags.length ? activeClip.tags : item.tags || [];
    const displayDemos =
      activeClip && activeClip.demos && activeClip.demos.length ? activeClip.demos : item.demos || [];

    // Build viewer HTML by kind
    let viewerHtml = "";
    let controlsHtml = "";

    if (item.kind === "video" || item.kind === "animation" || activeClip) {
      const isAnim = item.kind === "animation" && !activeClip;
      const vSrc = resolveAssetUrl(
        activeClip && activeClip.file ? `items/${item.id}/${activeClip.file}` : mediaRel
      );
      const gifSrc = isAnim ? resolveAssetUrl(origRel || mediaRel) : "";
      const fMeta = files.media || {};
      const dur = Number(
        (activeClip ? activeClip.out - activeClip.in : fMeta.duration) || 4
      );
      const fps = Number(fMeta.fps || (isAnim ? 10 : 24));
      const nFrames = Number(fMeta.frames || Math.max(1, Math.round(dur * fps)));
      const delays = fMeta.frame_delays_ms || [];
      const initIn = activeClip && !activeClip.file ? Number(activeClip.in || 0) : 0;
      const initOut =
        activeClip && !activeClip.file
          ? Number(activeClip.out || dur)
          : Math.max(0.1, dur);
      const stepSec = +(1 / Math.max(1, fps)).toFixed(4);

      viewerHtml = `
        <div class="viewer-stage ${isAnim ? "viewer-stage--checker" : ""}" id="single-player-wrapper">
          <video
            id="detail-video"
            src="${escapeHtml(vSrc)}"
            ${posterRel ? `poster="${escapeHtml(resolveAssetUrl(posterRel))}"` : ""}
            autoplay
            loop
            muted
            playsinline
            crossorigin="anonymous"
          ></video>
          ${
            isAnim
              ? `<img id="anim-gif-img" src="${escapeHtml(gifSrc)}" alt="${escapeHtml(
                  item.title
                )}" hidden />`
              : ""
          }
        </div>
        <div id="ab-compare-wrapper" class="ab-compare-container" hidden>
          <div class="ab-pane" id="ab-pane-in">
            <div class="ab-pane-header">
              <span class="ab-label">FRAME A (LOOP IN)</span>
              <span id="ab-time-in" class="ab-time">${initIn.toFixed(2)}s · f1</span>
            </div>
            <div class="ab-viewport">
              <canvas id="ab-canvas-in"></canvas>
            </div>
          </div>
          <div class="ab-pane" id="ab-pane-out">
            <div class="ab-pane-header">
              <span class="ab-label ab-label--out" id="ab-label-out">FRAME B (LOOP OUT)</span>
              <span id="ab-time-out" class="ab-time">${initOut.toFixed(2)}s · f${nFrames}</span>
            </div>
            <div class="ab-viewport">
              <canvas id="ab-canvas-out"></canvas>
            </div>
          </div>
        </div>
      `;

      controlsHtml = `
        <div class="transport-bar"
          data-fps="${fps}"
          data-duration="${dur}"
          data-frames="${nFrames}"
          data-init-in="${initIn}"
          data-init-out="${initOut}"
        >
          <div class="transport-scrubber-wrap">
            <div class="transport-loop-highlight" id="transport-loop-highlight" style="left:0%; width:100%;"></div>
            <input
              type="range"
              class="transport-scrubber"
              id="transport-scrubber"
              min="0"
              max="${dur}"
              step="${stepSec}"
              value="${initIn}"
              aria-label="Playhead scrubber"
            />
          </div>
          <div class="transport-row">
            <div class="viewer-controls__group">
              <button type="button" class="btn-small btn-small--primary" id="btn-transport-play" data-tooltip="Play / Pause transport (Space)">⏸ Pause</button>
              <button type="button" class="btn-small" id="btn-jump-in" data-tooltip="Jump playhead to Loop IN point">⏮ IN</button>
              <button type="button" class="btn-small" data-video-step="-1" data-tooltip="Step backward 1 frame (${stepSec}s)">-1f</button>
              <button type="button" class="btn-small" data-video-step="1" data-tooltip="Step forward 1 frame (${stepSec}s)">+1f</button>
              <button type="button" class="btn-small" id="btn-set-in-playhead" data-tooltip="Set Loop IN point to current playhead frame">[ Set IN</button>
              <button type="button" class="btn-small" id="btn-set-out-playhead" data-tooltip="Set Loop OUT point to current playhead frame">Set OUT ]</button>
              <span class="transport-readout" id="transport-readout">
                0.00s / ${dur.toFixed(2)}s · f1/${nFrames} · ${fps}fps${
        isAnim && fMeta.palette ? ` · ${fMeta.palette} colors` : ""
      }${isAnim && delays.length ? ` · ${delays[0]}ms` : ""}
              </span>
            </div>
            <div class="viewer-controls__group">
              <select id="sel-loop-mode" class="sort-select" data-tooltip="Choose how the player loops between IN and OUT">
                <option value="loop" selected>Mode: Loop [IN→OUT]</option>
                <option value="pingpong">Mode: Ping-Pong [IN↔OUT]</option>
                <option value="full">Mode: Full Media</option>
              </select>
              <select id="video-speed-select" class="sort-select" data-tooltip="Playback speed">
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
              ${
                proxyRel && !activeClip && !isAnim
                  ? `<button type="button" class="btn-small" id="btn-toggle-proxy" data-media-src="${escapeHtml(
                      resolveAssetUrl(mediaRel)
                    )}" data-proxy-src="${escapeHtml(
                      resolveAssetUrl(proxyRel)
                    )}" data-tooltip="Preview the 768px / 15fps CV perception proxy instead of full-resolution media">Proxy (768p/15fps)</button>`
                  : ""
              }
              ${
                isAnim && origRel
                  ? `<button type="button" class="btn-small" id="btn-toggle-native-gif" data-tooltip="Toggle raw <img> GIF rendering vs frame-accurate video transport">Raw GIF</button>`
                  : ""
              }
              ${
                isAnim && files.sheet
                  ? `<a class="btn-small" href="${escapeHtml(
                      resolveAssetUrl(`items/${item.id}/${files.sheet.path}`)
                    )}" target="_blank" data-tooltip="Open full contact sheet of all GIF frames">Sheet (${files.sheet.cols}×${files.sheet.rows})</a>`
                  : ""
              }
              ${
                isAnim && files.frames
                  ? `<a class="btn-small" href="${escapeHtml(
                      resolveAssetUrl(`items/${item.id}/${files.frames.path}`)
                    )}" download="${escapeHtml(item.id)}_frames.zip" data-tooltip="Download individual PNG frames + timing manifest">frames.zip</a>`
                  : ""
              }
              ${
                activeClip
                  ? `<a class="btn-small" href="#/${escapeHtml(
                      item.id
                    )}">Full Work (${formatDuration(files.media && files.media.duration)})</a>`
                  : ""
              }
            </div>
          </div>
        </div>

        <!-- Built-in Seamless Loop & Clip Creator (ported from ~/dev/slopscore) -->
        <div class="loop-creator-panel">
          <div class="loop-panel-top">
            <div class="viewer-controls__group">
              <span class="loop-panel-title">Seamless Loop &amp; Clip Creator</span>
              <span
                id="loop-diff-badge"
                class="badge-seamless"
                data-tooltip="Visual similarity between Loop IN frame and Loop OUT frame (100% = identical, >95% = seamless cut, >90% = good match)."
              >Match: —</span>
            </div>
            <div class="transport-readout" id="loop-time-readout">
              IN: ${initIn.toFixed(2)}s (f1) | OUT: ${initOut.toFixed(2)}s (f${nFrames}) | DUR: ${(
        initOut - initIn
      ).toFixed(2)}s
            </div>
          </div>

          <div class="loop-sliders-row">
            <div class="slider-group">
              <label for="rng-loop-in">
                <span>LOOP START (IN)</span>
                <span id="lbl-loop-in">${initIn.toFixed(2)}s · Frame 1</span>
              </label>
              <input
                type="range"
                id="rng-loop-in"
                min="0"
                max="${dur}"
                step="${stepSec}"
                value="${initIn}"
              />
            </div>
            <div class="slider-group slider-group--out">
              <label for="rng-loop-out">
                <span>LOOP END (OUT)</span>
                <span id="lbl-loop-out">${initOut.toFixed(2)}s · Frame ${nFrames}</span>
              </label>
              <input
                type="range"
                id="rng-loop-out"
                min="0"
                max="${dur}"
                step="${stepSec}"
                value="${initOut}"
              />
            </div>
          </div>

          <div class="loop-actions-row">
            <button
              type="button"
              class="btn-small btn-gold"
              id="btn-automatch-loop"
              data-tooltip="Scan candidate frames around IN and OUT to automatically snap to the lowest-MSE seamless loop point."
            >⚡ Automatch Loop</button>
            <button
              type="button"
              class="btn-small"
              id="btn-view-mode-toggle"
              data-tooltip="Show Loop IN frame and matching Loop OUT frame side-by-side to inspect the loop seam."
            >Compare IN / OUT Frames</button>
            <button
              type="button"
              class="btn-small"
              id="btn-ab-flip"
              hidden
              data-tooltip="Rapidly alternate between Frame A (IN) and Frame B (OUT) every 350ms to spot jump cuts."
            >⇄ A/B Flip</button>
            <button
              type="button"
              class="btn-small"
              id="btn-ab-onion"
              hidden
              data-tooltip="Superimpose Frame A (IN) and Frame B (OUT) at 50% opacity on Frame B to align subject posture."
            >◐ Onion-Skin Blend</button>
            <div style="flex:1;"></div>
            <button
              type="button"
              class="btn-small btn-small--primary"
              id="btn-copy-loop-url"
              data-tooltip="Copy the direct CORS-enabled source URL with #t=IN,OUT loop timestamps (and update class code snippets below)."
            >Copy Loop URL (#t=in,out)</button>
            <button
              type="button"
              class="btn-small"
              id="btn-export-loop-clip"
              data-tooltip="Record and download the selected [IN → OUT] loop segment as a standalone .webm video clip in your browser."
            >Export Clip (.webm)</button>
            <button
              type="button"
              class="btn-small"
              id="btn-copy-ffmpeg-clip"
              data-tooltip="Copy an exact ffmpeg command to cut this [IN → OUT] segment losslessly from the local repository file."
            >Copy ffmpeg Cut</button>
          </div>
        </div>
      `;
    } else if (item.kind === "image") {
      const imgSrc = resolveAssetUrl(mediaRel);
      viewerHtml = `
        <div class="viewer-stage viewer-stage--checker" id="image-zoom-stage" style="cursor: zoom-in;">
          <img id="detail-image" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(
        item.title
      )}" style="transition: transform 0.15s ease;" />
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <div class="viewer-controls__group">
            <button type="button" class="btn-small" data-zoom="1">100%</button>
            <button type="button" class="btn-small" data-zoom="2">200%</button>
            <button type="button" class="btn-small" data-zoom="3">300%</button>
          </div>
          <span>${(files.media && files.media.width) || "—"} × ${
        (files.media && files.media.height) || "—"
      } px</span>
        </div>
      `;
    } else if (item.kind === "audio") {
      const audSrc = resolveAssetUrl(mediaRel);
      viewerHtml = `
        <div class="viewer-stage" style="flex-direction: column; gap: 1rem; padding: 1.5rem;">
          <img src="${escapeHtml(resolveAssetUrl(posterRel))}" alt="Waveform" style="max-height: 240px; width: 100%; object-fit: contain;" />
          <audio src="${escapeHtml(audSrc)}" controls crossorigin="anonymous" style="width: 100%; max-width: 640px;"></audio>
        </div>
      `;
    } else if (item.kind === "model") {
      const glbSrc = resolveAssetUrl(mediaRel);
      viewerHtml = `
        <div class="viewer-stage">
          <model-viewer
            id="detail-model-viewer"
            src="${escapeHtml(glbSrc)}"
            poster="${escapeHtml(resolveAssetUrl(posterRel))}"
            alt="${escapeHtml(item.title)}"
            camera-controls
            auto-rotate
            shadow-intensity="0.8"
          ></model-viewer>
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <span>3D GLB · Drag to orbit, scroll to zoom</span>
          <span>${item.triangles ? `${item.triangles.toLocaleString()} triangles` : ""}</span>
        </div>
      `;
    } else if (item.kind === "splat") {
      const splatSrc = resolveAssetUrl(mediaRel);
      viewerHtml = `
        <div class="viewer-stage" style="flex-direction: column;">
          <canvas id="splat-canvas" width="840" height="520" data-splat-url="${escapeHtml(
            splatSrc
          )}" style="width:100%; height:520px; cursor: grab;"></canvas>
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <span>Interactive 3D Gaussian Splat Viewer (.spz) · Drag to orbit, wheel to zoom</span>
          <span id="splat-status">${
            item.splats ? `${Number(item.splats).toLocaleString()} splats` : "Loading splats…"
          }</span>
        </div>
      `;
    } else if (item.kind === "vector") {
      const svgSrc = resolveAssetUrl(mediaRel);
      viewerHtml = `
        <div class="viewer-stage viewer-stage--checker" id="svg-stage" style="padding: 2rem;">
          <img src="${escapeHtml(svgSrc)}" alt="${escapeHtml(item.title)}" style="max-height: 420px; width: auto;" />
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <div class="viewer-controls__group">
            <button type="button" class="btn-small" data-svg-bg="checker">Checker</button>
            <button type="button" class="btn-small" data-svg-bg="dark">Dark</button>
            <button type="button" class="btn-small" data-svg-bg="light">Light</button>
          </div>
          <span>Sanitized SVG Vector</span>
        </div>
      `;
    } else if (item.kind === "text") {
      viewerHtml = `
        <div class="viewer-stage" style="align-items: flex-start; justify-content: flex-start; padding: 1.5rem; overflow-y: auto;">
          <pre id="text-viewer-content" style="white-space: pre-wrap; font-size: 0.86rem; line-height: 1.55;">Loading text…</pre>
        </div>
      `;
    }

    // Clip timeline & strip on parent item
    const clips = item.clips || [];
    const totalDur = Number((files.media && files.media.duration) || 10);
    const clipsHtml =
      clips.length > 0
        ? `
      <div class="clips-panel">
        <div class="clips-panel__title">Clips (${clips.length} searchable segments)</div>
        <div class="clip-timeline">
          ${clips
            .map((c) => {
              const leftPct = Math.min(100, Math.max(0, (c.in / totalDur) * 100)).toFixed(1);
              const widthPct = Math.max(2, ((c.out - c.in) / totalDur) * 100).toFixed(1);
              const isAct = activeClip && activeClip.n === c.n ? "is-active" : "";
              return `<a href="#/${escapeHtml(item.id)}/${String(c.n).padStart(
                2,
                "0"
              )}" class="clip-timeline__seg ${isAct}" style="left:${leftPct}%; width:${widthPct}%;" title="${escapeHtml(
                c.title
              )} (${c.in}s–${c.out}s)"></a>`;
            })
            .join("")}
        </div>
        <div class="clip-strip">
          ${clips
            .map((c) => {
              const nn = String(c.n).padStart(2, "0");
              const cThumb = resolveAssetUrl(c.thumb ? `items/${item.id}/${c.thumb}` : posterRel);
              const isAct = activeClip && activeClip.n === c.n ? "is-active" : "";
              return `
              <a href="#/${escapeHtml(item.id)}/${nn}" class="clip-card ${isAct}">
                <img src="${escapeHtml(cThumb)}" alt="${escapeHtml(c.title)}" loading="lazy" />
                <div class="clip-card__info">
                  <div><strong>${nn}. ${escapeHtml(c.title)}</strong></div>
                  <div class="clip-card__time">${c.in.toFixed(1)}s – ${c.out.toFixed(1)}s</div>
                </div>
              </a>
            `;
            })
            .join("")}
        </div>
      </div>
    `
        : "";

    // Bidirectional derived_from / derivatives links
    let lineageHtml = "";
    if (item.derived_from) {
      lineageHtml += `<p class="detail-description">Derived from film: <a href="#/${escapeHtml(
        item.derived_from
      )}" style="text-decoration:underline;">${escapeHtml(item.derived_from)}</a></p>`;
    }
    if (catEntry.derivatives && catEntry.derivatives.length > 0) {
      lineageHtml += `<p class="detail-description">GIFs / items derived from this work: ${catEntry.derivatives
        .map(
          (d) =>
            `<a href="#/${escapeHtml(d.id)}" style="text-decoration:underline;">${escapeHtml(
              d.title
            )}</a>`
        )
        .join(", ")}</p>`;
    }

    const snippets = buildStudentSnippets(item, catEntry, activeClip);
    const creatorsStr =
      (item.creators || []).map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join(", ") || "—";

    const downloadFilename = activeClip
      ? `${item.id}_${String(activeClip.n).padStart(2, "0")}_${activeClip.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}.webm`
      : `${item.id}_${(files.media && files.media.path) || "media"}`;

    const streamFileLabel =
      item.kind === "animation" && origRel && !activeClip
        ? files.original.path
        : (files.media && files.media.path) || "media";
    const proxyFileLabel = (files.proxy && files.proxy.path) || "proxy.webm";

    els.detailRoot.innerHTML = `
      <div class="detail-topbar">
        <a href="#/" class="btn-small">← Back to Gallery</a>
        <div class="copy-grid">
          <span class="card-badge">${escapeHtml(item.kind)}</span>
          <span class="card-badge">${escapeHtml(item.status)}</span>
          <a href="${escapeHtml(resolveAssetUrl(`items/${item.id}/item.json`))}" target="_blank" class="btn-small">item.json</a>
        </div>
      </div>

      <div class="detail-layout">
        <div class="detail-left">
          <div class="viewer-frame">
            ${viewerHtml}
            ${controlsHtml}
          </div>
          ${clipsHtml}
        </div>

        <div class="detail-meta">
          <div>
            <p class="eyebrow">${escapeHtml((item.collections || []).join(" · ") || item.kind)} · ${escapeHtml(
      item.id
    )}</p>
            <h1 class="detail-title">${escapeHtml(displayTitle)}</h1>
            <p class="detail-summary">${escapeHtml(displaySummary)}</p>
          </div>

          ${item.description ? `<div class="detail-description">${escapeHtml(item.description)}</div>` : ""}
          ${lineageHtml}

          <!-- Credit & Quick Copy Box -->
          <div class="credit-box">
            <div class="credit-box__header">
              <span class="eyebrow">Required Credit &amp; Stream URLs</span>
              <div class="viewer-controls__group">
                <span
                  class="info-pill"
                  tabindex="0"
                  data-tooltip="Why is Stream URL highlighted? Stream URL is the primary full-fidelity asset (${escapeHtml(
                    streamFileLabel
                  )}) recommended for display, p5.js/Three.js rendering, and Genereti 2D stream. Proxy URL (${escapeHtml(
      proxyFileLabel
    )}) is a downscaled 768px / 15fps WebM built specifically for fast computer-vision & ML inference (MediaPipe, optical flow)."
                >Stream vs Proxy? ⓘ</span>
                <span class="card-badge card-badge--pd">${escapeHtml(
                  (item.rights && item.rights.license) || (item.rights && item.rights.status) || "unknown"
                )}</span>
              </div>
            </div>
            <p class="credit-box__text">${escapeHtml((item.rights && item.rights.credit) || "Credit pending")}</p>
            <div class="copy-grid" style="margin-top: 0.65rem;">
              <button
                type="button"
                class="btn-small btn-small--primary"
                data-copy-text="${escapeHtml(streamUrl)}"
                data-copy-label="Stream URL"
                data-tooltip="Primary Stream URL (Highlighted Default — ${escapeHtml(
                  streamFileLabel
                )}): Full-resolution, native-framerate delivery file. Highlighted because you should use this URL for visual playback, HTML embeds, p5.js / Three.js textures, and Genereti ꘇ 2D stream."
              >Copy Stream URL</button>
              ${
                proxyUrl
                  ? `<button
                      type="button"
                      class="btn-small"
                      data-copy-text="${escapeHtml(proxyUrl)}"
                      data-copy-label="Proxy URL"
                      data-tooltip="CV / Perception Proxy URL (${escapeHtml(
                        proxyFileLabel
                      )} — 768px max edge, 15 fps VP9 WebM, no audio): Lightweight derivative normalized for real-time computer vision (MediaPipe pose/hand tracking, optical flow, frame differencing) where fast decoding and small bandwidth beat full visual resolution."
                    >Copy Proxy URL</button>`
                  : ""
              }
              <button
                type="button"
                class="btn-small"
                data-copy-text="${escapeHtml((item.rights && item.rights.credit) || "")}"
                data-copy-label="Credit line"
                data-tooltip="Copy the required attribution credit line for your code comments or caption."
              >Copy Credit</button>
              <a
                class="btn-small"
                href="${escapeHtml(resolveAssetUrl(activeMediaRel))}"
                download="${escapeHtml(downloadFilename)}"
                data-tooltip="Download the media file (${escapeHtml(downloadFilename)}) to your machine."
              >Download Media</a>
              <button
                type="button"
                class="btn-small"
                id="btn-download-credit-txt"
                data-tooltip="Download a standalone .credit.txt file with title, license, credit, and archive URL."
              >credit.txt</button>
            </div>
          </div>

          <!-- Metadata Facts -->
          <dl class="facts-dl">
            <div>
              <dt>Creators</dt>
              <dd>${escapeHtml(creatorsStr)}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>${escapeHtml(item.date || "—")}${
      item.plate ? ` · Plate ${escapeHtml(item.plate)}` : ""
    }</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>${
                item.source && item.source.url
                  ? `<a href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener">${escapeHtml(
                      item.source.archive || item.source.url
                    )} ↗</a>`
                  : "—"
              }</dd>
            </div>
            <div>
              <dt>Holding / Origin</dt>
              <dd>${
                item.source && item.source.origin
                  ? `<a href="${escapeHtml(item.source.origin)}" target="_blank" rel="noopener">${escapeHtml(
                      item.source.origin
                    )} ↗</a>`
                  : escapeHtml((item.source && item.source.archive) || "—")
              }</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.25rem;">
                ${displayTags
                  .map(
                    (t) =>
                      `<a href="#/" class="tag-mini" data-jump-tag="${escapeHtml(t)}">${escapeHtml(t)}</a>`
                  )
                  .join("")}
              </dd>
            </div>
            <div>
              <dt>Class Demos</dt>
              <dd style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.25rem;">
                ${
                  displayDemos.length
                    ? displayDemos
                        .map(
                          (d) =>
                            `<a href="#/" class="tag-mini" data-jump-demo="${escapeHtml(d)}">${escapeHtml(
                              d
                            )}</a>`
                        )
                        .join("")
                    : "—"
                }
              </dd>
            </div>
          </dl>

          <!-- Student "Use This" Panel -->
          <div class="panel-box">
            <div class="panel-box__title">Use This in Class (CORS-Ready Snippets with Attribution)</div>
            <div class="snippet-tabs">
              <button type="button" class="chip chip--small is-active" data-snippet-tab="p5">p5.js</button>
              <button type="button" class="chip chip--small" data-snippet-tab="html">HTML</button>
              <button type="button" class="chip chip--small" data-snippet-tab="three">Three.js</button>
              <button type="button" class="chip chip--small" data-snippet-tab="genereti">ꘇ 2D stream</button>
              <button type="button" class="chip chip--small" data-snippet-tab="credits">Credits</button>
              <button type="button" class="btn-small" id="btn-download-comfy-json" hidden style="margin-left:auto;">Download .json</button>
              <button type="button" class="btn-small" id="btn-copy-snippet" style="margin-left:auto;">Copy Snippet</button>
            </div>
            <pre class="snippet-pre" id="snippet-code">${escapeHtml(snippets.p5)}</pre>
          </div>

          <!-- Files Table -->
          <div class="panel-box">
            <div class="panel-box__title">Files &amp; Derivatives</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>File</th>
                  <th>Details</th>
                  <th>Size</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(files)
                  .map(([role, fobj]) => {
                    if (!fobj || typeof fobj !== "object") return "";
                    const isKept = fobj.kept !== false;
                    const href = isKept
                      ? resolveAssetUrl(`items/${item.id}/${fobj.path}`)
                      : fobj.url || "";
                    const dims =
                      fobj.width && fobj.height ? `${fobj.width}×${fobj.height}` : "";
                    const dur = fobj.duration ? ` ${fobj.duration}s` : "";
                    return `
                    <tr>
                      <td>${escapeHtml(role)}</td>
                      <td>${
                        href
                          ? `<a href="${escapeHtml(href)}" download style="text-decoration:underline;">${escapeHtml(
                              fobj.path || "external"
                            )}</a>`
                          : `${escapeHtml(fobj.path || "—")} (source-only)`
                      }</td>
                      <td>${escapeHtml((dims + dur).trim() || fobj.type || "—")}</td>
                      <td>${formatBytes(fobj.bytes)}</td>
                      <td><code>${escapeHtml((fobj.sha256 || "").slice(0, 10))}…</code></td>
                    </tr>
                  `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>

          <!-- Provenance Table -->
          <div class="panel-box">
            <div class="panel-box__title">Provenance &amp; Derivation Chain</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Tool / Source</th>
                  <th>Parameters</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${(item.provenance || [])
                  .map(
                    (p) => `
                  <tr>
                    <td>${escapeHtml(p.step)}</td>
                    <td>${escapeHtml(p.tool || p.from || "—")}</td>
                    <td><code>${escapeHtml(p.args || p.model || (p.sha256 ? p.sha256.slice(0, 12) : ""))}</code></td>
                    <td>${escapeHtml(p.date || "—")}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindDetailInteractions(item, snippets, activeClip, catEntry);
  }

  function bindDetailInteractions(item, initialSnippets, activeClip, catEntry) {
    let snippets = initialSnippets;

    // Copy buttons
    els.detailRoot.querySelectorAll("[data-copy-text]").forEach((btn) => {
      btn.addEventListener("click", () => {
        copyText(btn.getAttribute("data-copy-text"), btn.getAttribute("data-copy-label"));
      });
    });

    // Download credit.txt
    const btnCreditTxt = document.getElementById("btn-download-credit-txt");
    if (btnCreditTxt) {
      btnCreditTxt.addEventListener("click", () => {
        const srcUrl = (item.source && (item.source.url || item.source.origin)) || "";
        const txt = [
          `Title: ${item.title}`,
          `ID: ${item.id}`,
          `Date: ${item.date || "unknown"}`,
          `License: ${(item.rights && item.rights.license) || (item.rights && item.rights.status) || ""}`,
          `Credit: ${(item.rights && item.rights.credit) || ""}`,
          `Source: ${srcUrl}`,
        ].join("\n");
        downloadTextFile(`${item.id}.credit.txt`, txt + "\n");
      });
    }

    // Snippet tabs
    let currentSnippetKey = "p5";
    const snippetPre = document.getElementById("snippet-code");
    const btnCopySnippet = document.getElementById("btn-copy-snippet");
    const btnDownloadComfy = document.getElementById("btn-download-comfy-json");
    els.detailRoot.querySelectorAll("[data-snippet-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        els.detailRoot.querySelectorAll("[data-snippet-tab]").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        currentSnippetKey = tab.getAttribute("data-snippet-tab");
        if (snippetPre) snippetPre.textContent = snippets[currentSnippetKey] || "";
        if (btnDownloadComfy) {
          btnDownloadComfy.hidden = currentSnippetKey !== "genereti";
        }
        if (btnCopySnippet) {
          btnCopySnippet.textContent =
            currentSnippetKey === "genereti" ? "Copy Node for ComfyUI" : "Copy Snippet";
          btnCopySnippet.style.marginLeft = currentSnippetKey === "genereti" ? "0" : "auto";
        }
      });
    });
    if (btnCopySnippet) {
      btnCopySnippet.addEventListener("click", () => {
        copyText(
          snippets[currentSnippetKey] || "",
          currentSnippetKey === "genereti" ? "ꘇ 2D stream node" : `${currentSnippetKey} snippet`,
          currentSnippetKey === "genereti" ? snippets.generetiClipboard : null
        );
      });
    }
    if (btnDownloadComfy) {
      btnDownloadComfy.addEventListener("click", () => {
        downloadTextFile(`${item.id}.comfy.json`, (snippets.genereti || "") + "\n");
      });
    }

    // Unified Transport + Seamless Loop & Clip Creator (for video and animation items)
    const videoEl = document.getElementById("detail-video");
    const transportBar = els.detailRoot.querySelector(".transport-bar");
    if (videoEl && transportBar) {
      const fMeta = (item.files && item.files.media) || {};
      const fps = Number(transportBar.getAttribute("data-fps") || fMeta.fps || 15);
      let totalDur = Number(transportBar.getAttribute("data-duration") || fMeta.duration || 4);
      let nFrames = Number(
        transportBar.getAttribute("data-frames") || Math.max(1, Math.round(totalDur * fps))
      );
      const delays = fMeta.frame_delays_ms || [];
      let loopIn = Number(transportBar.getAttribute("data-init-in") || 0);
      let loopOut = Number(transportBar.getAttribute("data-init-out") || totalDur);
      let loopMode = "loop"; // "loop" | "pingpong" | "full"
      let pingPongDir = 1;
      let compareMode = false;
      let onionSkinMode = false;
      let abFlipTimer = null;
      let abFlipState = false;

      const scrubber = document.getElementById("transport-scrubber");
      const loopHighlight = document.getElementById("transport-loop-highlight");
      const btnPlay = document.getElementById("btn-transport-play");
      const btnJumpIn = document.getElementById("btn-jump-in");
      const btnSetIn = document.getElementById("btn-set-in-playhead");
      const btnSetOut = document.getElementById("btn-set-out-playhead");
      const transportReadout = document.getElementById("transport-readout");
      const selLoopMode = document.getElementById("sel-loop-mode");
      const speedSel = document.getElementById("video-speed-select");
      const btnProxy = document.getElementById("btn-toggle-proxy");
      const btnNativeGif = document.getElementById("btn-toggle-native-gif");
      const gifImg = document.getElementById("anim-gif-img");

      const rngIn = document.getElementById("rng-loop-in");
      const rngOut = document.getElementById("rng-loop-out");
      const lblIn = document.getElementById("lbl-loop-in");
      const lblOut = document.getElementById("lbl-loop-out");
      const loopTimeReadout = document.getElementById("loop-time-readout");
      const loopDiffBadge = document.getElementById("loop-diff-badge");
      const btnAutomatch = document.getElementById("btn-automatch-loop");
      const btnViewMode = document.getElementById("btn-view-mode-toggle");
      const btnAbFlip = document.getElementById("btn-ab-flip");
      const btnAbOnion = document.getElementById("btn-ab-onion");
      const btnCopyLoopUrl = document.getElementById("btn-copy-loop-url");
      const btnExportClip = document.getElementById("btn-export-loop-clip");
      const btnCopyFfmpeg = document.getElementById("btn-copy-ffmpeg-clip");

      const singleWrapper = document.getElementById("single-player-wrapper");
      const abWrapper = document.getElementById("ab-compare-wrapper");
      const canvasIn = document.getElementById("ab-canvas-in");
      const canvasOut = document.getElementById("ab-canvas-out");
      const abTimeIn = document.getElementById("ab-time-in");
      const abTimeOut = document.getElementById("ab-time-out");
      const abLabelOut = document.getElementById("ab-label-out");
      const offscreenOut = document.createElement("canvas");

      const timeToFrame = (t) =>
        Math.min(nFrames, Math.max(1, Math.round(t * fps) + 1));

      function updatePlayButton() {
        if (!btnPlay) return;
        btnPlay.textContent = videoEl.paused ? "▶ Play" : "⏸ Pause";
      }

      function updateTransportReadout() {
        const cur = videoEl.currentTime || 0;
        const fIdx = timeToFrame(cur);
        if (scrubber && document.activeElement !== scrubber) {
          scrubber.value = String(cur);
        }
        if (transportReadout) {
          const delayMs = delays[fIdx - 1] || delays[0];
          transportReadout.textContent = `${cur.toFixed(2)}s / ${totalDur.toFixed(
            2
          )}s · f${fIdx}/${nFrames} · ${fps}fps${
            fMeta.palette ? ` · ${fMeta.palette} colors` : ""
          }${delayMs ? ` · ${delayMs}ms` : ""}`;
        }
      }

      function updateLoopHighlightAndLabels() {
        const d = Math.max(0.01, totalDur);
        const leftPct = Math.max(0, Math.min(100, (loopIn / d) * 100));
        const widthPct = Math.max(1, Math.min(100 - leftPct, ((loopOut - loopIn) / d) * 100));
        if (loopHighlight) {
          loopHighlight.style.left = `${leftPct.toFixed(2)}%`;
          loopHighlight.style.width = `${widthPct.toFixed(2)}%`;
        }
        const fIn = timeToFrame(loopIn);
        const fOut = timeToFrame(loopOut);
        const durLoop = Math.max(0.01, loopOut - loopIn);
        const fCount = Math.max(1, fOut - fIn + 1);
        if (lblIn) lblIn.textContent = `${loopIn.toFixed(2)}s · Frame ${fIn}`;
        if (lblOut) lblOut.textContent = `${loopOut.toFixed(2)}s · Frame ${fOut}`;
        if (loopTimeReadout) {
          loopTimeReadout.textContent = `IN: ${loopIn.toFixed(2)}s (f${fIn}) | OUT: ${loopOut.toFixed(
            2
          )}s (f${fOut}) | DUR: ${durLoop.toFixed(2)}s (${fCount}f)`;
        }
        if (abTimeIn) abTimeIn.textContent = `${loopIn.toFixed(2)}s · Frame ${fIn}`;
        if (abTimeOut) abTimeOut.textContent = `${loopOut.toFixed(2)}s · Frame ${fOut}`;

        // Keep "Use This in Class" code snippets synchronized with current [IN, OUT] loop
        snippets = buildStudentSnippets(item, catEntry || {}, activeClip, {
          inSec: loopIn,
          outSec: loopOut,
          duration: totalDur,
          mode: loopMode,
        });
        if (snippetPre) {
          snippetPre.textContent = snippets[currentSnippetKey] || "";
        }
      }

      function styleMatchBadge(metric, prefix = "Match") {
        if (!loopDiffBadge || !metric) return;
        const matchPct = Number.isFinite(metric.match) ? metric.match : 0;
        const mse = Number.isFinite(metric.mse) ? metric.mse : 0;
        loopDiffBadge.textContent = `${prefix}: ${matchPct.toFixed(1)}% (MSE ${mse.toFixed(4)})`;
        loopDiffBadge.classList.remove("badge-seamless--gold", "badge-seamless--coral");
        if (matchPct <= 90) {
          loopDiffBadge.classList.add("badge-seamless--coral");
        } else if (matchPct <= 95) {
          loopDiffBadge.classList.add("badge-seamless--gold");
        }
      }

      function renderOutOrOnionCanvas() {
        if (!canvasOut || !offscreenOut.width) return;
        canvasOut.width = offscreenOut.width;
        canvasOut.height = offscreenOut.height;
        const ctx = canvasOut.getContext("2d");
        ctx.clearRect(0, 0, canvasOut.width, canvasOut.height);
        if (onionSkinMode && canvasIn && canvasIn.width) {
          ctx.globalAlpha = 1.0;
          ctx.drawImage(canvasIn, 0, 0, canvasOut.width, canvasOut.height);
          ctx.globalAlpha = 0.5;
          ctx.drawImage(offscreenOut, 0, 0, canvasOut.width, canvasOut.height);
          ctx.globalAlpha = 1.0;
          if (abLabelOut) abLabelOut.textContent = "ONION-SKIN (50% IN + 50% OUT)";
        } else {
          ctx.drawImage(offscreenOut, 0, 0, canvasOut.width, canvasOut.height);
          if (abLabelOut) abLabelOut.textContent = "FRAME B (LOOP OUT)";
        }
      }

      let seamUpdateToken = 0;
      async function refreshSeamComparison() {
        const token = ++seamUpdateToken;
        const src = videoEl.currentSrc || videoEl.src;
        if (!src) return;
        await grabVideoFrame(src, loopIn, canvasIn);
        if (token !== seamUpdateToken) return;
        await grabVideoFrame(src, loopOut, offscreenOut);
        if (token !== seamUpdateToken) return;
        renderOutOrOnionCanvas();
        const metric = compareCanvases(canvasIn, offscreenOut);
        styleMatchBadge(metric);
      }

      videoEl.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
          totalDur = videoEl.duration;
          nFrames = Number(fMeta.frames || Math.max(1, Math.round(totalDur * fps)));
          if (scrubber) scrubber.max = String(totalDur);
          if (rngIn) rngIn.max = String(totalDur);
          if (rngOut) {
            rngOut.max = String(totalDur);
            if (loopOut > totalDur || loopOut <= 0) {
              loopOut = totalDur;
              rngOut.value = String(loopOut);
            }
          }
          updateLoopHighlightAndLabels();
          refreshSeamComparison();
        }
      });

      videoEl.addEventListener("play", updatePlayButton);
      videoEl.addEventListener("pause", updatePlayButton);
      videoEl.addEventListener("timeupdate", () => {
        if (loopMode !== "full" && !videoEl.paused) {
          if (loopMode === "loop") {
            if (videoEl.currentTime >= loopOut - 0.015 || videoEl.currentTime < loopIn - 0.05) {
              videoEl.currentTime = loopIn;
            }
          } else if (loopMode === "pingpong") {
            if (videoEl.currentTime >= loopOut - 0.02) {
              pingPongDir = -1;
            } else if (videoEl.currentTime <= loopIn + 0.02) {
              pingPongDir = 1;
            }
          }
        }
        updateTransportReadout();
      });

      // Ping-pong reverse stepping timer when pingpong dir === -1
      const pingPongInterval = setInterval(() => {
        if (!document.body.contains(videoEl)) {
          clearInterval(pingPongInterval);
          return;
        }
        if (loopMode === "pingpong" && !videoEl.paused && pingPongDir === -1) {
          const dt = (1 / Math.max(10, fps)) * (videoEl.playbackRate || 1);
          const nextT = videoEl.currentTime - dt * 2;
          if (nextT <= loopIn) {
            pingPongDir = 1;
            videoEl.currentTime = loopIn;
          } else {
            videoEl.currentTime = nextT;
          }
        }
      }, Math.round(1000 / Math.min(30, Math.max(10, fps))));

      if (btnPlay) {
        btnPlay.addEventListener("click", () => {
          if (gifImg && !gifImg.hidden) {
            gifImg.hidden = true;
            videoEl.hidden = false;
            if (btnNativeGif) btnNativeGif.classList.remove("is-active");
          }
          if (videoEl.paused) {
            if (videoEl.currentTime < loopIn || videoEl.currentTime >= loopOut) {
              videoEl.currentTime = loopIn;
            }
            videoEl.play();
          } else {
            videoEl.pause();
          }
          updatePlayButton();
        });
      }

      if (btnJumpIn) {
        btnJumpIn.addEventListener("click", () => {
          videoEl.currentTime = loopIn;
          updateTransportReadout();
        });
      }

      if (scrubber) {
        scrubber.addEventListener("input", () => {
          videoEl.pause();
          videoEl.currentTime = Number(scrubber.value);
          updateTransportReadout();
        });
      }

      els.detailRoot.querySelectorAll("[data-video-step]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (gifImg && !gifImg.hidden) {
            gifImg.hidden = true;
            videoEl.hidden = false;
            if (btnNativeGif) btnNativeGif.classList.remove("is-active");
          }
          videoEl.pause();
          const dir = Number(btn.getAttribute("data-video-step"));
          const next = Math.max(0, Math.min(totalDur, videoEl.currentTime + dir * (1 / fps)));
          videoEl.currentTime = next;
          updateTransportReadout();
        });
      });

      if (btnSetIn) {
        btnSetIn.addEventListener("click", () => {
          const step = 1 / Math.max(1, fps);
          loopIn = Math.max(0, Math.min(loopOut - step, videoEl.currentTime));
          if (rngIn) rngIn.value = String(loopIn);
          updateLoopHighlightAndLabels();
          refreshSeamComparison();
        });
      }

      if (btnSetOut) {
        btnSetOut.addEventListener("click", () => {
          const step = 1 / Math.max(1, fps);
          loopOut = Math.min(totalDur, Math.max(loopIn + step, videoEl.currentTime));
          if (rngOut) rngOut.value = String(loopOut);
          updateLoopHighlightAndLabels();
          refreshSeamComparison();
        });
      }

      if (selLoopMode) {
        selLoopMode.addEventListener("change", () => {
          loopMode = selLoopMode.value;
          pingPongDir = 1;
          updateLoopHighlightAndLabels();
        });
      }

      if (speedSel) {
        speedSel.addEventListener("change", () => {
          videoEl.playbackRate = Number(speedSel.value);
        });
      }

      if (btnProxy) {
        let usingProxy = false;
        btnProxy.addEventListener("click", () => {
          const t = videoEl.currentTime;
          usingProxy = !usingProxy;
          videoEl.src = usingProxy
            ? btnProxy.getAttribute("data-proxy-src")
            : btnProxy.getAttribute("data-media-src");
          videoEl.currentTime = t;
          videoEl.play();
          btnProxy.classList.toggle("is-active", usingProxy);
          btnProxy.textContent = usingProxy ? "Showing Proxy (768p/15fps)" : "Proxy (768p/15fps)";
        });
      }

      if (btnNativeGif && gifImg) {
        btnNativeGif.addEventListener("click", () => {
          const showGif = gifImg.hidden;
          if (showGif) {
            videoEl.pause();
            videoEl.hidden = true;
            gifImg.hidden = false;
            btnNativeGif.classList.add("is-active");
          } else {
            gifImg.hidden = true;
            videoEl.hidden = false;
            btnNativeGif.classList.remove("is-active");
            videoEl.play();
          }
        });
      }

      // Loop IN / OUT range sliders
      const minStep = 1 / Math.max(1, fps);
      if (rngIn) {
        rngIn.addEventListener("input", () => {
          loopIn = parseFloat(rngIn.value) || 0;
          if (loopOut <= loopIn + minStep) {
            loopOut = Math.min(totalDur, loopIn + minStep);
            if (rngOut) rngOut.value = String(loopOut);
          }
          videoEl.currentTime = loopIn;
          updateLoopHighlightAndLabels();
          refreshSeamComparison();
        });
      }
      if (rngOut) {
        rngOut.addEventListener("input", () => {
          loopOut = parseFloat(rngOut.value) || totalDur;
          if (loopIn >= loopOut - minStep) {
            loopIn = Math.max(0, loopOut - minStep);
            if (rngIn) rngIn.value = String(loopIn);
          }
          videoEl.currentTime = loopOut;
          updateLoopHighlightAndLabels();
          refreshSeamComparison();
        });
      }

      function stopAbFlip() {
        if (abFlipTimer) {
          clearInterval(abFlipTimer);
          abFlipTimer = null;
        }
        const pIn = document.getElementById("ab-pane-in");
        const pOut = document.getElementById("ab-pane-out");
        if (pIn) pIn.style.opacity = "1";
        if (pOut) pOut.style.opacity = "1";
        if (btnAbFlip) btnAbFlip.classList.remove("is-active");
      }

      if (btnViewMode && singleWrapper && abWrapper) {
        btnViewMode.addEventListener("click", () => {
          compareMode = !compareMode;
          singleWrapper.hidden = compareMode;
          abWrapper.hidden = !compareMode;
          btnViewMode.classList.toggle("is-active", compareMode);
          btnViewMode.textContent = compareMode
            ? "← Back to Single Player"
            : "Compare IN / OUT Frames";
          if (btnAbFlip) btnAbFlip.hidden = !compareMode;
          if (btnAbOnion) btnAbOnion.hidden = !compareMode;
          if (compareMode) {
            refreshSeamComparison();
          } else {
            stopAbFlip();
          }
        });
      }

      if (btnAbFlip) {
        btnAbFlip.addEventListener("click", () => {
          if (abFlipTimer) {
            stopAbFlip();
          } else {
            btnAbFlip.classList.add("is-active");
            const pIn = document.getElementById("ab-pane-in");
            const pOut = document.getElementById("ab-pane-out");
            abFlipTimer = setInterval(() => {
              if (!document.body.contains(btnAbFlip)) {
                stopAbFlip();
                return;
              }
              abFlipState = !abFlipState;
              if (pIn) pIn.style.opacity = abFlipState ? "1.0" : "0.22";
              if (pOut) pOut.style.opacity = abFlipState ? "0.22" : "1.0";
            }, 350);
          }
        });
      }

      if (btnAbOnion) {
        btnAbOnion.addEventListener("click", () => {
          onionSkinMode = !onionSkinMode;
          btnAbOnion.classList.toggle("is-active", onionSkinMode);
          renderOutOrOnionCanvas();
        });
      }

      // ⚡ Automatch Loop (ported from ~/dev/slopscore/kit/loop-finder.mjs)
      if (btnAutomatch) {
        btnAutomatch.addEventListener("click", async () => {
          const src = videoEl.currentSrc || videoEl.src;
          if (!src) return;
          btnAutomatch.disabled = true;
          const origText = btnAutomatch.textContent;
          btnAutomatch.textContent = "Scanning frames…";
          if (loopDiffBadge) loopDiffBadge.textContent = "Scanning…";
          try {
            const scanWin = Math.min(Math.max(0.4, totalDur * 0.35), 2.0);
            const step = Math.max(1 / Math.min(30, Math.max(8, fps)), 0.04);
            const minLen = Math.min(0.4, totalDur * 0.25);
            const grab = async (t) => {
              const res = await grabVideoFrame(src, t, null, { width: 64, height: 36 });
              return res.data;
            };
            const best = await autoMatchLoop(grab, {
              inSec: loopIn,
              outSec: loopOut,
              duration: totalDur,
              window: scanWin,
              step,
              minLength: minLen,
              refineIn: true,
              onProgress: (pct, curBest) => {
                if (loopDiffBadge && curBest) {
                  loopDiffBadge.textContent = `Scanning ${Math.round(
                    pct * 100
                  )}% · Best ${curBest.match.toFixed(1)}%`;
                }
              },
            });
            loopIn = best.inSec;
            loopOut = best.outSec;
            if (rngIn) rngIn.value = String(loopIn);
            if (rngOut) rngOut.value = String(loopOut);
            updateLoopHighlightAndLabels();
            await refreshSeamComparison();
            styleMatchBadge(best, "Matched");
            videoEl.currentTime = loopIn;
            showToast(
              `Automatched loop: ${loopIn.toFixed(2)}s → ${loopOut.toFixed(
                2
              )}s (${best.match.toFixed(1)}% match)`
            );
          } finally {
            btnAutomatch.disabled = false;
            btnAutomatch.textContent = origText;
          }
        });
      }

      // Copy Source URL with #t=in,out loop fragment
      if (btnCopyLoopUrl) {
        btnCopyLoopUrl.addEventListener("click", () => {
          const itemFiles = item.files || {};
          const mPath = (itemFiles.media && itemFiles.media.path) || "media.webm";
          const baseRel =
            activeClip && activeClip.file
              ? `items/${item.id}/${activeClip.file}`
              : `items/${item.id}/${mPath}`;
          const loopUrl = `${resolveAbsoluteUrl(baseRel)}#t=${loopIn.toFixed(2)},${loopOut.toFixed(
            2
          )}`;
          copyText(loopUrl, `Loop URL (#t=${loopIn.toFixed(2)},${loopOut.toFixed(2)})`);
        });
      }

      // Copy exact ffmpeg cut command
      if (btnCopyFfmpeg) {
        btnCopyFfmpeg.addEventListener("click", () => {
          const itemFiles = item.files || {};
          const mPath = (itemFiles.media && itemFiles.media.path) || "media.webm";
          const srcFile =
            activeClip && activeClip.file
              ? `items/${item.id}/${activeClip.file}`
              : `items/${item.id}/${mPath}`;
          const outName = `items/${item.id}/clips/loop-${loopIn.toFixed(2)}-${loopOut.toFixed(
            2
          )}.webm`;
          const cmd = `ffmpeg -ss ${loopIn.toFixed(3)} -to ${loopOut.toFixed(
            3
          )} -i ${srcFile} -c:v libvpx-vp9 -crf 30 -b:v 0 -an ${outName}`;
          copyText(cmd, "ffmpeg clip cut command");
        });
      }

      // Export Loop Clip (.webm) directly in the browser via Canvas + MediaRecorder
      if (btnExportClip) {
        btnExportClip.addEventListener("click", async () => {
          if (typeof MediaRecorder === "undefined") {
            showToast("MediaRecorder not supported in this browser; use Copy ffmpeg Cut.");
            return;
          }
          const origLabel = btnExportClip.textContent;
          btnExportClip.disabled = true;
          btnExportClip.textContent = "Recording clip…";
          const wasPaused = videoEl.paused;
          try {
            const recCanvas = document.createElement("canvas");
            recCanvas.width = videoEl.videoWidth || fMeta.width || 640;
            recCanvas.height = videoEl.videoHeight || fMeta.height || 480;
            const recCtx = recCanvas.getContext("2d");
            const stream = recCanvas.captureStream(Math.min(60, Math.max(10, fps)));
            const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
              ? "video/webm;codecs=vp9"
              : "video/webm";
            const recorder = new MediaRecorder(stream, {
              mimeType: mime,
              videoBitsPerSecond: 4_000_000,
            });
            const chunks = [];
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            const prevMode = loopMode;
            loopMode = "full";
            videoEl.pause();
            videoEl.currentTime = loopIn;
            await new Promise((r) => {
              const done = () => {
                videoEl.removeEventListener("seeked", done);
                r();
              };
              videoEl.addEventListener("seeked", done);
              setTimeout(done, 250);
            });

            recorder.start();
            await videoEl.play();

            await new Promise((resolve) => {
              function drawTick() {
                if (videoEl.currentTime >= loopOut || videoEl.paused || videoEl.ended) {
                  resolve();
                  return;
                }
                recCtx.drawImage(videoEl, 0, 0, recCanvas.width, recCanvas.height);
                requestAnimationFrame(drawTick);
              }
              requestAnimationFrame(drawTick);
            });

            videoEl.pause();
            loopMode = prevMode;

            await new Promise((resolve) => {
              recorder.onstop = resolve;
              recorder.stop();
            });

            const blob = new Blob(chunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.id}_loop_${loopIn.toFixed(2)}s-${loopOut.toFixed(2)}s.webm`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            showToast(`Exported loop clip (${(loopOut - loopIn).toFixed(2)}s .webm)`);
          } catch (err) {
            showToast(`Clip export failed: ${err.message || err}`);
          } finally {
            btnExportClip.disabled = false;
            btnExportClip.textContent = origLabel;
            videoEl.currentTime = loopIn;
            if (!wasPaused) videoEl.play();
          }
        });
      }

      updatePlayButton();
      updateLoopHighlightAndLabels();
      refreshSeamComparison();
    }

    // Image zoom controls
    const detailImg = document.getElementById("detail-image");
    if (detailImg) {
      els.detailRoot.querySelectorAll("[data-zoom]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const z = Number(btn.getAttribute("data-zoom"));
          detailImg.style.transform = z === 1 ? "" : `scale(${z})`;
        });
      });
      detailImg.addEventListener("click", () => {
        detailImg.style.transform = detailImg.style.transform ? "" : "scale(2)";
      });
    }

    // SVG background switcher
    const svgStage = document.getElementById("svg-stage");
    if (svgStage) {
      els.detailRoot.querySelectorAll("[data-svg-bg]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.getAttribute("data-svg-bg");
          svgStage.classList.remove("viewer-stage--checker");
          if (mode === "checker") {
            svgStage.style.background = "";
            svgStage.classList.add("viewer-stage--checker");
          } else if (mode === "light") {
            svgStage.style.background = "#f2f1ed";
          } else {
            svgStage.style.background = "#121212";
          }
        });
      });
    }

    // Text viewer loader
    const textPre = document.getElementById("text-viewer-content");
    if (textPre && item.files && item.files.media) {
      fetch(resolveAssetUrl(`items/${item.id}/${item.files.media.path}`))
        .then((r) => r.text())
        .then((txt) => {
          textPre.textContent = txt;
        })
        .catch(() => {
          textPre.textContent = "Could not load text file.";
        });
    }

    // Interactive 3D Gaussian Splat (.spz) viewer
    const splatCanvas = document.getElementById("splat-canvas");
    if (splatCanvas) {
      initSplatViewer(splatCanvas, splatCanvas.getAttribute("data-splat-url"));
    }

    // Jump to tag / demo filter from detail view
    els.detailRoot.querySelectorAll("[data-jump-tag]").forEach((a) => {
      a.addEventListener("click", () => {
        state.activeTags.clear();
        state.activeTags.add(a.getAttribute("data-jump-tag"));
      });
    });
    els.detailRoot.querySelectorAll("[data-jump-demo]").forEach((a) => {
      a.addEventListener("click", () => {
        state.activeDemos.clear();
        state.activeDemos.add(a.getAttribute("data-jump-demo"));
      });
    });
  }

  // Native browser 3D Gaussian Splat (.spz v2) decompression & interactive orbit viewer
  async function initSplatViewer(canvas, url) {
    const statusEl = document.getElementById("splat-status");
    const ctx = canvas.getContext("2d");
    let yaw = 0.32;
    let pitch = -0.22;
    let zoom = 1.0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    try {
      const res = await fetch(url);
      if (!res.ok || typeof DecompressionStream === "undefined") {
        throw new Error("Stream unavailable");
      }
      const ds = new DecompressionStream("gzip");
      const decompressed = res.body.pipeThrough(ds);
      const buf = await new Response(decompressed).arrayBuffer();
      const dv = new DataView(buf);
      const magic = dv.getUint32(0, true);
      if (magic !== 0x5053474e) throw new Error("Unsupported splat header");
      const totalPoints = dv.getUint32(8, true);
      const fracBits = dv.getInt8(13);
      const scaleDiv = 1 << fracBits;

      // Subsample ~35,000 splats for 60fps interactive orbiting in canvas
      const step = Math.max(1, Math.floor(totalPoints / 35000));
      const count = Math.floor(totalPoints / step);
      const px = new Float32Array(count);
      const py = new Float32Array(count);
      const pz = new Float32Array(count);
      const cr = new Uint8Array(count);
      const cg = new Uint8Array(count);
      const cb = new Uint8Array(count);
      const u8 = new Uint8Array(buf);

      const posOffset = 16;
      const alphaOffset = 16 + totalPoints * 9;
      const colorOffset = alphaOffset + totalPoints;

      let k = 0;
      for (let i = 0; i < totalPoints && k < count; i += step) {
        const a = u8[alphaOffset + i];
        if (a < 38) continue;
        const pIdx = posOffset + i * 9;
        let x = u8[pIdx] | (u8[pIdx + 1] << 8) | (u8[pIdx + 2] << 16);
        let y = u8[pIdx + 3] | (u8[pIdx + 4] << 8) | (u8[pIdx + 5] << 16);
        let z = u8[pIdx + 6] | (u8[pIdx + 7] << 8) | (u8[pIdx + 8] << 16);
        if (x >= 0x800000) x -= 0x1000000;
        if (y >= 0x800000) y -= 0x1000000;
        if (z >= 0x800000) z -= 0x1000000;

        px[k] = x / scaleDiv;
        py[k] = y / scaleDiv;
        pz[k] = z / scaleDiv;

        const cIdx = colorOffset + i * 3;
        cr[k] = Math.min(255, Math.max(0, Math.round((((u8[cIdx] / 255 - 0.5) / 0.15) * 0.2821 + 0.5) * 255)));
        cg[k] = Math.min(255, Math.max(0, Math.round((((u8[cIdx + 1] / 255 - 0.5) / 0.15) * 0.2821 + 0.5) * 255)));
        cb[k] = Math.min(255, Math.max(0, Math.round((((u8[cIdx + 2] / 255 - 0.5) / 0.15) * 0.2821 + 0.5) * 255)));
        k++;
      }

      const validCount = k;
      if (statusEl) {
        statusEl.textContent = `${totalPoints.toLocaleString()} splats loaded (interactive orbit ready)`;
      }

      const drawFrame = () => {
        const W = canvas.width;
        const H = canvas.height;
        const imgData = ctx.createImageData(W, H);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 16;
          data[i + 1] = 16;
          data[i + 2] = 16;
          data[i + 3] = 255;
        }

        const cy = Math.cos(yaw);
        const sy = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const scale = Math.min(W, H) * 0.032 * zoom;
        const halfW = W * 0.5;
        const halfH = H * 0.5;

        for (let i = 0; i < validCount; i++) {
          const x = px[i];
          const y = py[i];
          const z = pz[i];
          const rx = x * cy + z * sy;
          const rz = -x * sy + z * cy;
          const ry = y * cp - rz * sp;
          const depth = y * sp + rz * cp + 28;
          if (depth <= 1) continue;

          const sx = Math.round(halfW + (rx * scale * 18) / depth);
          const sy2 = Math.round(halfH - (ry * scale * 18) / depth);
          if (sx < 1 || sx >= W - 2 || sy2 < 1 || sy2 >= H - 2) continue;

          const r = cr[i];
          const g = cg[i];
          const b = cb[i];
          for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
              const p = ((sy2 + dy) * W + (sx + dx)) * 4;
              data[p] = r;
              data[p + 1] = g;
              data[p + 2] = b;
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      };

      drawFrame();

      canvas.addEventListener("pointerdown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        yaw += (e.clientX - lastX) * 0.007;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - lastY) * 0.007));
        lastX = e.clientX;
        lastY = e.clientY;
        requestAnimationFrame(drawFrame);
      });
      canvas.addEventListener("pointerup", () => {
        dragging = false;
      });
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          zoom = Math.max(0.3, Math.min(4.0, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
          requestAnimationFrame(drawFrame);
        },
        { passive: false }
      );
    } catch (_err) {
      if (statusEl) statusEl.textContent = "Preview mode";
    }
  }

  function renderReviewQueue() {
    if (!els.reviewList) return;
    if (state.review.length === 0) {
      els.reviewList.innerHTML = `<p class="muted-copy">No items waiting in draft or review.</p>`;
      return;
    }

    els.reviewList.innerHTML = state.review
      .map((item) => {
        const thumbUrl = resolveAssetUrl(item.thumb || item.poster);
        const missing = [];
        if (!item.source_url) missing.push("source.url");
        if (!item.rights || item.rights.status === "unknown") missing.push("rights.status");
        if (!item.credit) missing.push("rights.credit");

        return `
        <article class="review-card">
          <a href="#/${escapeHtml(item.id)}">
            <img class="review-card__thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          </a>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:0.5rem;">
              <a href="#/${escapeHtml(item.id)}" style="font-weight:600;">${escapeHtml(item.title)}</a>
              <span class="card-badge">${escapeHtml(item.status)}</span>
            </div>
            <p class="muted-copy" style="font-size:0.78rem; margin:0.25rem 0;">${escapeHtml(item.summary)}</p>
            <div style="font-family:var(--mono); font-size:0.7rem; color:var(--muted); margin-top:0.35rem;">
              ${
                missing.length
                  ? `Needs before publish: <code>${escapeHtml(missing.join(", "))}</code>`
                  : "Ready to publish (`python3 tools/ingest.py --publish " + escapeHtml(item.id) + "`)"
              }
            </div>
            ${
              item.notes
                ? `<div style="font-size:0.74rem; color:var(--copy); margin-top:0.25rem;">Note: ${escapeHtml(
                    item.notes
                  )}</div>`
                : ""
            }
          </div>
        </article>
      `;
      })
      .join("");
  }

  // Batch ZIP download with CREDITS.md and item JSON
  async function downloadSelectionZip() {
    const entries = getFilteredEntries();
    const picked =
      state.selectedIds.size > 0
        ? state.catalog.filter((e) => state.selectedIds.has(e.id))
        : entries.slice(0, 8);

    if (picked.length === 0) {
      showToast("No items to bundle");
      return;
    }

    showToast(`Bundling ${picked.length} item(s) + CREDITS.md…`);
    const encoder = new TextEncoder();
    const zipFiles = [];
    const creditsLines = [
      "# Mediathèque — Credits & Attribution",
      "",
      `Generated on ${new Date().toISOString().slice(0, 10)}.`,
      "",
    ];

    for (const entry of picked) {
      const parentId = entry.parent || entry.id;
      const fullItem = await fetchFullItem(parentId);
      if (fullItem) {
        zipFiles.push({
          name: `${parentId}/item.json`,
          data: encoder.encode(JSON.stringify(fullItem, null, 2)),
        });
      }

      // Fetch primary media or proxy if small enough (<15 MB) for browser zip
      const targetRel = ( entry.proxy || entry.media || "" ).split("#")[0];
      if (targetRel && (!entry.bytes || entry.bytes <= 15 * 1024 * 1024)) {
        try {
          const mRes = await fetch(resolveAssetUrl(targetRel));
          if (mRes.ok) {
            const buf = new Uint8Array(await mRes.arrayBuffer());
            const fname = targetRel.split("/").pop();
            zipFiles.push({
              name: `${parentId}/${fname}`,
              data: buf,
            });
          }
        } catch (_e) {
          // continue
        }
      }

      creditsLines.push(
        `## ${entry.title} (\`${entry.id}\`)`,
        `- **Credit**: ${entry.credit || "See item.json"}`,
        `- **License**: ${(entry.rights && entry.rights.license) || (entry.rights && entry.rights.status) || "unknown"}`,
        `- **Source**: ${entry.source_url || entry.url}`,
        `- **Stream URL**: ${entry.url}`,
        ""
      );
    }

    zipFiles.push({
      name: "CREDITS.md",
      data: encoder.encode(creditsLines.join("\n")),
    });

    const blob = window.MediathequeZip.createZipBlob(zipFiles);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mediatheque-selection-${picked.length}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Downloaded mediatheque-selection-${picked.length}.zip`);
  }

  // Router
  function handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("id");
    const hash = window.location.hash || "#/";

    if (queryId && (!hash || hash === "#/")) {
      showSection("detail");
      renderDetailView(queryId);
      return;
    }

    if (hash === "#/review" || hash === "#review") {
      showSection("review");
      renderReviewQueue();
      return;
    }

    if (hash.startsWith("#/") && hash.length > 2) {
      let targetId = decodeURIComponent(hash.slice(2));
      if (targetId.startsWith("item/")) {
        targetId = targetId.slice(5);
      }
      showSection("detail");
      renderDetailView(targetId);
      return;
    }

    showSection("gallery");
    renderGallery();
  }

  function showSection(which) {
    if (els.viewGallery) els.viewGallery.hidden = which !== "gallery";
    if (els.viewDetail) els.viewDetail.hidden = which !== "detail";
    if (els.viewReview) els.viewReview.hidden = which !== "review";
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Event listeners
  function bindGlobalEvents() {
    window.addEventListener("hashchange", handleRoute);

    if (els.searchInput) {
      els.searchInput.addEventListener("input", () => {
        state.query = els.searchInput.value;
        if (els.viewGallery && els.viewGallery.hidden) {
          window.location.hash = "#/";
        } else {
          renderGallery();
        }
      });
    }

    // Keyboard `/` to focus search, `Escape` to return to grid
    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== els.searchInput) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          e.preventDefault();
          if (els.searchInput) els.searchInput.focus();
        }
      } else if (e.key === "Escape" && window.location.hash && window.location.hash !== "#/") {
        window.location.hash = "#/";
      }
    });

    // Type filter chips (Both / Items / Clips)
    document.querySelectorAll("[data-type-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-type-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.typeFilter = btn.getAttribute("data-type-filter");
        renderGallery();
      });
    });

    // Kind filter chips
    document.querySelectorAll("[data-kind-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-kind-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.kindFilter = btn.getAttribute("data-kind-filter");
        renderGallery();
      });
    });

    // Rights filter chips
    document.querySelectorAll("[data-rights-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-rights-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.rightsFilter = btn.getAttribute("data-rights-filter");
        renderGallery();
      });
    });

    if (els.sortSelect) {
      els.sortSelect.addEventListener("change", () => {
        state.sortBy = els.sortSelect.value;
        renderGallery();
      });
    }

    if (els.btnToggleFacets && els.facetDrawer) {
      els.btnToggleFacets.addEventListener("click", () => {
        const open = !els.facetDrawer.hidden;
        els.facetDrawer.hidden = open;
        els.btnToggleFacets.setAttribute("aria-expanded", String(!open));
      });
    }

    if (els.facetDrawerContent) {
      els.facetDrawerContent.addEventListener("click", (e) => {
        const tagBtn = e.target.closest("[data-tag-chip]");
        if (tagBtn) {
          const t = tagBtn.getAttribute("data-tag-chip");
          if (state.activeTags.has(t)) state.activeTags.delete(t);
          else state.activeTags.add(t);
          renderFacetDrawer();
          renderGallery();
          return;
        }
        const demoBtn = e.target.closest("[data-demo-chip]");
        if (demoBtn) {
          const d = demoBtn.getAttribute("data-demo-chip");
          if (state.activeDemos.has(d)) state.activeDemos.delete(d);
          else state.activeDemos.add(d);
          renderFacetDrawer();
          renderGallery();
        }
      });
    }

    if (els.activeFilters) {
      els.activeFilters.addEventListener("click", (e) => {
        const rmTag = e.target.closest("[data-remove-tag]");
        if (rmTag) {
          state.activeTags.delete(rmTag.getAttribute("data-remove-tag"));
          renderFacetDrawer();
          renderGallery();
          return;
        }
        const rmDemo = e.target.closest("[data-remove-demo]");
        if (rmDemo) {
          state.activeDemos.delete(rmDemo.getAttribute("data-remove-demo"));
          renderFacetDrawer();
          renderGallery();
          return;
        }
        if (e.target.closest("[data-clear-all-facets]")) {
          state.activeTags.clear();
          state.activeDemos.clear();
          renderFacetDrawer();
          renderGallery();
        }
      });
    }

    if (els.mediaGrid) {
      els.mediaGrid.addEventListener("click", (e) => {
        const copyBtn = e.target.closest("[data-copy-url]");
        if (copyBtn) {
          e.preventDefault();
          copyText(copyBtn.getAttribute("data-copy-url"), "Stream URL");
          return;
        }
        const checkbox = e.target.closest("[data-select-id]");
        if (checkbox) {
          e.stopPropagation();
          const id = checkbox.getAttribute("data-select-id");
          if (checkbox.checked) state.selectedIds.add(id);
          else state.selectedIds.delete(id);
          updateSelectionUI();
        }
      });

      // Hover video preview on cards
      els.mediaGrid.addEventListener(
        " pointerenter",
        (e) => {
          const card = e.target.closest(".media-card[data-hover-video]");
          if (!card) return;
          const vUrl = card.getAttribute("data-hover-video");
          if (!vUrl || card.querySelector("video")) return;
          const wrap = card.querySelector(".media-card__thumb-wrap");
          if (!wrap) return;
          const v = document.createElement("video");
          v.className = "media-card__hover-video";
          v.src = vUrl;
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          wrap.prepend(v);
          v.play().catch(() => {});
        },
        true
      );
      els.mediaGrid.addEventListener(
        "pointerleave",
        (e) => {
          const card = e.target.closest(".media-card");
          if (!card) return;
          const v = card.querySelector(".media-card__hover-video");
          if (v) v.remove();
        },
        true
      );
    }

    if (els.btnSelectFiltered) {
      els.btnSelectFiltered.addEventListener("click", () => {
        getFilteredEntries().forEach((e) => state.selectedIds.add(e.id));
        renderGallery();
      });
    }
    if (els.btnClearSelection) {
      els.btnClearSelection.addEventListener("click", () => {
        state.selectedIds.clear();
        renderGallery();
      });
    }
    if (els.btnDownloadZip) {
      els.btnDownloadZip.addEventListener("click", downloadSelectionZip);
    }
  }

  initTheme();
  initHeaderLinks();
  bindGlobalEvents();
  loadData();
})();
