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
                title="Copy stream URL"
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

  // Fetch full item.json for detail view
  async function fetchFullItem(itemId) {
    if (state.itemCache.has(itemId)) return state.itemCache.get(itemId);
    const res = await fetch(resolveAssetUrl(`items/${itemId}/item.json`));
    if (!res.ok) return null;
    const data = await res.json();
    state.itemCache.set(itemId, data);
    return data;
  }

  function buildStudentSnippets(item, entry, activeClip) {
    const title = activeClip ? `${item.title} — ${activeClip.title}` : item.title;
    const credit = (item.rights && item.rights.credit) || "";
    const srcUrl = (item.source && (item.source.url || item.source.origin)) || "";
    const streamRel = activeClip
      ? activeClip.file
        ? `items/${item.id}/${activeClip.file}`
        : `items/${item.id}/${item.files.media.path}#t=${activeClip.in},${activeClip.out}`
      : item.kind === "animation" && item.files.original && item.files.original.kept
      ? `items/${item.id}/${item.files.original.path}`
      : `items/${item.id}/${item.files.media.path}`;
    const streamUrl = resolveAbsoluteUrl(streamRel);
    const videoStreamUrl = resolveAbsoluteUrl(
      activeClip && activeClip.file
        ? `items/${item.id}/${activeClip.file}`
        : `items/${item.id}/${item.files.media.path}`
    );
    const proxyUrl =
      item.files && item.files.proxy
        ? resolveAbsoluteUrl(`items/${item.id}/${item.files.proxy.path}`)
        : videoStreamUrl;

    const commentHeader = `// Source: ${title}\n// Credit: ${credit}\n// Archive: ${srcUrl}\n`;

    let htmlSnippet = `<!--\n  Source: ${title}\n  Credit: ${credit}\n  URL: ${srcUrl}\n-->\n`;
    if (item.kind === "video" || activeClip) {
      htmlSnippet += `<video src="${streamUrl}" crossorigin="anonymous" controls loop muted playsinline></video>`;
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
      p5Snippet += `let vid;\nfunction setup() {\n  createCanvas(768, 576);\n  vid = createVideo("${videoStreamUrl}");\n  vid.elt.crossOrigin = "anonymous";\n  vid.loop();\n  vid.hide();\n}\nfunction draw() {\n  image(vid, 0, 0, width, height);\n}`;
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
      item.kind === "video" || activeClip ? proxyUrl || videoStreamUrl : streamUrl;
    const generetiMediaKind =
      item.kind === "video" || activeClip
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

    if (item.kind === "video" || activeClip) {
      const vSrc = resolveAssetUrl(activeMediaRel);
      viewerHtml = `
        <div class="viewer-stage">
          <video id="detail-video" src="${escapeHtml(vSrc)}" poster="${escapeHtml(
        resolveAssetUrl(posterRel)
      )}" controls loop playsinline crossorigin="anonymous"></video>
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <div class="viewer-controls__group">
            <button type="button" class="btn-small" data-video-step="-1">-1 frame</button>
            <button type="button" class="btn-small" data-video-step="1">+1 frame</button>
            <label>Speed
              <select id="video-speed-select" class="sort-select">
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </label>
          </div>
          <div class="viewer-controls__group">
            ${
              proxyRel && !activeClip
                ? `<button type="button" class="btn-small" id="btn-toggle-proxy" data-media-src="${escapeHtml(
                    resolveAssetUrl(mediaRel)
                  )}" data-proxy-src="${escapeHtml(resolveAssetUrl(proxyRel))}">Switch to Proxy (768p/15fps)</button>`
                : ""
            }
            ${
              activeClip
                ? `<a class="btn-small" href="#/${escapeHtml(
                    item.id
                  )}">View Full Work (${formatDuration(files.media && files.media.duration)})</a>`
                : ""
            }
          </div>
        </div>
      `;
    } else if (item.kind === "animation") {
      const gifSrc = resolveAssetUrl(origRel || mediaRel);
      const mp4Src = resolveAssetUrl(mediaRel);
      const fMeta = files.media || {};
      const delays = fMeta.frame_delays_ms || [];
      viewerHtml = `
        <div class="viewer-stage viewer-stage--checker" id="anim-stage">
          <img id="anim-gif-img" src="${escapeHtml(gifSrc)}" alt="${escapeHtml(item.title)}" />
          <video id="anim-scrubber-video" src="${escapeHtml(mp4Src)}" loop muted playsinline hidden></video>
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <div class="viewer-controls__group">
            <button type="button" class="btn-small is-active" id="btn-mode-gif">Original GIF</button>
            <button type="button" class="btn-small" id="btn-mode-scrub">Video / Frame Scrubber</button>
            <input type="range" id="anim-frame-slider" min="0" max="${Math.max(
              0,
              (fMeta.frames || 1) - 1
            )}" value="0" hidden style="width:140px;" />
            <span id="anim-frame-readout">
              ${fMeta.frames || "—"} frames · ${fMeta.fps || "—"} fps · palette ${
        fMeta.palette || "—"
      } colors${delays.length ? ` · delay ${delays[0]}ms` : ""}
            </span>
          </div>
          <div class="viewer-controls__group">
            ${
              files.sheet
                ? `<a class="btn-small" href="${escapeHtml(
                    resolveAssetUrl(`items/${item.id}/${files.sheet.path}`)
                  )}" target="_blank">Sprite Sheet (${files.sheet.cols}×${files.sheet.rows})</a>`
                : ""
            }
            ${
              files.frames
                ? `<a class="btn-small" href="${escapeHtml(
                    resolveAssetUrl(`items/${item.id}/${files.frames.path}`)
                  )}" download="${escapeHtml(item.id)}_frames.zip">frames.zip</a>`
                : ""
            }
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
              <span class="card-badge card-badge--pd">${escapeHtml(
                (item.rights && item.rights.license) || (item.rights && item.rights.status) || "unknown"
              )}</span>
            </div>
            <p class="credit-box__text">${escapeHtml((item.rights && item.rights.credit) || "Credit pending")}</p>
            <div class="copy-grid" style="margin-top: 0.65rem;">
              <button type="button" class="btn-small btn-small--primary" data-copy-text="${escapeHtml(
                streamUrl
              )}" data-copy-label="Stream URL">Copy Stream URL</button>
              ${
                proxyUrl
                  ? `<button type="button" class="btn-small" data-copy-text="${escapeHtml(
                      proxyUrl
                    )}" data-copy-label="Proxy URL">Copy Proxy URL</button>`
                  : ""
              }
              <button type="button" class="btn-small" data-copy-text="${escapeHtml(
                (item.rights && item.rights.credit) || ""
              )}" data-copy-label="Credit line">Copy Credit</button>
              <a class="btn-small" href="${escapeHtml(
                resolveAssetUrl(activeMediaRel)
              )}" download="${escapeHtml(downloadFilename)}">Download Media</a>
              <button type="button" class="btn-small" id="btn-download-credit-txt">credit.txt</button>
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

    bindDetailInteractions(item, snippets, activeClip);
  }

  function bindDetailInteractions(item, snippets, activeClip) {
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

    // Video controls
    const videoEl = document.getElementById("detail-video");
    if (videoEl) {
      const fps = Number((item.files && item.files.media && item.files.media.fps) || 15);
      els.detailRoot.querySelectorAll("[data-video-step]").forEach((btn) => {
        btn.addEventListener("click", () => {
          videoEl.pause();
          const dir = Number(btn.getAttribute("data-video-step"));
          videoEl.currentTime = Math.max(0, videoEl.currentTime + dir * (1 / fps));
        });
      });
      const speedSel = document.getElementById("video-speed-select");
      if (speedSel) {
        speedSel.addEventListener("change", () => {
          videoEl.playbackRate = Number(speedSel.value);
        });
      }
      const btnProxy = document.getElementById("btn-toggle-proxy");
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
          btnProxy.textContent = usingProxy ? "Switch to Full Media" : "Switch to Proxy (768p/15fps)";
        });
      }
    }

    // Animation GIF / Frame Scrubber toggle
    const gifImg = document.getElementById("anim-gif-img");
    const scrubVid = document.getElementById("anim-scrubber-video");
    const slider = document.getElementById("anim-frame-slider");
    const btnGif = document.getElementById("btn-mode-gif");
    const btnScrub = document.getElementById("btn-mode-scrub");
    const readout = document.getElementById("anim-frame-readout");
    if (gifImg && scrubVid && btnGif && btnScrub) {
      const fMeta = (item.files && item.files.media) || {};
      const nFrames = Number(fMeta.frames || 10);
      const delays = fMeta.frame_delays_ms || [];

      btnGif.addEventListener("click", () => {
        btnGif.classList.add("is-active");
        btnScrub.classList.remove("is-active");
        gifImg.hidden = false;
        scrubVid.hidden = true;
        if (slider) slider.hidden = true;
      });
      btnScrub.addEventListener("click", () => {
        btnScrub.classList.add("is-active");
        btnGif.classList.remove("is-active");
        gifImg.hidden = true;
        scrubVid.hidden = false;
        scrubVid.pause();
        if (slider) slider.hidden = false;
      });
      if (slider) {
        slider.addEventListener("input", () => {
          const idx = Number(slider.value);
          const dur = scrubVid.duration || fMeta.duration || 1;
          scrubVid.pause();
          scrubVid.currentTime = (idx / Math.max(1, nFrames - 1)) * Math.max(0.01, dur - 0.02);
          const delayMs = delays[idx] || delays[0] || Math.round(1000 / (fMeta.fps || 10));
          if (readout) {
            readout.textContent = `Frame ${idx + 1} / ${nFrames} · delay ${delayMs}ms · palette ${
              fMeta.palette || "—"
            }`;
          }
        });
      }
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
      const targetId = decodeURIComponent(hash.slice(2));
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
