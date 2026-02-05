
/* glossary.js — Hover tooltip glossary (Rise-friendly)
   - Matches your JSON structure:
     {
       "settings": { "caseSensitive": false, ... },
       "terms": [ { "word": "...", "definition": "...", "enabled": true, ... }, ... ]
     }
   - Expects glossary.json in the same folder as this script.
*/

(function () {
  const JSON_URL = new URL("glossary.json", document.currentScript.src).toString();

  // How much extra space to add under the tooltip so borders/shadows don't clip
  const TOOLTIP_BUFFER_PX = 28;
  // Keeps tooltip away from viewport edges
  const EDGE_MARGIN_PX = 12;

  let dataCache = null;
  let mapCache = null;

  let tooltipEl = null;
  let hideTimer = null;
  let activeAnchor = null;

  function normalize(str, caseSensitive) {
    const s = (str || "").trim();
    return caseSensitive ? s : s.toLowerCase();
  }

  function getSpacerEl() {
    // This is the element we'll include in the Rise Loader block.
    return document.getElementById("glossary-spacer");
  }

  function setSpacerHeight(px) {
    const spacer = getSpacerEl();
    if (!spacer) return;
    spacer.style.height = `${Math.max(0, px)}px`;
  }

  function resetSpacer() {
    setSpacerHeight(0);
  }

  function ensureTooltipNotClipped() {
    // In Rise, the code snippet may be in an iframe that auto-sizes based on document height.
    // If the tooltip extends past the document scroll height, its border/shadow can get clipped.
    // So we increase the document height using a spacer element.

    const spacer = getSpacerEl();
    if (!spacer || !tooltipEl || tooltipEl.style.display === "none") return;

    const tipRect = tooltipEl.getBoundingClientRect();
    const tooltipBottomInDoc = window.scrollY + tipRect.bottom;

    // Current document height
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );

    const desiredHeight = tooltipBottomInDoc + TOOLTIP_BUFFER_PX;

    if (desiredHeight > docHeight) {
      // Add just enough extra space to reach desired height
      const extraNeeded = desiredHeight - docHeight;
      const currentSpacer = parseInt(spacer.style.height || "0", 10) || 0;
      setSpacerHeight(currentSpacer + extraNeeded);
    } else {
      // If we already have extra space from a prior tooltip, keep it minimal
      // (optional: you can reset here, but keeping it avoids jumpiness when hovering multiple terms)
    }
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

    // Reset spacer so your layout doesn't keep extra blank space
    resetSpacer();
  }

  // Tooltip positioning:
  // - Prefer BELOW the term
  // - If it would overflow bottom, flip ABOVE
  // - Clamp within viewport
  function positionTooltip(anchorEl) {
    const tip = createTooltip();
    const rect = anchorEl.getBoundingClientRect();

    // Move to 0,0 first so the browser can measure it reliably
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

    // If would overflow bottom, flip ABOVE
    if (top + tipRect.height > viewBottom) {
      top = window.scrollY + rect.top - tipRect.height - EDGE_MARGIN_PX;
    }

    // Clamp vertically
    if (top < viewTop) top = viewTop;

    // Clamp horizontally
    if (left + tipRect.width > viewRight) {
      left = viewRight - tipRect.width;
    }
    if (left < viewLeft) left = viewLeft;

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function renderDefinition(termObj) {
    const def = (termObj.definition || "").trim();
    const img = (termObj.image || "").trim();
    const link = (termObj.link || "").trim();

    let html = `<div class="glossary-tooltip__def">${escapeText(def)}</div>`;

    // Optional image support (if you add image URLs later)
    if (img) {
      html += `
        <div class="glossary-tooltip__media">
          <img src="${escapeAttr(img)}" alt="" style="max-width:100%; height:auto; border-radius:6px;" />
        </div>`;
    }

    // Optional link support (if you add link URLs later)
    if (link) {
      html += `
        <div class="glossary-tooltip__link">
          <a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">Learn more</a>
        </div>`;
    }

    return html;
  }

  // Escapes plain text definitions for safety.
  // If you intentionally want HTML in definitions, tell me and I’ll enable it safely.
  function escapeText(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
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

    // 1) Position it (prefer below)
    positionTooltip(anchorEl);

    // 2) Ensure Rise doesn't crop it (grow the block if needed)
    // Run twice to account for font rendering/layout settling
    ensureTooltipNotClipped();
    setTimeout(ensureTooltipNotClipped, 50);
  }

  function attachToTermEl(termEl, termObj) {
    // Make focusable for keyboard users
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

    // Touch/click toggle (helpful on mobile)
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

  // Close tooltip on Escape and outside click
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  document.addEventListener("click", (e) => {
    if (!tooltipEl) return;
    const clickedTerm = e.target && e.target.closest && e.target.closest(".glossary-term");
    const clickedTooltip = e.target && e.target.closest && e.target.closest(".glossary-tooltip");
    if (!clickedTerm && !clickedTooltip) hideTooltip();
  });

  // Rise can load blocks dynamically; retry a few times
  function boot(retries = 10) {
    wireUp().catch((err) => console.warn("Glossary wiring failed:", err));
    if (retries <= 0) return;
    setTimeout(() => boot(retries - 1), 800);
  }

  boot();
})();
