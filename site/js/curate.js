/**
 * Mediathèque Curator Studio Frontend Logic
 * Supports connected backend mode (via tools/curate_server.py)
 * and static mode fallback (via GitHub Pages).
 */
(function () {
  "use strict";

  const isSubdir = window.location.pathname.includes("/site/");
  const ROOT_PREFIX = isSubdir ? "../" : "./";
  const DEFAULT_HASH = "60ae67a66c0c1ffbad31a25aa82f6b3dbcef7b0d35683fbc7e7ab83f5b985f14"; // sha256 of 'curator1895'

  const state = {
    authenticated: false,
    authToken: sessionStorage.getItem("mediatheque_token") || "",
    isLiveServer: false,
    items: [],
    sourcesRegistry: [],
    activeTab: "review", // 'review' | 'published' | 'all' | 'scour'
    sidebarFilter: "all",
    searchQuery: "",
    selectedItem: null,
    selectedFullItem: null,
    vocabTags: [
      "person", "animal", "pair", "single", "crowd", "fullbody", "face", "closeup", "side", "front",
      "movement", "fast", "walk", "dance", "short", "loop-friendly", "early-film", "chronophotography",
      "archival", "bw", "silent", "static-camera", "abstract"
    ],
    vocabDemos: [
      "pose", "hands", "face-mesh", "face-expression", "segmentation", "object-detection",
      "optical-flow", "motion-trails", "tracking", "loop"
    ]
  };

  const els = {
    authGate: document.getElementById("auth-gate"),
    authForm: document.getElementById("auth-form"),
    passcodeInput: document.getElementById("passcode-input"),
    authErrorMsg: document.getElementById("auth-error-msg"),
    serverStatusPill: document.getElementById("server-status-pill"),
    badgeReview: document.getElementById("badge-review-count"),
    badgePublished: document.getElementById("badge-published-count"),
    badgeAll: document.getElementById("badge-all-count"),
    itemsList: document.getElementById("curate-items-list"),
    searchInput: document.getElementById("curate-search-input"),
    workbench: document.getElementById("curator-workbench"),
    workbenchGrid: document.getElementById("workbench-content-grid"),
    scourTabContent: document.getElementById("scour-tab-content"),
    itemHeading: document.getElementById("detail-item-heading"),
    itemIdPill: document.getElementById("detail-item-id"),
    itemKindBadge: document.getElementById("detail-item-kind-badge"),
    itemStatusBadge: document.getElementById("detail-item-status-badge"),
    btnSave: document.getElementById("btn-action-save"),
    btnPublish: document.getElementById("btn-action-publish"),
    btnUnpublish: document.getElementById("btn-action-unpublish"),
    btnWithdraw: document.getElementById("btn-action-withdraw"),
    btnDelete: document.getElementById("btn-action-delete"),
    btnPublicView: document.getElementById("btn-link-public"),
    playerWrap: document.getElementById("workbench-player-wrap"),
    readoutAr: document.getElementById("readout-ar"),
    readoutDims: document.getElementById("readout-dims"),
    readoutDur: document.getElementById("readout-dur"),
    readoutFps: document.getElementById("readout-fps"),
    checklistContainer: document.getElementById("checklist-container"),
    filesTableBody: document.getElementById("files-table-body"),
    inputTitle: document.getElementById("input-title"),
    inputDate: document.getElementById("input-date"),
    inputPlate: document.getElementById("input-plate"),
    inputSummary: document.getElementById("input-summary"),
    inputDesc: document.getElementById("input-description"),
    creatorsList: document.getElementById("creators-editor-list"),
    btnAddCreator: document.getElementById("btn-add-creator"),
    selRightsStatus: document.getElementById("select-rights-status"),
    inputLicense: document.getElementById("input-license"),
    inputArchive: document.getElementById("input-archive"),
    inputSourceUrl: document.getElementById("input-source-url"),
    inputCredit: document.getElementById("input-credit"),
    btnAutoCredit: document.getElementById("btn-auto-credit"),
    activeTagsWrap: document.getElementById("active-tags-wrap"),
    vocabTagsWrap: document.getElementById("vocab-tags-wrap"),
    demosChipsWrap: document.getElementById("demos-chips-wrap"),
    btnAcceptProposed: document.getElementById("btn-accept-proposed"),
    scourPresetsGrid: document.getElementById("scour-presets-grid"),
    formScourUrl: document.getElementById("form-scour-url"),
    inputScourUrl: document.getElementById("input-scour-url"),
    btnRebuildCatalog: document.getElementById("btn-rebuild-catalog"),
    btnGitStatus: document.getElementById("btn-git-status"),
    modalGit: document.getElementById("modal-git"),
    gitStatusPre: document.getElementById("git-status-pre"),
    gitCommitMsg: document.getElementById("git-commit-msg"),
    btnExecuteGitCommit: document.getElementById("btn-execute-git-commit"),
    btnCloseGit: document.getElementById("btn-close-git"),
    btnLogout: document.getElementById("btn-logout")
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resolveAsset(relPath) {
    if (!relPath) return "";
    if (relPath.startsWith("http://") || relPath.startsWith("https://")) return relPath;
    return ROOT_PREFIX + relPath.replace(/^\//, "");
  }

  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Check auth against live server or static fallback
  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/check", {
        headers: state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}
      });
      if (res.ok) {
        state.isLiveServer = true;
        els.serverStatusPill.textContent = "Live Server Connected";
        els.serverStatusPill.style.color = "var(--curate-success)";
        const json = await res.json();
        if (json.authenticated) {
          state.authenticated = true;
          els.authGate.hidden = true;
          initStudio();
          return;
        }
      }
    } catch (_e) {
      // Static mode (GitHub Pages)
      state.isLiveServer = false;
      els.serverStatusPill.textContent = "Static / Offline Mode";
      els.serverStatusPill.style.color = "var(--muted)";
    }

    if (sessionStorage.getItem("mediatheque_authenticated") === "true") {
      state.authenticated = true;
      els.authGate.hidden = true;
      initStudio();
    } else {
      els.authGate.hidden = false;
    }
  }

  // Handle Login submission
  els.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = els.passcodeInput.value.trim();
    if (!val) return;

    if (state.isLiveServer) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: val })
        });
        const data = await res.json();
        if (data.success) {
          state.authenticated = true;
          state.authToken = data.token;
          sessionStorage.setItem("mediatheque_token", data.token);
          sessionStorage.setItem("mediatheque_authenticated", "true");
          els.authGate.hidden = true;
          initStudio();
          return;
        }
      } catch (_e) {
        // Fall back to client hash
      }
    }

    // Client-side SHA-256 fallback
    const hash = await sha256(val);
    if (hash === DEFAULT_HASH) {
      state.authenticated = true;
      sessionStorage.setItem("mediatheque_authenticated", "true");
      els.authGate.hidden = true;
      initStudio();
    } else {
      els.authErrorMsg.hidden = false;
      els.authErrorMsg.textContent = "Incorrect curatorial passcode.";
      els.passcodeInput.focus();
    }
  });

  els.btnLogout.addEventListener("click", () => {
    sessionStorage.removeItem("mediatheque_authenticated");
    sessionStorage.removeItem("mediatheque_token");
    state.authenticated = false;
    els.authGate.hidden = false;
    els.passcodeInput.value = "";
  });

  // Initialize studio data
  async function initStudio() {
    await Promise.all([loadItems(), loadSourcesRegistry()]);
    renderSidebarItems();
    renderScourPresets();
    if (state.items.length > 0 && !state.selectedItem) {
      const firstReview = state.items.find((i) => i.status === "review" || i.status === "draft") || state.items[0];
      selectItem(firstReview.id);
    }
  }

  // Load items from API or catalog.json + review.json
  async function loadItems() {
    if (state.isLiveServer) {
      try {
        const res = await fetch("/api/items", {
          headers: { Authorization: `Bearer ${state.authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          state.items = data.items || [];
          updateTabCounts();
          return;
        }
      } catch (err) {
        console.warn("Failed fetching /api/items, falling back to static", err);
      }
    }

    // Static fallback: fetch catalog.json + review.json
    try {
      const [catRes, revRes] = await Promise.all([
        fetch(resolveAsset("catalog.json")),
        fetch(resolveAsset("review.json"))
      ]);
      const cat = catRes.ok ? await catRes.json() : [];
      const rev = revRes.ok ? await revRes.json() : [];
      const seen = new Set();
      const combined = [];
      for (const item of [...rev, ...cat]) {
        if (item.type === "item" && !seen.has(item.id)) {
          seen.add(item.id);
          combined.push({
            id: item.id,
            title: item.title,
            kind: item.kind,
            status: item.status || (cat.some((c) => c.id === item.id) ? "published" : "review"),
            summary: item.summary,
            date: item.date,
            tags: item.tags || [],
            demos: item.demos || [],
            rights: item.rights || {},
            thumb: item.thumb,
            missing: item.status !== "published" && (!item.rights || !item.rights.credit) ? ["rights.credit"] : []
          });
        }
      }
      state.items = combined;
      updateTabCounts();
    } catch (e) {
      console.error("Error loading static items:", e);
    }
  }

  async function loadSourcesRegistry() {
    try {
      const res = await fetch(resolveAsset("tools/sources_registry.json"));
      if (res.ok) {
        const data = await res.json();
        state.sourcesRegistry = data.sources || [];
      }
    } catch (_e) {}
  }

  function updateTabCounts() {
    const reviewCount = state.items.filter((i) => i.status === "review" || i.status === "draft").length;
    const pubCount = state.items.filter((i) => i.status === "published").length;
    els.badgeReview.textContent = reviewCount;
    els.badgePublished.textContent = pubCount;
    els.badgeAll.textContent = state.items.length;
  }

  // Sidebar Filtering and Rendering
  function renderSidebarItems() {
    let filtered = state.items;

    // Filter by Tab
    if (state.activeTab === "review") {
      filtered = filtered.filter((i) => i.status === "review" || i.status === "draft");
    } else if (state.activeTab === "published") {
      filtered = filtered.filter((i) => i.status === "published");
    }

    // Filter by Chip
    if (state.sidebarFilter === "ready") {
      filtered = filtered.filter((i) => (!i.missing || i.missing.length === 0) && i.status !== "published");
    } else if (state.sidebarFilter === "needs-work") {
      filtered = filtered.filter((i) => i.missing && i.missing.length > 0);
    } else if (state.sidebarFilter === "video") {
      filtered = filtered.filter((i) => i.kind === "video");
    } else if (state.sidebarFilter === "animation") {
      filtered = filtered.filter((i) => i.kind === "animation");
    }

    // Search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          (i.summary && i.summary.toLowerCase().includes(q)) ||
          (i.tags && i.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (filtered.length === 0) {
      els.itemsList.innerHTML = `<p class="muted-copy" style="padding:1rem;">No items match this filter.</p>`;
      return;
    }

    els.itemsList.innerHTML = filtered
      .map((item) => {
        const isSel = state.selectedItem && state.selectedItem.id === item.id ? "is-selected" : "";
        const thumbUrl = resolveAsset(item.thumb || `items/${item.id}/thumb.webp`);
        const statusClass =
          item.status === "published"
            ? "status-badge--published"
            : item.status === "review"
            ? "status-badge--review"
            : "status-badge--draft";

        const readyMark =
          item.status === "published"
            ? "✓ Live"
            : item.missing && item.missing.length === 0
            ? "✓ Ready"
            : `⚠️ ${item.missing ? item.missing.length : 1} missing`;

        return `
        <div class="item-row ${isSel}" data-item-id="${escapeHtml(item.id)}">
          <img class="item-row__thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <div class="item-row__meta">
            <span class="item-row__title">${escapeHtml(item.title)}</span>
            <div class="item-row__sub">
              <span class="status-badge ${statusClass}">${escapeHtml(item.status)}</span>
              <span>${escapeHtml(item.kind)}</span>
              <span style="margin-left:auto; font-size:0.65rem;">${escapeHtml(readyMark)}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // Wire clicks
    els.itemsList.querySelectorAll(".item-row").forEach((row) => {
      row.addEventListener("click", () => {
        selectItem(row.getAttribute("data-item-id"));
      });
    });
  }

  // Select Item and Load Details
  async function selectItem(itemId) {
    const brief = state.items.find((i) => i.id === itemId);
    if (!brief) return;
    state.selectedItem = brief;
    renderSidebarItems();

    // Fetch full item.json
    let full = null;
    if (state.isLiveServer) {
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          headers: { Authorization: `Bearer ${state.authToken}` }
        });
        if (res.ok) {
          const json = await res.json();
          full = json.item;
        }
      } catch (_e) {}
    }
    if (!full) {
      try {
        const res = await fetch(resolveAsset(`items/${itemId}/item.json`));
        if (res.ok) full = await res.json();
      } catch (_e) {}
    }

    state.selectedFullItem = full || { ...brief, files: {}, creators: [] };
    renderWorkbench(state.selectedFullItem);
  }

  // Render Full Workbench
  function renderWorkbench(item) {
    els.itemHeading.textContent = item.title || item.id;
    els.itemIdPill.textContent = item.id;
    els.itemKindBadge.textContent = item.kind;
    els.itemStatusBadge.textContent = item.status;
    els.itemStatusBadge.className = `status-badge status-badge--${item.status}`;

    els.btnPublish.hidden = item.status === "published";
    els.btnUnpublish.hidden = item.status !== "published";
    els.btnWithdraw.hidden = item.status === "withdrawn";
    els.btnDelete.hidden = false;
    els.btnPublicView.href = `index.html#/${item.id}`;

    // Populate Player
    renderPlayer(item);

    // Populate Form Fields
    els.inputTitle.value = item.title || "";
    els.inputDate.value = item.date || "";
    els.inputPlate.value = item.plate || "";
    els.inputSummary.value = item.summary || "";
    els.inputDesc.value = item.description || "";

    // Creators
    renderCreatorsEditor(item.creators || []);

    // Rights & Source
    const rights = item.rights || {};
    const src = item.source || {};
    els.selRightsStatus.value = rights.status || "public-domain";
    els.inputLicense.value = rights.license || "PD-old-100";
    els.inputArchive.value = src.archive || "";
    els.inputSourceUrl.value = src.url || src.origin || "";
    els.inputCredit.value = rights.credit || "";

    // Tags & Demos
    renderTagsEditor(item.tags || [], item.demos || [], (item.proposed && item.proposed.tags) || []);

    // File table
    renderFilesTable(item);

    // Checklist
    updateChecklist();
  }

  function renderPlayer(item) {
    const files = item.files || {};
    const mediaRel = files.media ? `items/${item.id}/${files.media.path}` : "";
    const origRel = files.original ? `items/${item.id}/${files.original.path}` : "";
    const posterRel = files.poster ? `items/${item.id}/${files.poster.path}` : "";

    const mediaSrc = resolveAsset(mediaRel || origRel);
    let html = "";

    if (item.kind === "video" || item.kind === "animation") {
      html = `
        <video
          src="${escapeHtml(mediaSrc)}"
          ${posterRel ? `poster="${escapeHtml(resolveAsset(posterRel))}"` : ""}
          controls
          loop
          muted
          playsinline
          style="max-width:100%; max-height:360px; object-fit:contain;"
        ></video>
      `;
    } else if (item.kind === "image" || item.kind === "vector") {
      html = `<img src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(item.title)}" style="max-height:360px; max-width:100%; object-fit:contain;" />`;
    } else if (item.kind === "model") {
      html = `<model-viewer src="${escapeHtml(mediaSrc)}" camera-controls auto-rotate style="width:100%; height:320px;"></model-viewer>`;
    } else {
      html = `<div style="padding:2rem; text-align:center;">${escapeHtml(item.kind)} preview</div>`;
    }

    els.playerWrap.innerHTML = html;

    // Dimensions & Aspect Ratio Readouts
    const mMeta = files.media || files.original || {};
    const w = Number(mMeta.width || 0);
    const h = Number(mMeta.height || 0);
    const dur = Number(mMeta.duration || 0);
    const fps = Number(mMeta.fps || 0);

    els.readoutDims.textContent = w && h ? `Dimensions: ${w}×${h}` : "Dimensions: —";
    els.readoutDur.textContent = dur ? `Duration: ${dur.toFixed(1)}s` : "Duration: —";
    els.readoutFps.textContent = fps ? `FPS: ${fps}` : "FPS: —";

    if (w && h) {
      const ratio = (w / h).toFixed(2);
      els.readoutAr.textContent = `${ratio}:1 (${w}×${h})`;
    } else {
      els.readoutAr.textContent = "Ratio: —";
    }
  }

  function renderCreatorsEditor(creators) {
    if (!creators || creators.length === 0) {
      creators = [{ name: "", role: "director" }];
    }
    els.creatorsList.innerHTML = creators
      .map(
        (c, idx) => `
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <input type="text" class="curate-input creator-name" value="${escapeHtml(c.name)}" placeholder="Creator / Author name" style="flex:1;" />
          <input type="text" class="curate-input creator-role" value="${escapeHtml(c.role || "")}" placeholder="Role (e.g. director, photographer)" style="width:160px;" />
          <button type="button" class="btn-curate btn-remove-creator" data-creator-idx="${idx}" style="color:var(--curate-danger);">✕</button>
        </div>
      `
      )
      .join("");

    els.creatorsList.querySelectorAll(".btn-remove-creator").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-creator-idx"), 10);
        creators.splice(idx, 1);
        renderCreatorsEditor(creators);
        updateChecklist();
      });
    });
  }

  els.btnAddCreator.addEventListener("click", () => {
    const list = getCreatorsFromForm();
    list.push({ name: "", role: "director" });
    renderCreatorsEditor(list);
  });

  function getCreatorsFromForm() {
    const rows = els.creatorsList.querySelectorAll("div");
    const out = [];
    rows.forEach((r) => {
      const name = r.querySelector(".creator-name")?.value.trim() || "";
      const role = r.querySelector(".creator-role")?.value.trim() || "";
      if (name) out.push({ name, role });
    });
    return out;
  }

  function renderTagsEditor(activeTags, activeDemos, proposedTags) {
    const activeSet = new Set(activeTags);
    const demosSet = new Set(activeDemos);

    // Active Tags
    els.activeTagsWrap.innerHTML = Array.from(activeSet)
      .map(
        (t) => `
        <button type="button" class="tag-toggle-chip is-active" data-tag="${escapeHtml(t)}">
          ${escapeHtml(t)} ✕
        </button>
      `
      )
      .join("");

    // Vocab Tags (toggle)
    els.vocabTagsWrap.innerHTML = state.vocabTags
      .filter((t) => !activeSet.has(t))
      .map(
        (t) => `
        <button type="button" class="tag-toggle-chip" data-tag="${escapeHtml(t)}">
          + ${escapeHtml(t)}
        </button>
      `
      )
      .join("");

    // Demos
    els.demosChipsWrap.innerHTML = state.vocabDemos
      .map(
        (d) => `
        <button type="button" class="tag-toggle-chip ${demosSet.has(d) ? "is-active" : ""}" data-demo="${escapeHtml(d)}">
          ${escapeHtml(d)}
        </button>
      `
      )
      .join("");

    // Wire tag clicks
    els.activeTagsWrap.querySelectorAll("[data-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSet.delete(btn.getAttribute("data-tag"));
        renderTagsEditor(Array.from(activeSet), Array.from(demosSet), proposedTags);
      });
    });

    els.vocabTagsWrap.querySelectorAll("[data-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSet.add(btn.getAttribute("data-tag"));
        renderTagsEditor(Array.from(activeSet), Array.from(demosSet), proposedTags);
      });
    });

    els.demosChipsWrap.querySelectorAll("[data-demo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.getAttribute("data-demo");
        if (demosSet.has(d)) demosSet.delete(d);
        else demosSet.add(d);
        renderTagsEditor(Array.from(activeSet), Array.from(demosSet), proposedTags);
      });
    });
  }

  function getActiveTagsFromUI() {
    return Array.from(els.activeTagsWrap.querySelectorAll("[data-tag]")).map((b) => b.getAttribute("data-tag"));
  }

  function getActiveDemosFromUI() {
    return Array.from(els.demosChipsWrap.querySelectorAll(".is-active[data-demo]")).map((b) =>
      b.getAttribute("data-demo")
    );
  }

  function renderFilesTable(item) {
    const files = item.files || {};
    els.filesTableBody.innerHTML = Object.entries(files)
      .map(([role, fobj]) => {
        if (!fobj || typeof fobj !== "object") return "";
        const href = resolveAsset(`items/${item.id}/${fobj.path}`);
        const sizeStr = fobj.bytes ? `${(fobj.bytes / 1024).toFixed(1)} KB` : "—";
        const shaStr = fobj.sha256 ? `${fobj.sha256.slice(0, 10)}…` : "—";
        return `
        <tr>
          <td>${escapeHtml(role)}</td>
          <td><a href="${escapeHtml(href)}" download style="text-decoration:underline;">${escapeHtml(fobj.path)}</a></td>
          <td>${escapeHtml(sizeStr)}</td>
          <td><code>${escapeHtml(shaStr)}</code></td>
        </tr>
      `;
      })
      .join("");
  }

  // Credit Generator
  els.btnAutoCredit.addEventListener("click", () => {
    const creators = getCreatorsFromForm();
    const creatorName = creators.length ? creators.map((c) => c.name).join(", ") : "Unknown Creator";
    const year = els.inputDate.value.trim() || "n.d.";
    const title = els.inputTitle.value.trim() || (state.selectedItem ? state.selectedItem.title : "Untitled");
    const archive = els.inputArchive.value.trim() || "Archival Collection";
    const credit = `${creatorName}, ${year}. ${title}. ${archive}. Public domain.`;
    els.inputCredit.value = credit;
    updateChecklist();
  });

  // Checklist computation
  function updateChecklist() {
    const title = els.inputTitle.value.trim();
    const summary = els.inputSummary.value.trim();
    const sourceUrl = els.inputSourceUrl.value.trim();
    const archive = els.inputArchive.value.trim();
    const license = els.inputLicense.value.trim();
    const credit = els.inputCredit.value.trim();
    const files = (state.selectedFullItem && state.selectedFullItem.files) || {};
    const hasMedia = Boolean(files.media || files.original);

    const checks = [
      { label: "Title & Summary provided", pass: Boolean(title && summary) },
      { label: "Source URL or Holding Archive verified", pass: Boolean(sourceUrl || archive) },
      { label: "Public Domain / Rights License specified", pass: Boolean(license) },
      { label: "Attribution Credit Line completed", pass: Boolean(credit) },
      { label: "Required Media File available", pass: hasMedia }
    ];

    els.checklistContainer.innerHTML = checks
      .map(
        (c) => `
        <div class="readiness-pill ${c.pass ? "readiness-pill--pass" : "readiness-pill--fail"}">
          <span>${c.pass ? "✓" : "⚠️"}</span>
          <span>${escapeHtml(c.label)}</span>
        </div>
      `
      )
      .join("");

    const allPass = checks.every((c) => c.pass);
    els.btnPublish.disabled = !allPass;
    els.btnPublish.style.opacity = allPass ? "1" : "0.5";
  }

  [els.inputTitle, els.inputSummary, els.inputSourceUrl, els.inputArchive, els.inputLicense, els.inputCredit].forEach(
    (el) => el.addEventListener("input", updateChecklist)
  );

  // Save Annotation Action
  els.btnSave.addEventListener("click", async () => {
    if (!state.selectedItem) return;
    const payload = getFormPayload();

    if (state.isLiveServer) {
      try {
        const res = await fetch(`/api/items/${state.selectedItem.id}/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.authToken}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert(`Saved annotations for ${state.selectedItem.id}`);
          await loadItems();
          renderSidebarItems();
          return;
        }
      } catch (err) {
        alert("Failed saving to server: " + err);
      }
    }

    // Static mode: trigger patch download
    downloadJsonFile(`${state.selectedItem.id}-patch.json`, payload);
    alert(`Downloaded curatorial patch for ${state.selectedItem.id}`);
  });

  // Publish Action
  els.btnPublish.addEventListener("click", async () => {
    if (!state.selectedItem) return;
    const payload = getFormPayload();

    if (state.isLiveServer) {
      try {
        // Save updates first
        await fetch(`/api/items/${state.selectedItem.id}/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.authToken}`
          },
          body: JSON.stringify(payload)
        });

        // Publish
        const res = await fetch(`/api/items/${state.selectedItem.id}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          alert(`Item ${state.selectedItem.id} is now PUBLISHED and live in the catalog!`);
          await loadItems();
          selectItem(state.selectedItem.id);
          return;
        } else {
          alert("Publication error: " + (data.error || "unknown"));
        }
      } catch (err) {
        alert("Failed publishing: " + err);
      }
    } else {
      alert(`To publish in static mode, run: python3 tools/ingest.py --publish ${state.selectedItem.id}`);
    }
  });

  els.btnUnpublish.addEventListener("click", async () => {
    if (!state.selectedItem) return;
    const ok = confirm(`Unpublish '${state.selectedItem.id}'?\n\nThis will remove it from the public catalog and move it back to the Review Queue.`);
    if (!ok) return;

    if (state.isLiveServer) {
      const res = await fetch(`/api/items/${state.selectedItem.id}/unpublish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (res.ok) {
        await loadItems();
        selectItem(state.selectedItem.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to unpublish: ${err.error || res.statusText}`);
      }
    } else {
      alert(`To unpublish in static mode, edit items/${state.selectedItem.id}/item.json and set status: review, then rebuild.`);
    }
  });

  els.btnWithdraw.addEventListener("click", async () => {
    if (!state.selectedItem) return;
    const ok = confirm(`Withdraw '${state.selectedItem.id}'?\n\nThis will remove it from both the public catalog and review queue, but retain its files on disk in an archived/withdrawn state.`);
    if (!ok) return;

    if (state.isLiveServer) {
      const res = await fetch(`/api/items/${state.selectedItem.id}/withdraw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (res.ok) {
        await loadItems();
        selectItem(state.selectedItem.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to withdraw: ${err.error || res.statusText}`);
      }
    } else {
      alert(`To withdraw in static mode, set status: withdrawn in items/${state.selectedItem.id}/item.json.`);
    }
  });

  els.btnDelete.addEventListener("click", async () => {
    if (!state.selectedItem) return;
    const targetId = state.selectedItem.id;
    const ok = confirm(`PERMANENTLY DELETE item '${targetId}'?\n\n⚠️ WARNING: This will completely delete the folder items/${targetId}/ and all media/derivatives from disk. This cannot be undone.`);
    if (!ok) return;

    if (state.isLiveServer) {
      const res = await fetch(`/api/items/${targetId}/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (res.ok) {
        state.selectedItem = null;
        state.selectedFullItem = null;
        await loadItems();
        // Clear workbench
        els.itemHeading.textContent = "Select an item to inspect and curate";
        els.itemIdPill.textContent = "—";
        els.itemKindBadge.textContent = "—";
        els.itemStatusBadge.textContent = "—";
        els.itemStatusBadge.className = "status-badge";
        els.playerWrap.innerHTML = "";
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${err.error || res.statusText}`);
      }
    } else {
      alert(`To delete in CLI mode, run: rm -rf items/${targetId} && python3 tools/build.py`);
    }
  });

  function getFormPayload() {
    return {
      title: els.inputTitle.value.trim(),
      date: els.inputDate.value.trim() || null,
      plate: els.inputPlate.value.trim() || null,
      summary: els.inputSummary.value.trim(),
      description: els.inputDesc.value.trim(),
      creators: getCreatorsFromForm(),
      source: {
        archive: els.inputArchive.value.trim(),
        url: els.inputSourceUrl.value.trim(),
        origin: els.inputSourceUrl.value.trim()
      },
      rights: {
        status: els.selRightsStatus.value,
        license: els.inputLicense.value.trim(),
        credit: els.inputCredit.value.trim(),
        notes: (state.selectedFullItem?.rights?.notes) || "Curated early movement study."
      },
      tags: getActiveTagsFromUI(),
      demos: getActiveDemosFromUI()
    };
  }

  function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Scour Presets Tab
  function renderScourPresets() {
    els.scourPresetsGrid.innerHTML = state.sourcesRegistry
      .map((s) => {
        const isInstalled = state.items.some((i) => i.id === s.id);
        return `
        <div class="scour-card">
          <div class="scour-card__head">
            <span class="card-badge">${escapeHtml(s.creator)}</span>
            <span class="status-badge ${isInstalled ? "status-badge--published" : "status-badge--review"}">
              ${isInstalled ? "Installed" : "Available"}
            </span>
          </div>
          <div class="scour-card__title">${escapeHtml(s.title)}</div>
          <div class="scour-card__desc">${escapeHtml(s.summary)}</div>
          <div style="font-family:var(--mono); font-size:0.68rem; color:var(--muted); margin-top:auto;">
            Archive: ${escapeHtml(s.archive)}
          </div>
          <button
            type="button"
            class="btn-curate ${isInstalled ? "" : "btn-curate--publish"}"
            data-scour-id="${escapeHtml(s.id)}"
            ${isInstalled ? "disabled" : ""}
            style="margin-top:0.4rem;"
          >
            ${isInstalled ? "Already in Archive" : "Process"}
          </button>
        </div>
      `;
      })
      .join("");

    els.scourPresetsGrid.querySelectorAll("[data-scour-id]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-scour-id");
        btn.textContent = "Processing…";
        btn.disabled = true;
        if (state.isLiveServer) {
          try {
            const res = await fetch("/api/scour", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${state.authToken}`
              },
              body: JSON.stringify({ id })
            });
            if (res.ok) {
              alert(`Successfully processed and ingested ${id}!`);
              await loadItems();
              switchTab("review");
              selectItem(id);
              return;
            }
          } catch (e) {
            alert("Process failed: " + e);
          }
        } else {
          alert(`To process in local mode, run: python3 tools/scour.py --id ${id}`);
        }
        btn.textContent = "Process";
        btn.disabled = false;
      });
    });
  }

  els.formScourUrl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = els.inputScourUrl.value.trim();
    if (!url) return;
    if (state.isLiveServer) {
      try {
        const res = await fetch("/api/scour", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.authToken}`
          },
          body: JSON.stringify({ url })
        });
        if (res.ok) {
          alert("URL successfully scoured and added to Review Queue!");
          els.inputScourUrl.value = "";
          await loadItems();
          switchTab("review");
          return;
        }
      } catch (err) {
        alert("Scour failed: " + err);
      }
    } else {
      const pat = localStorage.getItem("github_pat");
      if (pat) {
        try {
          const res = await fetch("https://api.github.com/repos/languel/mediatheque/actions/workflows/ingest.yml/dispatches", {
            method: "POST",
            headers: {
              "Accept": "application/vnd.github+json",
              "Authorization": `Bearer ${pat}`,
              "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify({
              ref: "main",
              inputs: { url: url }
            })
          });
          if (res.ok) {
            alert("Dispatched remote ingestion on GitHub Actions! The runner will download, transcode, and commit the item to main. It will appear on GitHub Pages in ~1-2 minutes.");
            els.inputScourUrl.value = "";
            return;
          } else {
            const err = await res.json().catch(() => ({}));
            alert("GitHub API error: " + (err.message || res.statusText));
          }
        } catch (err) {
          alert("Failed calling GitHub API: " + err);
        }
      } else {
        alert(`To scour from GitHub Pages, click 'GitHub Settings ⚙️' and enter your GitHub Personal Access Token, or run locally: python3 tools/scour.py --url "${url}"`);
      }
    }
  });

  // Tab Switching
  document.querySelectorAll("[data-curate-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const tab = tabBtn.getAttribute("data-curate-tab");
      switchTab(tab);
    });
  });

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll("[data-curate-tab]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-curate-tab") === tab);
    });

    if (tab === "scour") {
      els.workbenchGrid.style.display = "none";
      els.scourTabContent.style.display = "flex";
      renderScourPresets();
    } else {
      els.workbenchGrid.style.display = "grid";
      els.scourTabContent.style.display = "none";
      renderSidebarItems();
    }
  }

  // Sidebar Filter chips
  document.querySelectorAll("[data-sidebar-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-sidebar-filter]").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      state.sidebarFilter = chip.getAttribute("data-sidebar-filter");
      renderSidebarItems();
    });
  });

  els.searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    renderSidebarItems();
  });

  // Rebuild Catalog
  els.btnRebuildCatalog.addEventListener("click", async () => {
    if (state.isLiveServer) {
      els.btnRebuildCatalog.textContent = "Rebuilding…";
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (res.ok) {
        alert("Catalogs refreshed and validated!");
        await loadItems();
      }
      els.btnRebuildCatalog.textContent = "Rebuild Catalog";
    } else {
      alert("Run `python3 tools/build.py` in your terminal.");
    }
  });

  // Git Modal
  els.btnGitStatus.addEventListener("click", async () => {
    if (state.isLiveServer) {
      const res = await fetch("/api/git/status", {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        els.gitStatusPre.textContent = data.status || "(working tree clean)";
        els.modalGit.showModal();
      }
    } else {
      alert("Git integration requires local curator_server.py running.");
    }
  });

  els.btnCloseGit.addEventListener("click", () => els.modalGit.close());

  els.btnExecuteGitCommit.addEventListener("click", async () => {
    const msg = els.gitCommitMsg.value.trim() || "Curate and publish early cinema works";
    const push = document.getElementById("git-push-checkbox")?.checked ?? true;
    els.btnExecuteGitCommit.textContent = push ? "Committing & Pushing…" : "Committing…";
    els.btnExecuteGitCommit.disabled = true;
    try {
      const res = await fetch("/api/git/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({ message: msg, push: push })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert(push ? "Committed and pushed to GitHub successfully! GitHub Pages deployment will update in ~1 minute." : "Committed locally!");
        els.modalGit.close();
      } else {
        alert("Commit failed: " + (data.error || "unknown error"));
      }
    } catch (err) {
      alert("Error committing: " + err);
    } finally {
      els.btnExecuteGitCommit.textContent = "Commit & Push";
      els.btnExecuteGitCommit.disabled = false;
    }
  });

  // Direct File Upload
  const btnUpload = document.getElementById("btn-upload-file");
  const inputMediaUpload = document.getElementById("input-media-upload");
  const uploadStatusMsg = document.getElementById("upload-status-msg");

  if (btnUpload && inputMediaUpload) {
    btnUpload.addEventListener("click", async () => {
      const file = inputMediaUpload.files[0];
      if (!file) {
        alert("Please select a media file to upload first.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        alert("File exceeds maximum upload limit of 100MB.");
        return;
      }

      btnUpload.disabled = true;
      btnUpload.textContent = "Uploading & Analyzing…";
      uploadStatusMsg.textContent = `Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`;

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result.split(",")[1];
          uploadStatusMsg.textContent = "Uploading to server and running analyzers…";
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${state.authToken}`
            },
            body: JSON.stringify({
              filename: file.name,
              content_base64: base64Data,
              title: file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ")
            })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            uploadStatusMsg.textContent = `✓ Ingested as ${data.id}!`;
            alert(`File successfully uploaded and ingested as '${data.id}'!`);
            inputMediaUpload.value = "";
            await loadItems();
            switchTab("review");
            selectItem(data.id);
          } else {
            uploadStatusMsg.textContent = "Upload failed: " + (data.error || "Unknown error");
            alert("Upload error: " + (data.error || "Unknown"));
          }
        } catch (err) {
          uploadStatusMsg.textContent = "Error: " + err;
          alert("Upload failed: " + err);
        } finally {
          btnUpload.disabled = false;
          btnUpload.textContent = "Upload & Ingest";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // GitHub Cloud Settings
  const btnGithubSettings = document.getElementById("btn-github-settings");
  const modalGithub = document.getElementById("modal-github");
  const inputGithubToken = document.getElementById("input-github-token");
  const btnCloseGithubModal = document.getElementById("btn-close-github-modal");
  const btnSaveGithubToken = document.getElementById("btn-save-github-token");

  if (btnGithubSettings && modalGithub) {
    btnGithubSettings.addEventListener("click", () => {
      inputGithubToken.value = localStorage.getItem("github_pat") || "";
      modalGithub.showModal();
    });
    btnCloseGithubModal.addEventListener("click", () => modalGithub.close());
    btnSaveGithubToken.addEventListener("click", () => {
      const val = inputGithubToken.value.trim();
      if (val) {
        localStorage.setItem("github_pat", val);
        alert("GitHub Token saved to local browser storage!");
      } else {
        localStorage.removeItem("github_pat");
        alert("GitHub Token cleared.");
      }
      modalGithub.close();
    });
  }

  // Start Auth Check on Load
  checkAuthStatus();
})();
