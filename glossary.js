
/* glossary.js — Hover tooltip glossary (Rise-friendly)
   - Reads glossary.json in same folder
   - Matches your JSON structure:
     {
       "settings": { "caseSensitive": false, ... },
       "terms": [ { "word": "...", "definition": "...", "enabled": true, ... }, ... ]
     }

   Fixes Rise tooltip clipping by adding temporary bottom padding when tooltip is shown.
*/

(function () {
  const JSON_URL = new URL("glossary.json", document.currentScript.src).toString();

  // How close tooltip can get to viewport edges
  const EDGE_MARGIN_PX = 12;

  // Extra space to ensure border + shadow never gets clipped
  const CLIP_BUFFER_PX = 36;

  let dataCache = null;
  let mapCache = null;

  let tooltipEl = null;
  let hideTimer = null;
  let activeAnchor = null;

  let originalBodyPaddingBottom = null;

  function normalize(str, caseSensitive) {
    const s = (str || "").trim();
    return caseSensitive ? s : s.toLowerCase();
  }

  function ensureOriginalPaddingCaptured() {
    if (originalBodyPaddingBottom !== null) return;
    const cs = window.getComputedStyle(document.body);
    originalBodyPaddingBottom = cs.paddingBottom || "0px";
  }

  function setBodyPaddingBottom(px) {
    ensureOriginalPaddingCaptured();
    document.body.style.paddingBottom = `calc(${originalBodyPaddingBottom} + ${px}px)`;
  }

  function resetBodyPaddingBottom() {
    if (originalBodyPaddingBottom === null) return;
    document.body.style.paddingBottom = originalBodyPaddingBottom;
  }

  function createTooltip() {
    if (tooltipEl) return tooltipEl;

    tooltipEl = document.createElement("div");
    tooltipEl.className = "glossary-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.style.display = "none";
    tooltipEl.style.position = "absolute";
    tooltipEl.style.zIndex = "9999";

    // Prevent flicker when moving between term and tooltip
    tooltipEl.addEventListener("mouseenter", () => {
      if (hideTimer) clearTimeout(hideTimer);
    });
    tooltipEl.addEventListener("mouseleave", scheduleHide);

    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, 120);
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.display = "none";
    tooltipEl.innerHTML = "";
    activeAnchor = null;

    // ✅ remove extra space added for clipping protection
    resetBodyPaddingBottom();
  }

  // Prefer BELOW the term; flip ABOVE only if it would overflow bottom.
  function positionTooltip(anchorEl) {
    const tip = createTooltip();
    const rect = anchorEl.getBoundingClientRect();

    // Measure tooltip reliably
    tip.style.top = "0px";
    tip.style.left = "0px";
    const tipRect = tip.getBoundingClientRect();

    const viewTop = window.scrollY + EDGE_MARGIN_PX;
    const viewLeft = window.scrollX + EDGE_MARGIN_PX;
    const viewBottom = window.scrollY + document.documentElement.clientHeight - EDGE_MARGIN_PX;
    const viewRight = window.scrollX + document.documentElement.clientWidth - EDGE_MARGIN_PX;

    // Prefer BELOW
    let top = window.scrollY + rect.bottom + EDGE_MARGIN_PX;
    let left = window.scrollX + rect.left;

    // Flip ABOVE if would overflow bottom
    if (top + tipRect.height > viewBottom) {
      top = window.scrollY + rect.top - tipRect.height - EDGE_MARGIN_PX;
    }

    // Clamp vertical
    if (top < viewTop) top = viewTop;

    // Clamp horizontal
    if (left + tipRect.width > viewRight) left = viewRight - tipRect.width;
    if (left < viewLeft) left = viewLeft;

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  // ✅ Add bottom padding if tooltip would extend beyond document height (prevents Rise crop)
  function preventClipping() {
    if (!tooltipEl || tooltipEl.style.display === "none") return;

    const tipRect = tooltipEl.getBoundingClientRect();
    const tooltipBottomInDoc = window.scrollY + tipRect.bottom;

    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );

    const desired = tooltipBottomInDoc + CLIP_BUFFER_PX;
    const extraNeeded = desired - docHeight;

    if (extraNeeded > 0) {
      setBodyPaddingBottom(extraNeeded);
    } else {
      // Keep it tight if not needed
      setBodyPaddingBottom(0);
    }
  }

  function renderDefinition(termObj) {
    const def = (termObj.definition || "").trim();
    return `<div class="glossary-tooltip__def">${escapeText(def)}</div>`;
  }

  // Escapes definitions as plain text for safety
  function escapeText(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadData() {
    if (dataCache) return dataCache;

    const res = await fetch(JSON_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load glossary.json (${res.status})`);
    dataCache = await res.json();
    return dataCache;
  }

  async function buildMap() {
    if (mapCache) return mapCache;

    const data = await loadData();
    const caseSensitive =
      !!(data.settings && typeof data.settings.caseSensitive === "boolean"
        ? data.settings.caseSensitive
        : false);

    const map = new Map();
    const terms = Array.isArray(data.terms) ? data.terms : [];

    terms.forEach((t) => {
      if (!t) return;
      if (t.enabled === false) return;

      const key = normalize(t.word, caseSensitive);
      if (!key) return;

      map.set(key, t);
    });

    mapCache = { map, caseSensitive };
    return mapCache;
  }

  function showTooltip(anchorEl, termObj) {
    const tip = createTooltip();
    tip.innerHTML = renderDefinition(termObj);
    tip.style.display = "block";
    activeAnchor = anchorEl;

    positionTooltip(anchorEl);

    // Run twice for layout settling (fonts, line wraps)
    preventClipping();
    setTimeout(preventClipping, 60);
  }

  function attachToTermEl(termEl, termObj) {
    // keyboard focusable
    if (!termEl.hasAttribute("tabindex")) termEl.setAttribute("tabindex", "0");

    termEl.addEventListener("mouseenter", () => {
      if (hideTimer) clearTimeout(hideTimer);
      showTooltip(termEl, termObj);
    });

    termEl.addEventListener("mouseleave", scheduleHide);

    termEl.addEventListener("focus", () => {
      showTooltip(termEl, termObj);
    });

    termEl.addEventListener("blur", scheduleHide);

    // mobile tap/click toggle
    termEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeAnchor === termEl && tooltipEl && tooltipEl.style.display === "block") {
        hideTooltip();
      } else {
        showTooltip(termEl, termObj);
      }
    });
  }

  async function wireUp() {
    const { map, caseSensitive } = await buildMap();

    const nodes = document.querySelectorAll(".glossary-term[data-term]");
    nodes.forEach((el) => {
      const raw = el.getAttribute("data-term") || "";
      const key = normalize(raw, caseSensitive);

      const termObj = map.get(key);
      if (!termObj) return;

      attachToTermEl(el, termObj);
    });
  }

  // Close on Escape and outside click
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  document.addEventListener("click", (e) => {
    if (!tooltipEl) return;
    const clickedTerm = e.target && e.target.closest && e.target.closest(".glossary-term");
    const clickedTooltip = e.target && e.target.closest && e.target.closest(".glossary-tooltip");
    if (!clickedTerm && !clickedTooltip) hideTooltip();
  });

  // Rise loads content dynamically; retry a few times
  function boot(retries = 10) {
    wireUp().catch((err) => console.warn("Glossary wiring failed:", err));
    if (retries <= 0) return;
    setTimeout(() => boot(retries - 1), 800);
  }

  boot();
})();
