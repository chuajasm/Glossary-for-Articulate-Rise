
/* glossary.js — Hover tooltip glossary (matches your JSON structure)
   Expects glossary.json in the same folder.
*/

(function () {
  const JSON_URL = new URL("glossary.json", document.currentScript.src).toString();

  let dataCache = null;
  let mapCache = null;

  let tooltipEl = null;
  let hideTimer = null;
  let activeAnchor = null;

  function normalize(str, caseSensitive) {
    const s = (str || "").trim();
    return caseSensitive ? s : s.toLowerCase();
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
  }

  function positionTooltip(anchorEl) {
    const tip = createTooltip();

    const rect = anchorEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Default above; if no room, go below
    let top = window.scrollY + rect.top - tipRect.height - 10;
    let left = window.scrollX + rect.left;

    if (top < window.scrollY + 10) {
      top = window.scrollY + rect.bottom + 10;
    }

    // Clamp within viewport
    const viewportWidth = document.documentElement.clientWidth;
    const maxLeft = window.scrollX + viewportWidth - tipRect.width - 10;
    left = Math.min(Math.max(left, window.scrollX + 10), maxLeft);

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function renderDefinition(termObj) {
    const def = (termObj.definition || "").trim();
    const img = (termObj.image || "").trim();
    const link = (termObj.link || "").trim();

    let html = `<div style="font-size:16px; line-height:1.4;">${escapeIfNeeded(def)}</div>`;

    if (img) {
      html += `<div style="margin-top:8px;"><img src="${escapeAttr(img)}" alt="" style="max-width:100%; height:auto; border-radius:4px;" /></div>`;
    }

    if (link) {
      html += `<div style="margin-top:8px;"><a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">Learn more</a></div>`;
    }

    return html;
  }

  // If your definitions are plain text, this prevents accidental HTML injection.
  // If you intentionally include HTML in definitions, tell me and I’ll switch to “allow HTML”.
  function escapeIfNeeded(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(text) {
    return String(text).replaceAll('"', "&quot;").replaceAll("<", "&lt;");
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
    const caseSensitive = !!(data.settings && data.settings.caseSensitive);

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

    // Now that content is in, we can measure and position
    positionTooltip(anchorEl);
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

    // Touch/click toggle (useful on mobile where hover doesn't exist)
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
      if (!termObj) return; // no match
      attachToTermEl(el, termObj);
    });
  }

  // Close tooltip on Escape and on outside click
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  document.addEventListener("click", (e) => {
    if (!tooltipEl) return;
    const clickedTerm = e.target && e.target.closest && e.target.closest(".glossary-term");
    const clickedTooltip = e.target && e.target.closest && e.target.closest(".glossary-tooltip");
    if (!clickedTerm && !clickedTooltip) hideTooltip();
  });

  // Rise and some pages load content late; retry a few times
  function boot(retries = 10) {
    wireUp().catch((err) => console.warn("Glossary wiring failed:", err));
    if (retries <= 0) return;
    setTimeout(() => boot(retries - 1), 800);
  }

  boot();
})();
