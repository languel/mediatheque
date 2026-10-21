(function () {
  "use strict";

  // Determine relative prefix to repository root (handles both /site/index.html and /index.html on Pages)
  const isSubdir = window.location.pathname.includes("/site/");
  const ROOT_PREFIX = isSubdir ? "../" : "./";

  function loadStoredSet(key, fallbackArr = []) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch (_e) {}
    return new Set(fallbackArr);
  }

  function saveStoredSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch (_e) {}
  }

  const savedZen = localStorage.getItem("mediatheque_zen");
  const initialZen = savedZen !== null ? savedZen === "true" : true; // Initial state: Zen mode default

  const savedTypeFilters = loadStoredSet("mediatheque_type_filters", ["item"]); // Default: Items active
  const savedKindFilters = loadStoredSet("mediatheque_kind_filters", ["all"]); // Default: All kinds active
  const savedSelections = loadStoredSet("mediatheque_selected_ids", []);
  const savedShowSelection = localStorage.getItem("mediatheque_show_selection") === "true";
  const savedFullFit = localStorage.getItem("mediatheque_preview_fit") !== "false"; // Default: true (stretch to fit window)

  const state = {
    catalog: [],
    review: [],
    tagsVocab: null,
    query: "",
    typeFilters: savedTypeFilters, // Set of active types: "item", "clip"
    showSelectionOnly: savedShowSelection,
    kindFilters: savedKindFilters, // Set of active kinds: e.g. "video", "animation" or "all"
    rightsFilter: localStorage.getItem("mediatheque_rights_filter") || "all",
    activeTags: new Set(),
    activeDemos: new Set(),
    sortBy: localStorage.getItem("mediatheque_sort_by") || "title",
    selectedIds: savedSelections,
    itemCache: new Map(),
    isZenMode: initialZen,
    previewFullFit: savedFullFit,
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
    btnToggleZen: document.getElementById("btn-toggle-zen"),
    btnOpenAbout: document.getElementById("btn-open-about"),
    aboutDialog: document.getElementById("about-dialog"),
    aboutDialogClose: document.getElementById("about-dialog-close"),
    zenPreviewModal: document.getElementById("zen-preview-modal"),
    zenCarouselRail: document.getElementById("zen-carousel-rail"),
    zenCarouselHome: document.getElementById("zen-carousel-home"),
    zenCarouselPrev: document.getElementById("zen-carousel-prev"),
    zenCarouselNext: document.getElementById("zen-carousel-next"),
    zenCarouselAbout: document.getElementById("zen-carousel-about"),
    zenCarouselZen: document.getElementById("zen-carousel-zen"),
    zenPreviewClose: document.getElementById("zen-preview-close"),
    zenThumbnailViewport: document.getElementById("zen-thumbnail-viewport"),
    zenThumbnailTrack: document.getElementById("zen-thumbnail-track"),
    zenMediaStage: document.getElementById("zen-media-stage"),
    siteHeader: document.querySelector(".site-header"),
    filterSelection: document.getElementById("filter-selection"),
    zenHoverBar: document.getElementById("zen-hover-bar"),
    zenHoverTitle: document.getElementById("zen-hover-title"),
    zenHoverMeta: document.getElementById("zen-hover-meta"),
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
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    if (els.themeToggle) {
      els.themeToggle.addEventListener("click", toggleTheme);
    }
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "light" ? "dark" : "light";
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("mediatheque-theme", next);
  }

  // Zen Mode (purely visual archive browsing)
  function initZenMode() {
    if (state.isZenMode) {
      document.body.classList.add("zen-mode");
      if (els.btnToggleZen) els.btnToggleZen.classList.add("is-active");
      if (els.zenCarouselZen) els.zenCarouselZen.classList.add("is-active");
    }
    if (els.btnToggleZen) {
      els.btnToggleZen.addEventListener("click", toggleZenMode);
    }
    if (els.zenCarouselZen) {
      els.zenCarouselZen.addEventListener("click", toggleZenMode);
    }
  }

  function setZenMode(active) {
    state.isZenMode = Boolean(active);
    document.body.classList.toggle("zen-mode", state.isZenMode);
    if (els.btnToggleZen) {
      els.btnToggleZen.classList.toggle("is-active", state.isZenMode);
      els.btnToggleZen.title = state.isZenMode ? "Exit Zen mode (Alt+Z)" : "Enter Zen visual mode (Alt+Z)";
    }
    if (els.zenCarouselZen) {
      els.zenCarouselZen.classList.toggle("is-active", state.isZenMode);
      els.zenCarouselZen.title = state.isZenMode ? "Exit Zen mode (Alt+Z)" : "Enter Zen visual mode (Alt+Z)";
    }
    localStorage.setItem("mediatheque_zen", state.isZenMode ? "true" : "false");

    const isPreviewOpen = els.zenPreviewModal && !els.zenPreviewModal.hidden;

    if (!state.isZenMode) {
      // Switched to NON-ZEN mode
      if (isPreviewOpen) {
        // Exit zen preview modal to regular detail mode
        const currentId = activeCarouselId;
        closeFullWindowPreview();
        if (currentId) {
          showSection("detail");
          renderDetailView(currentId);
          window.location.hash = "#/" + currentId;
        }
      }
    } else {
      // Switched to ZEN mode
      if (!els.viewDetail.hidden) {
        const hash = window.location.hash || "";
        const targetId = hash.startsWith("#/") ? hash.slice(2) : null;
        if (targetId) openFullWindowPreview(targetId);
      }
    }
  }

  function toggleZenMode() {
    setZenMode(!state.isZenMode);
  }

  // Full-Window Preview & Fit controls (F key)
  function setPreviewFullFit(fit) {
    state.previewFullFit = Boolean(fit);
    localStorage.setItem("mediatheque_preview_fit", state.previewFullFit ? "true" : "false");
    if (els.zenMediaStage) {
      els.zenMediaStage.classList.toggle("is-fit", state.previewFullFit);
    }
  }

  function togglePreviewFullFit() {
    setPreviewFullFit(!state.previewFullFit);
  }

  // Full-Window Preview & Top Carousel (portfolio-example inspired)
  let activeCarouselId = null;
  let activeCardId = null;
  let activeSparkInstance = null;

  function updateHoverBar(id) {
    if (!els.zenHoverBar || !els.zenHoverTitle) return;
    if (!id || (els.zenPreviewModal && !els.zenPreviewModal.hidden)) {
      els.zenHoverBar.classList.remove("is-visible");
      return;
    }
    const entry = (state.catalog && state.catalog.find((e) => e.id === id)) || null;
    if (!entry) {
      els.zenHoverBar.classList.remove("is-visible");
      return;
    }
    els.zenHoverTitle.textContent = entry.title || id;
    if (els.zenHoverMeta) {
      const parts = [];
      if (entry.creator) parts.push(entry.creator);
      if (entry.date) parts.push(entry.date);
      if (entry.kind) parts.push(entry.kind);
      els.zenHoverMeta.textContent = parts.length ? `(${parts.join(" · ")})` : "";
    }
    els.zenHoverBar.classList.add("is-visible");
  }

  function highlightCard(id, scrollIntoView = false) {
    if (!els.mediaGrid) return;
    if (activeCardId === id && !scrollIntoView) return;

    const prev = els.mediaGrid.querySelector(".media-card.is-highlighted");
    if (prev) prev.classList.remove("is-highlighted");

    activeCardId = id;
    updateHoverBar(id);
    if (!id) return;

    const card = els.mediaGrid.querySelector(`.media-card[data-entry-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add("is-highlighted");
      if (scrollIntoView) {
        card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    }
  }

  function openFullWindowPreview(targetId) {
    const entries = getFilteredEntries();
    if (!entries.length) return;
    activeCarouselId = targetId || entries[0].id;
    const currentEntry = entries.find((e) => e.id === activeCarouselId) || entries[0];
    activeCarouselId = currentEntry.id;

    if (window.location.hash !== "#/" + currentEntry.id) {
      history.replaceState(null, "", "#/" + currentEntry.id);
    }

    renderFullWindowMedia(currentEntry);
    renderCarouselTrack(entries, activeCarouselId);

    if (els.zenPreviewModal) {
      els.zenPreviewModal.hidden = false;
      requestAnimationFrame(() => els.zenPreviewModal.classList.add("is-open"));
    }
  }

  function closeFullWindowPreview() {
    if (!els.zenPreviewModal) return;
    if (activeSparkInstance) {
      try {
        activeSparkInstance.dispose();
      } catch (e) {}
      activeSparkInstance = null;
    }
    els.zenPreviewModal.classList.remove("is-open");
    setTimeout(() => {
      els.zenPreviewModal.hidden = true;
      if (els.zenMediaStage) els.zenMediaStage.innerHTML = "";
    }, 200);
  }

  function renderFullWindowMedia(entry) {
    if (!els.zenMediaStage) return;
    if (activeSparkInstance) {
      try {
        activeSparkInstance.dispose();
      } catch (e) {}
      activeSparkInstance = null;
    }
    els.zenMediaStage.classList.toggle("is-fit", state.previewFullFit);
    const mediaUrl = resolveAssetUrl(entry.proxy || entry.media);
    const origUrl = resolveAssetUrl(entry.media);

    if (entry.kind === "video" || entry.kind === "animation") {
      els.zenMediaStage.innerHTML = `
        <video
          id="zen-player-video"
          src="${escapeHtml(mediaUrl)}"
          autoplay
          loop
          playsinline
          controls
        ></video>
      `;
      const vid = document.getElementById("zen-player-video");
      if (vid) vid.play().catch(() => {});
    } else if (entry.kind === "image" || entry.kind === "vector") {
      els.zenMediaStage.innerHTML = `
        <img
          src="${escapeHtml(origUrl || mediaUrl)}"
          alt="${escapeHtml(entry.title)}"
        />
      `;
    } else if (entry.kind === "model") {
      els.zenMediaStage.innerHTML = `
        <model-viewer
          src="${escapeHtml(origUrl)}"
          auto-rotate
          camera-controls
          shadow-intensity="1"
        ></model-viewer>
      `;
    } else if (entry.kind === "splat") {
      els.zenMediaStage.innerHTML = `
        <div id="zen-splat-container" style="width:100vw; height:100vh; position:relative; overflow:hidden;"></div>
      `;
      const container = document.getElementById("zen-splat-container");
      initSparkSplatViewer(container, origUrl || mediaUrl, null);
    } else {
      els.zenMediaStage.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; color:var(--copy);">
          <img src="${escapeHtml(resolveAssetUrl(entry.thumb || entry.poster))}" alt="${escapeHtml(entry.title)}" style="max-height:60vh; max-width:80vw; object-fit:contain; background:transparent;" />
          <h2 style="font-size:1.25rem; margin:0;">${escapeHtml(entry.title)}</h2>
        </div>
      `;
    }
  }

  function renderCarouselTrack(entries, currentId) {
    if (!els.zenThumbnailTrack) return;
    els.zenThumbnailTrack.innerHTML = entries
      .map((entry) => {
        const isSel = entry.id === currentId;
        const thumbUrl = resolveAssetUrl(entry.thumb || entry.poster);
        return `
          <button
            type="button"
            class="project-thumb ${isSel ? "is-selected" : ""}"
            data-carousel-id="${escapeHtml(entry.id)}"
            aria-selected="${isSel ? "true" : "false"}"
            title="${escapeHtml(entry.title)}"
          >
            ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(entry.title)}" loading="lazy" />` : ""}
          </button>
        `;
      })
      .join("");

    els.zenThumbnailTrack.querySelectorAll("[data-carousel-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-carousel-id");
        if (id && id !== activeCarouselId) {
          openFullWindowPreview(id);
        }
      });
    });

    const selThumb = els.zenThumbnailTrack.querySelector('[aria-selected="true"]');
    if (selThumb) {
      selThumb.scrollIntoView({ inline: "center", behavior: "smooth" });
    }
  }

  function navigateCarousel(delta) {
    const entries = getFilteredEntries();
    if (!entries.length) return;
    const currIdx = entries.findIndex((e) => e.id === activeCarouselId);
    let nextIdx = (currIdx === -1 ? 0 : currIdx) + delta;
    if (nextIdx < 0) nextIdx = entries.length - 1;
    if (nextIdx >= entries.length) nextIdx = 0;
    openFullWindowPreview(entries[nextIdx].id);
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

    updateShowChipsUI();
    updateKindChipsUI();
    updateSelectionUI();
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
      // Non-exclusive selection filter
      if (state.showSelectionOnly && !state.selectedIds.has(entry.id)) {
        return false;
      }

      // Non-exclusive type filter (item / clip)
      if (state.typeFilters.size > 0 && !state.typeFilters.has(entry.type)) {
        return false;
      }

      // Non-exclusive kind filter (video, animation, image, audio, model, splat, vector, text)
      if (
        state.kindFilters.size > 0 &&
        !state.kindFilters.has("all") &&
        !state.kindFilters.has(entry.kind)
      ) {
        return false;
      }

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
    if (state.showSelectionOnly) {
      pills.push(
        `<button type="button" class="active-pill" data-remove-selection>selection:${state.selectedIds.size} ×</button>`
      );
    }
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
    if (els.selectionStatus) {
      const count = state.selectedIds.size;
      els.selectionStatus.textContent = `${count} selected`;
      if (els.btnClearSelection) {
        els.btnClearSelection.hidden = count === 0;
      }
    }
    updateShowChipsUI();
  }

  function updateShowChipsUI() {
    document.body.classList.toggle("show-selection-only", Boolean(state.showSelectionOnly));
    document.querySelectorAll("[data-type-filter]").forEach((btn) => {
      const tf = btn.getAttribute("data-type-filter");
      if (tf === "selection") {
        btn.classList.toggle("is-active", Boolean(state.showSelectionOnly));
        btn.textContent = state.selectedIds.size > 0 ? `Selection (${state.selectedIds.size})` : "Selection";
      } else {
        btn.classList.toggle("is-active", state.typeFilters.has(tf));
      }
    });
  }

  function updateKindChipsUI() {
    const isAll = state.kindFilters.has("all") || state.kindFilters.size === 0;
    document.querySelectorAll("[data-kind-filter]").forEach((btn) => {
      const kf = btn.getAttribute("data-kind-filter");
      if (kf === "all") {
        btn.classList.toggle("is-active", isAll);
      } else {
        btn.classList.toggle("is-active", !isAll && state.kindFilters.has(kf));
      }
    });
  }

  function toggleItemSelection(id) {
    if (!id) return;
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    saveStoredSet("mediatheque_selected_ids", state.selectedIds);

    const card = els.mediaGrid ? els.mediaGrid.querySelector(`.media-card[data-entry-id="${CSS.escape(id)}"]`) : null;
    if (card) {
      const isSel = state.selectedIds.has(id);
      card.classList.toggle("is-selected", isSel);
      const cb = card.querySelector(`[data-select-id="${CSS.escape(id)}"]`);
      if (cb) cb.checked = isSel;
    }
    updateSelectionUI();
    if (state.showSelectionOnly) {
      if (state.selectedIds.size === 0) {
        state.showSelectionOnly = false;
        localStorage.setItem("mediatheque_show_selection", "false");
        updateShowChipsUI();
      }
      renderGallery();
    }
  }

  function toggleShowSelectionOnly() {
    if (state.selectedIds.size === 0 && !state.showSelectionOnly) {
      return;
    }
    state.showSelectionOnly = !state.showSelectionOnly;
    localStorage.setItem("mediatheque_show_selection", state.showSelectionOnly ? "true" : "false");
    updateShowChipsUI();
    renderGallery();
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
    updateKindChipsUI();

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
        const isSel = state.selectedIds.has(entry.id);
        const checked = isSel ? "checked" : "";
        const streamUrl = resolveAbsoluteUrl(entry.media);
        const hoverVideo =
          entry.kind === "video"
            ? resolveAssetUrl(entry.proxy || entry.media)
            : entry.kind === "animation" && entry.proxy
            ? resolveAssetUrl(entry.proxy)
            : "";

        return `
        <article class="media-card ${isSel ? "is-selected" : ""} ${activeCardId === entry.id ? "is-highlighted" : ""}" data-entry-id="${escapeHtml(entry.id)}" data-hover-video="${escapeHtml(hoverVideo)}">
          <div class="media-card__thumb-wrap" role="link" tabindex="0" data-href="#/${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.title)}">
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
                ${entry.aspect_ratio ? `<span class="card-badge">${escapeHtml(entry.aspect_ratio)}</span>` : ""}
                ${dur ? `<span class="card-badge">${escapeHtml(dur)}</span>` : ""}
                ${
                  rightsLabel
                    ? `<span class="card-badge ${
                        rightsStatus === "public-domain" ? "card-badge--pd" : ""
                      }">${escapeHtml(rightsLabel)}</span>`
                    : ""
                }
              </div>
              <button
                type="button"
                class="card-select-btn"
                data-select-id="${escapeHtml(entry.id)}"
                aria-label="Select ${escapeHtml(entry.title)}"
                title="Select (Enter)"
              >
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.6" class="select-box-outer" />
                  <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" stroke="none" class="select-box-inner" />
                </svg>
              </button>
            </div>
          </div>
          <div class="media-card__body">
            <div class="media-card__head">
              <span class="media-card__title" role="link" tabindex="0" data-href="#/${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</span>
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

  // Aspect ratio helper
  function computeAspectRatio(w, h) {
    if (!w || !h || isNaN(w) || isNaN(h)) return null;
    const width = Number(w);
    const height = Number(h);
    if (width <= 0 || height <= 0) return null;

    const ratio = width / height;

    function gcd(a, b) {
      return b === 0 ? a : gcd(b, a % b);
    }
    const g = gcd(Math.round(width), Math.round(height));
    const simpW = Math.round(width / g);
    const simpH = Math.round(height / g);

    const standards = [
      { r: 1.0, label: "1:1", name: "Square" },
      { r: 4 / 3, label: "4:3", name: "Classic 4:3" },
      { r: 3 / 4, label: "3:4", name: "Portrait 3:4" },
      { r: 16 / 9, label: "16:9", name: "Widescreen 16:9" },
      { r: 9 / 16, label: "9:16", name: "Vertical 9:16" },
      { r: 3 / 2, label: "3:2", name: "35mm Photo 3:2" },
      { r: 2 / 3, label: "2:3", name: "Portrait 2:3" },
      { r: 5 / 4, label: "5:4", name: "Standard 5:4" },
      { r: 4 / 5, label: "4:5", name: "Social 4:5" },
      { r: 21 / 9, label: "21:9", name: "Ultrawide 21:9" },
      { r: 1.85, label: "1.85:1", name: "Cinema Flat" },
      { r: 2.39, label: "2.39:1", name: "Anamorphic Scope" },
    ];

    let matched = null;
    for (const std of standards) {
      if (Math.abs(ratio - std.r) / std.r <= 0.02) {
        matched = std;
        break;
      }
    }

    const orientation = ratio > 1.05 ? "Landscape" : ratio < 0.95 ? "Portrait" : "Square";
    let ratioStr = "";
    if (matched) {
      ratioStr = matched.label;
    } else if (simpW <= 24 && simpH <= 24) {
      ratioStr = `${simpW}:${simpH}`;
    } else if (ratio >= 1.0) {
      ratioStr = `${+ratio.toFixed(2)}:1`;
    } else {
      ratioStr = `1:${+(1 / ratio).toFixed(2)}`;
    }

    return {
      width,
      height,
      ratio: +ratio.toFixed(4),
      ratioStr,
      orientation,
      display: `${ratioStr} · ${orientation} (${width}×${height})`,
      cssRatio: `${width} / ${height}`,
    };
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

    const fMeta =
      (item.files && (item.files.media || item.files.original || item.files.poster)) || {};
    const origMeta = (item.files && item.files.original) || {};
    const rawW = Number(
      fMeta.width || origMeta.width || (entry && entry.width) || (activeClip && activeClip.width) || 0
    );
    const rawH = Number(
      fMeta.height || origMeta.height || (entry && entry.height) || (activeClip && activeClip.height) || 0
    );
    const ar = computeAspectRatio(rawW, rawH);

    let canvasW = 640;
    let canvasH = 480;
    if (ar) {
      const maxDim = 960;
      if (ar.width <= maxDim && ar.height <= maxDim) {
        canvasW = ar.width;
        canvasH = ar.height;
      } else {
        const scale = maxDim / Math.max(ar.width, ar.height);
        canvasW = Math.round(ar.width * scale);
        canvasH = Math.round(ar.height * scale);
      }
    }

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
      const arStyle = ar ? ` style="max-width: 100%; height: auto; aspect-ratio: ${ar.cssRatio};"` : ` style="max-width: 100%; height: auto;"`;
      htmlSnippet += `<video src="${videoStreamUrl}" width="${canvasW}" height="${canvasH}"${arStyle} crossorigin="anonymous" controls loop muted playsinline></video>`;
    } else if (item.kind === "animation" || item.kind === "image" || item.kind === "vector") {
      const arStyle = ar ? ` style="max-width: 100%; height: auto; aspect-ratio: ${ar.cssRatio};"` : ` style="max-width: 100%; height: auto;"`;
      htmlSnippet += `<img src="${streamUrl}" width="${canvasW}" height="${canvasH}"${arStyle} crossorigin="anonymous" alt="${title}" />`;
    } else if (item.kind === "audio") {
      htmlSnippet += `<audio src="${streamUrl}" crossorigin="anonymous" controls></audio>`;
    } else if (item.kind === "model") {
      htmlSnippet += `<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"><\/script>\n<model-viewer src="${streamUrl}" camera-controls auto-rotate></model-viewer>`;
    } else {
      htmlSnippet += `<a href="${streamUrl}">${title}</a>`;
    }

    let p5Snippet = commentHeader;
    if (item.kind === "video" || item.kind === "animation" || activeClip) {
      const arComment = ar
        ? `// Canvas sized to media aspect ratio: ${ar.ratioStr} (${canvasW}×${canvasH} from ${ar.width}×${ar.height})\n  `
        : "";
      if (hasCustomLoop) {
        const inS = customLoop.inSec.toFixed(2);
        const outS = customLoop.outSec.toFixed(2);
        p5Snippet += `let vid;\nconst LOOP_IN = ${inS}, LOOP_OUT = ${outS};\nfunction setup() {\n  ${arComment}createCanvas(${canvasW}, ${canvasH});\n  vid = createVideo("${videoStreamUrl}");\n  vid.elt.crossOrigin = "anonymous";\n  vid.volume(0);\n  vid.play();\n  vid.hide();\n}\nfunction draw() {\n  if (vid.time() < LOOP_IN || vid.time() >= LOOP_OUT) vid.time(LOOP_IN);\n  image(vid, 0, 0, width, height);\n}`;
      } else {
        p5Snippet += `let vid;\nfunction setup() {\n  ${arComment}createCanvas(${canvasW}, ${canvasH});\n  vid = createVideo("${videoStreamUrl}");\n  vid.elt.crossOrigin = "anonymous";\n  vid.loop();\n  vid.hide();\n}\nfunction draw() {\n  image(vid, 0, 0, width, height);\n}`;
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
      const aspectVal = ar ? ar.ratio : 1.333;
      const planeW = aspectVal >= 1.0 ? 4.0 : +(4.0 * aspectVal).toFixed(3);
      const planeH = aspectVal >= 1.0 ? +(4.0 / aspectVal).toFixed(3) : 4.0;
      threeSnippet += `import * as THREE from "three";\n\nconst video = document.createElement("video");\nvideo.crossOrigin = "anonymous";\nvideo.src = "${videoStreamUrl}";\nvideo.loop = true;\nvideo.muted = true;\nvideo.play();\nconst texture = new THREE.VideoTexture(video);\n\n// Plane geometry matching media aspect ratio (${ar ? ar.display : "4:3"})\nconst geometry = new THREE.PlaneGeometry(${planeW}, ${planeH});\nconst material = new THREE.MeshBasicMaterial({ map: texture });\nconst mesh = new THREE.Mesh(geometry, material);\nscene.add(mesh);`;
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
              <button type="button" class="btn-small" id="btn-open-fullwindow" data-entry-id="${escapeHtml(
                activeClip ? `${item.id}/${String(activeClip.n).padStart(2, "0")}` : item.id
              )}" data-tooltip="Open full-window preview with carousel (F)">⛶ Full Window</button>
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
            <button type="button" class="btn-small" id="btn-open-fullwindow" data-entry-id="${escapeHtml(item.id)}" data-tooltip="Open full-window preview with carousel (F)">⛶ Full Window</button>
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
          <div class="viewer-controls__group">
            <span>3D GLB · Drag to orbit, scroll to zoom</span>
            <button type="button" class="btn-small" id="btn-open-fullwindow" data-entry-id="${escapeHtml(item.id)}" data-tooltip="Open full-window preview with carousel (F)">⛶ Full Window</button>
          </div>
          <span>${item.triangles ? `${item.triangles.toLocaleString()} triangles` : ""}</span>
        </div>
      `;
    } else if (item.kind === "splat") {
      viewerHtml = `
        <div class="viewer-stage" style="flex-direction: column;">
          <div id="splat-viewer-container" style="width:100%; height:520px; position:relative; overflow:hidden; background:var(--art-bg); display:flex; align-items:center; justify-content:center;">
            <div id="splat-loading" style="font-family:var(--mono); font-size:0.82rem; color:var(--muted);">Loading 3D Gaussian Splats with Spark.js…</div>
          </div>
        </div>
      `;
      controlsHtml = `
        <div class="viewer-controls">
          <div class="viewer-controls__group">
            <span>Interactive 3D Gaussian Splat (.spz) · Drag to orbit, wheel to zoom</span>
            <button type="button" class="btn-small" id="btn-open-fullwindow" data-entry-id="${escapeHtml(item.id)}" data-tooltip="Open full-window preview with carousel (F)">⛶ Full Window</button>
          </div>
          <span id="splat-status">${
            item.splats ? `${Number(item.splats).toLocaleString()} splats (Spark.js)` : "Spark.js 3DGS"
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
            <button type="button" class="btn-small" data-svg-bg="transparent">Transparent</button>
            <button type="button" class="btn-small" data-svg-bg="dark">Dark</button>
            <button type="button" class="btn-small" data-svg-bg="light">Light</button>
            <button type="button" class="btn-small" id="btn-open-fullwindow" data-entry-id="${escapeHtml(item.id)}" data-tooltip="Open full-window preview with carousel (F)">⛶ Full Window</button>
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

    const fMeta = files.media || {};
    const origMeta = files.original || {};
    const itemW = Number(
      fMeta.width || origMeta.width || (catEntry && catEntry.width) || (activeClip && activeClip.width) || 0
    );
    const itemH = Number(
      fMeta.height || origMeta.height || (catEntry && catEntry.height) || (activeClip && activeClip.height) || 0
    );
    const itemAr = computeAspectRatio(itemW, itemH);

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

          <!-- Stream & Proxy URLs Box -->
          <div class="panel-box">
            <div class="panel-box__title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Stream &amp; Proxy URLs</span>
              <span
                class="info-pill"
                tabindex="0"
                data-tooltip="Proxy URL is a downscaled 768px / 15fps WebM built specifically for fast computer-vision &amp; ML inference (MediaPipe, optical flow). Stream URL is the full-resolution asset for visual rendering."
              >Stream vs Proxy? ⓘ</span>
            </div>
            <div class="copy-grid">
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
                    >Proxy URL</button>`
                  : ""
              }
              <button
                type="button"
                class="btn-small"
                data-copy-text="${escapeHtml(streamUrl)}"
                data-copy-label="Stream URL"
                data-tooltip="Stream URL (${escapeHtml(
                  streamFileLabel
                )}): Full-resolution, native-framerate delivery file. Use this URL for visual playback, HTML embeds, p5.js / Three.js textures, and Genereti ꘇ 2D stream."
              >Stream URL</button>
              <a
                class="btn-small"
                href="${escapeHtml(resolveAssetUrl(activeMediaRel))}"
                download="${escapeHtml(downloadFilename)}"
                data-tooltip="Download the media file (${escapeHtml(downloadFilename)}) to your machine."
              >Download Media</a>
            </div>
          </div>

          <!-- Required Credit Box -->
          <div class="credit-box">
            <div class="credit-box__header">
              <span class="eyebrow">Required Credit &amp; Rights</span>
              <span class="card-badge card-badge--pd">${escapeHtml(
                (item.rights && item.rights.license) || (item.rights && item.rights.status) || "unknown"
              )}</span>
            </div>
            <p class="credit-box__text">${escapeHtml((item.rights && item.rights.credit) || "Credit pending")}</p>
            <div class="copy-grid" style="margin-top: 0.65rem;">
              <button
                type="button"
                class="btn-small"
                data-copy-text="${escapeHtml((item.rights && item.rights.credit) || "")}"
                data-copy-label="Credit line"
                data-tooltip="Copy the required attribution credit line for your code comments or caption."
              >Credit</button>
              <button
                type="button"
                class="btn-small"
                id="btn-download-credit-txt"
                data-tooltip="Download a standalone .credit.txt file with title, license, credit, and archive URL."
              >credit.txt</button>
            </div>
          </div>

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

          <!-- Metadata Facts (Creators & Tags) -->
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
              <dt>Aspect Ratio</dt>
              <dd>${itemAr ? escapeHtml(itemAr.display) : "—"}</dd>
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
        </div>
      </div>

      <!-- Detail Bottom Section (Full-width across bottom) -->
      <div class="detail-bottom">
        <!-- Files & Derivatives Table -->
        <div class="panel-box">
          <div class="panel-box__title">Files &amp; Derivatives</div>
          <div class="data-table-wrap">
            <table class="data-table">
              <colgroup>
                <col style="width: 14%;">
                <col style="width: 26%;">
                <col style="width: 24%;">
                <col style="width: 14%;">
                <col style="width: 22%;">
              </colgroup>
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
                    const fAr = computeAspectRatio(fobj.width, fobj.height);
                    const dims =
                      fobj.width && fobj.height
                        ? `${fobj.width}×${fobj.height}${fAr ? ` (${fAr.ratioStr})` : ""}`
                        : "";
                    const dur = fobj.duration ? ` ${fobj.duration}s` : "";
                    const detailsStr = (dims + dur).trim() || fobj.type || "—";
                    return `
                    <tr>
                      <td>${escapeHtml(role)}</td>
                      <td>${
                        href
                          ? `<a href="${escapeHtml(href)}" download class="link-truncate">${escapeHtml(
                              fobj.path || "external"
                            )}</a>`
                          : `${escapeHtml(fobj.path || "—")} (source-only)`
                      }</td>
                      <td>${escapeHtml(detailsStr)}</td>
                      <td>${formatBytes(fobj.bytes)}</td>
                      <td><code>${escapeHtml((fobj.sha256 || "").slice(0, 10))}…</code></td>
                    </tr>
                  `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Provenance Table -->
        <div class="panel-box">
          <div class="panel-box__title">Provenance &amp; Derivation Chain</div>
          <div class="data-table-wrap">
            <table class="data-table">
              <colgroup>
                <col style="width: 14%;">
                <col style="width: 28%;">
                <col style="width: 44%;">
                <col style="width: 14%;">
              </colgroup>
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
                  .map((p) => {
                    const srcVal = p.tool || p.from || "—";
                    const isUrl = typeof srcVal === "string" && (srcVal.startsWith("http://") || srcVal.startsWith("https://"));
                    const paramVal = p.args || p.model || (p.sha256 ? p.sha256.slice(0, 12) : "") || "—";
                    return `
                    <tr>
                      <td>${escapeHtml(p.step)}</td>
                      <td>${
                        isUrl
                          ? `<a href="${escapeHtml(srcVal)}" target="_blank" rel="noopener" class="link-truncate">${escapeHtml(srcVal)} ↗</a>`
                          : escapeHtml(srcVal)
                      }</td>
                      <td><code class="code-wrap">${escapeHtml(paramVal)}</code></td>
                      <td>${escapeHtml(p.date || "—")}</td>
                    </tr>
                  `;
                  })
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
          if (mode === "transparent" || mode === "checker") {
            svgStage.style.background = "transparent";
            svgStage.classList.remove("viewer-stage--checker");
          } else if (mode === "light") {
            svgStage.style.background = "#f2f1ed";
          } else {
            svgStage.style.background = "#121212";
          }
        });
      });
    }

    // Full-Window Preview trigger from detail stage
    const btnFullWindow = document.getElementById("btn-open-fullwindow");
    if (btnFullWindow) {
      btnFullWindow.addEventListener("click", () => {
        const id = btnFullWindow.getAttribute("data-entry-id") || rawId;
        openFullWindowPreview(id);
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
    const splatViewerContainer = document.getElementById("splat-viewer-container");
    if (splatViewerContainer) {
      const splatPath = item.files && item.files.media ? item.files.media.path : "media.spz";
      const splatUrl = resolveAssetUrl(`items/${item.id}/${splatPath}`);
      initSparkSplatViewer(splatViewerContainer, splatUrl, document.getElementById("splat-status"));
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

  // Interactive 3D Gaussian Splat (.spz / 3DGS) viewer powered by Spark.js (@sparkjsdev/spark)
  async function initSparkSplatViewer(container, url, statusEl) {
    if (!container) return;
    if (activeSparkInstance) {
      try {
        activeSparkInstance.dispose();
      } catch (e) {}
      activeSparkInstance = null;
    }

    try {
      const THREE = await import("three");
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 520;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
      camera.position.set(0, 5, 25);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 1.0;
      controls.panSpeed = 0.8;

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      const splatMesh = new SplatMesh({ url });
      scene.add(splatMesh);

      let disposed = false;
      let animId = null;

      const ro = new ResizeObserver((entries) => {
        if (disposed) return;
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0) {
            camera.aspect = cr.width / cr.height;
            camera.updateProjectionMatrix();
            renderer.setSize(cr.width, cr.height);
          }
        }
      });
      ro.observe(container);

      const animate = () => {
        if (disposed) return;
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const instance = {
        dispose() {
          if (disposed) return;
          disposed = true;
          if (animId) cancelAnimationFrame(animId);
          ro.disconnect();
          try {
            controls.dispose();
          } catch (e) {}
          try {
            splatMesh.dispose();
          } catch (e) {}
          try {
            spark.dispose();
          } catch (e) {}
          try {
            renderer.dispose();
          } catch (e) {}
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        },
      };
      activeSparkInstance = instance;

      // When splat is decoded and GPU buffers are populated
      await splatMesh.initialized;
      if (disposed) return;

      const loadingEl = container.querySelector("#splat-loading");
      if (loadingEl) loadingEl.remove();

      try {
        const bb = splatMesh.getBoundingBox();
        const center = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5);
        const size = new THREE.Vector3().subVectors(bb.max, bb.min);
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = Math.max(15, Math.min(100, maxDim * 0.45));
        camera.position.set(center.x, center.y + maxDim * 0.06, center.z + dist);
        controls.target.copy(center);
        controls.update();
      } catch (_e) {}

      if (statusEl) {
        statusEl.textContent = `${splatMesh.numSplats.toLocaleString()} splats · Interactive orbit (Spark.js)`;
      }

      return instance;
    } catch (err) {
      console.warn("Spark.js viewer error:", err);
      if (statusEl) statusEl.textContent = "Preview mode (Spark.js error)";
      const loadingEl = container.querySelector("#splat-loading");
      if (loadingEl) {
        loadingEl.textContent = "Spark.js viewer unavailable: " + (err.message || "WebGL error");
      }
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
            <div style="margin-top:0.5rem; display:flex; gap:0.4rem;">
              <a href="curate.html" class="btn-small">Curate in Studio 🔒</a>
              <a href="#/${escapeHtml(item.id)}" class="btn-small">Preview Item</a>
            </div>
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
      if (state.isZenMode) {
        showSection("gallery");
        openFullWindowPreview(targetId);
        return;
      }
      showSection("detail");
      renderDetailView(targetId);
      return;
    }

    if (els.zenPreviewModal && !els.zenPreviewModal.hidden) {
      closeFullWindowPreview();
    }

    showSection("gallery");
    renderGallery();
  }

  function showSection(which) {
    if (activeSparkInstance && which !== "detail") {
      try {
        activeSparkInstance.dispose();
      } catch (e) {}
      activeSparkInstance = null;
    }
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
      els.searchInput.addEventListener("blur", () => {
        if (els.siteHeader) {
          els.siteHeader.classList.remove("is-revealed");
        }
      });
    }

    // Mouse movement over media grid updates highlighted card frame
    if (els.mediaGrid) {
      els.mediaGrid.addEventListener("mousemove", (e) => {
        const card = e.target.closest(".media-card");
        const id = card ? card.getAttribute("data-entry-id") : null;
        if (id && id !== activeCardId) {
          highlightCard(id, false);
        }
      });
      els.mediaGrid.addEventListener("mouseleave", () => {
        updateHoverBar(null);
      });
    }

    // Mouse movement detection for top bar & carousel hover in Zen Mode
    document.addEventListener("mousemove", (e) => {
      if (state.isZenMode) {
        if (e.clientY < 65) {
          document.body.classList.add("topbar-hover");
        } else if (document.activeElement !== els.searchInput) {
          document.body.classList.remove("topbar-hover");
        }
      }
      if (els.zenPreviewModal && !els.zenPreviewModal.hidden) {
        if (e.clientY < 90) {
          els.zenPreviewModal.classList.add("topbar-hover");
        } else {
          els.zenPreviewModal.classList.remove("topbar-hover");
        }
      }
    });

    // Keyboard shortcuts: Alt+Z (Zen mode), Alt+D (Dark mode), `/` (search), `Escape`, `F` (full window), `S` (selection filter), `Enter` (select card), arrow keys
    window.addEventListener("keydown", (e) => {
      // Alt+Z toggles Zen mode
      if (e.altKey && (e.key === "z" || e.key === "Z" || e.code === "KeyZ")) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      // Alt+D toggles theme
      if (e.altKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // S key: toggle showing selection set only (when not in text input)
      if (
        (e.key === "s" || e.key === "S") &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "SELECT"
      ) {
        if (els.viewGallery && !els.viewGallery.hidden) {
          e.preventDefault();
          toggleShowSelectionOnly();
          return;
        }
      }

      // Card mode Arrow key navigation (Left, Right, Up, Down)
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        (!els.zenPreviewModal || els.zenPreviewModal.hidden) &&
        els.viewGallery && !els.viewGallery.hidden &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "SELECT"
      ) {
        const cards = Array.from(els.mediaGrid.querySelectorAll(".media-card"));
        if (cards.length > 0) {
          e.preventDefault();
          let currentIndex = cards.findIndex((c) => c.getAttribute("data-entry-id") === activeCardId);
          if (currentIndex === -1) {
            highlightCard(cards[0].getAttribute("data-entry-id"), true);
            return;
          }

          let targetCard = null;
          if (e.key === "ArrowLeft") {
            const newIndex = Math.max(0, currentIndex - 1);
            targetCard = cards[newIndex];
          } else if (e.key === "ArrowRight") {
            const newIndex = Math.min(cards.length - 1, currentIndex + 1);
            targetCard = cards[newIndex];
          } else {
            const curCard = cards[currentIndex];
            const curRect = curCard.getBoundingClientRect();
            const curCenterX = curRect.left + curRect.width / 2;

            if (e.key === "ArrowDown") {
              const below = cards.filter((c) => {
                const r = c.getBoundingClientRect();
                return r.top >= curRect.bottom - 8;
              });
              if (below.length > 0) {
                const minTop = Math.min(...below.map((c) => c.getBoundingClientRect().top));
                const rowCards = below.filter((c) => c.getBoundingClientRect().top <= minTop + 15);
                targetCard = rowCards.reduce(
                  (closest, c) => {
                    const r = c.getBoundingClientRect();
                    const dist = Math.abs(r.left + r.width / 2 - curCenterX);
                    return dist < closest.dist ? { card: c, dist } : closest;
                  },
                  { card: rowCards[0], dist: Infinity }
                ).card;
              } else {
                targetCard = cards[cards.length - 1];
              }
            } else if (e.key === "ArrowUp") {
              const above = cards.filter((c) => {
                const r = c.getBoundingClientRect();
                return r.bottom <= curRect.top + 8;
              });
              if (above.length > 0) {
                const maxBottom = Math.max(...above.map((c) => c.getBoundingClientRect().bottom));
                const rowCards = above.filter((c) => c.getBoundingClientRect().bottom >= maxBottom - 15);
                targetCard = rowCards.reduce(
                  (closest, c) => {
                    const r = c.getBoundingClientRect();
                    const dist = Math.abs(r.left + r.width / 2 - curCenterX);
                    return dist < closest.dist ? { card: c, dist } : closest;
                  },
                  { card: rowCards[0], dist: Infinity }
                ).card;
              } else {
                targetCard = cards[0];
              }
            }
          }

          if (targetCard) {
            highlightCard(targetCard.getAttribute("data-entry-id"), true);
          }
          return;
        }
      }

      // Enter key: toggle selected status of highlighted or hovered card in card mode
      if (
        e.key === "Enter" &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        (!els.zenPreviewModal || els.zenPreviewModal.hidden) &&
        els.viewGallery && !els.viewGallery.hidden &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "SELECT"
      ) {
        if (activeCardId) {
          e.preventDefault();
          e.stopPropagation();
          toggleItemSelection(activeCardId);
          return;
        }
      }

      // F key: in preview mode toggles full-window fit (stretch vs 1:1)
      // Outside preview mode opens full-window preview
      if (
        (e.key === "f" || e.key === "F") &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        const isPreviewOpen = els.zenPreviewModal && !els.zenPreviewModal.hidden;
        if (isPreviewOpen) {
          togglePreviewFullFit();
        } else if (!els.viewDetail.hidden) {
          const hash = window.location.hash || "";
          const targetId = hash.startsWith("#/") ? hash.slice(2) : null;
          if (targetId) openFullWindowPreview(targetId);
        } else if (activeCardId) {
          openFullWindowPreview(activeCardId);
        }
        return;
      }

      // If full-window preview is open, handle its navigation
      if (els.zenPreviewModal && !els.zenPreviewModal.hidden) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeFullWindowPreview();
          if (state.isZenMode) window.location.hash = "#/";
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navigateCarousel(-1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          navigateCarousel(1);
          return;
        }
        if (e.key === " ") {
          const vid = document.getElementById("zen-player-video");
          if (vid) {
            e.preventDefault();
            if (vid.paused) vid.play();
            else vid.pause();
          }
          return;
        }
      }

      // Shortcut `/` to reveal search bar and focus
      if (e.key === "/" && document.activeElement !== els.searchInput) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          e.preventDefault();
          if (state.isZenMode && els.siteHeader) {
            els.siteHeader.classList.add("is-revealed");
          }
          if (els.searchInput) els.searchInput.focus();
        }
      } else if (e.key === "Escape") {
        if (els.aboutDialog && els.aboutDialog.open) {
          els.aboutDialog.close();
        } else if (window.location.hash && window.location.hash !== "#/") {
          window.location.hash = "#/";
        }
      }
    });

    // Carousel Rail Controls (Home, Prev, Next, About, Zen)
    if (els.zenCarouselHome) {
      els.zenCarouselHome.addEventListener("click", () => {
        closeFullWindowPreview();
        window.location.hash = "#/";
      });
    }
    if (els.zenCarouselPrev) {
      els.zenCarouselPrev.addEventListener("click", () => navigateCarousel(-1));
    }
    if (els.zenCarouselNext) {
      els.zenCarouselNext.addEventListener("click", () => navigateCarousel(1));
    }
    if (els.zenCarouselAbout) {
      els.zenCarouselAbout.addEventListener("click", () => {
        if (els.aboutDialog) els.aboutDialog.showModal();
      });
    }
    if (els.zenCarouselZen) {
      els.zenCarouselZen.addEventListener("click", toggleZenMode);
    }

    // About Dialog Events
    if (els.btnOpenAbout && els.aboutDialog) {
      els.btnOpenAbout.addEventListener("click", () => {
        els.aboutDialog.showModal();
      });
    }
    if (els.aboutDialogClose && els.aboutDialog) {
      els.aboutDialogClose.addEventListener("click", () => {
        els.aboutDialog.close();
      });
    }
    if (els.aboutDialog) {
      els.aboutDialog.addEventListener("click", (e) => {
        const rect = els.aboutDialog.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          els.aboutDialog.close();
        }
      });
    }

    // Type filter chips (Items / Clips / Selection) - Non-exclusive toggles
    document.querySelectorAll("[data-type-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tf = btn.getAttribute("data-type-filter");
        if (tf === "selection") {
          toggleShowSelectionOnly();
          return;
        }
        if (state.typeFilters.has(tf)) {
          if (state.typeFilters.size > 1) {
            state.typeFilters.delete(tf);
          } else {
            // If toggling off the last one, toggle the other on
            state.typeFilters.delete(tf);
            state.typeFilters.add(tf === "item" ? "clip" : "item");
          }
        } else {
          state.typeFilters.add(tf);
        }
        saveStoredSet("mediatheque_type_filters", state.typeFilters);
        updateShowChipsUI();
        renderGallery();
      });
    });

    // Kind filter chips - Non-exclusive toggles (Video, Animation, Image, Audio, 3D, Splat, etc.)
    document.querySelectorAll("[data-kind-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kf = btn.getAttribute("data-kind-filter");
        if (kf === "all") {
          state.kindFilters.clear();
          state.kindFilters.add("all");
        } else {
          state.kindFilters.delete("all");
          if (state.kindFilters.has(kf)) {
            state.kindFilters.delete(kf);
            if (state.kindFilters.size === 0) {
              state.kindFilters.add("all");
            }
          } else {
            state.kindFilters.add(kf);
          }
        }
        saveStoredSet("mediatheque_kind_filters", state.kindFilters);
        updateKindChipsUI();
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
        const rmSel = e.target.closest("[data-remove-selection]");
        if (rmSel) {
          state.showSelectionOnly = false;
          localStorage.setItem("mediatheque_show_selection", "false");
          updateShowChipsUI();
          renderGallery();
          return;
        }
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

        // Top-right corner click on card (subtle selection icon hit target)
        if (!state.showSelectionOnly) {
          const card = e.target.closest(".media-card");
          if (card) {
            const rect = card.getBoundingClientRect();
            if (e.clientX >= rect.right - 34 && e.clientY <= rect.top + 34) {
              e.preventDefault();
              e.stopPropagation();
              const id = card.getAttribute("data-entry-id");
              toggleItemSelection(id);
              return;
            }
          }
        }

        const checkbox = e.target.closest("[data-select-id]");
        if (checkbox) {
          e.stopPropagation();
          const id = checkbox.getAttribute("data-select-id");
          toggleItemSelection(id);
          return;
        }

        const link = e.target.closest("[data-href]");
        if (link) {
          const href = link.getAttribute("data-href");
          if (href) {
            e.preventDefault();
            if (e.metaKey || e.ctrlKey) {
              window.open(href, "_blank");
            } else {
              window.location.hash = href;
            }
          }
          return;
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
        saveStoredSet("mediatheque_selected_ids", state.selectedIds);
        renderGallery();
      });
    }
    if (els.btnClearSelection) {
      els.btnClearSelection.addEventListener("click", () => {
        state.selectedIds.clear();
        state.showSelectionOnly = false;
        saveStoredSet("mediatheque_selected_ids", state.selectedIds);
        localStorage.setItem("mediatheque_show_selection", "false");
        renderGallery();
      });
    }
    if (els.btnDownloadZip) {
      els.btnDownloadZip.addEventListener("click", downloadSelectionZip);
    }
  }

  initTheme();
  initZenMode();
  initHeaderLinks();
  bindGlobalEvents();
  loadData();
})();
