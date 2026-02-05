
/* glossary.js — Hover tooltip glossary for Rise
   Requires glossary.json in the same folder.
*/

(function () {
  const GLOSSARY_URL = new URL("glossary.json", document.currentScript.src).toString();

  let glossary = null;
  let tooltipEl = null;
  let hideTimer = null;

  function createTooltip() {
    if (tooltipEl) return tooltipEl;

    tooltipEl = document.createElement("div");
    tooltipEl.className = "glossary-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.style.display = "none";
    document.body.appendChild(tooltipEl);

    // Prevent hover flicker when moving between term and tooltip
    tooltipEl.addEventListener("mouseenter", () => {
      if (hideTimer) clearTimeout(hideTimer);
    });
    tooltipEl.addEventListener("mouseleave", () => scheduleHide());

    return tooltipEl;
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, 150);
  }

  function showTooltip(termEl, htmlContent) {
    const tip = createTooltip();
    tip.innerHTML = htmlContent;
    tip.style.display = "block";

    const rect = termEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Position: above term by default, otherwise below
    let top = window.scrollY + rect.top - tipRect.height - 10;
    let left = window.scrollX + rect.left;

    if (top < window.scrollY + 10) {
      top = window.scrollY + rect.bottom + 10;
    }

    // Keep within viewport
    const maxLeft = window.scrollX + document.documentElement.clientWidth - tipRect.width - 10;
    left = Math.min(Math.max(left, window.scrollX + 10), maxLeft);

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.display = "none";
    tooltipEl.innerHTML = "";
  }

  async function loadGlossary() {
    if (glossary) return glossary;

    const res = await fetch(GLOSSARY_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load glossary.json");
    const data = await res.json();

    // Accept either:
    // 1) { "Term": "Definition", ... }
    // 2) { "terms": [ { "term": "...", "definition": "..." }, ... ] }
    if (data.terms && Array.isArray(data.terms)) {
      glossary = {};
      data.terms.forEach(item => {
        if (item.term) glossary[item.term.trim().toLowerCase()] = item.definition || "";
      });
    } else {
      glossary = {};
      Object.keys(data).forEach(k => {
        glossary[k.trim().toLowerCase()] = data[k];
      });
    }

    return glossary;
  }

  function formatDefinition(def) {
    // Escape basic HTML if it's plain text; allow simple formatting if you already included HTML.
    // If you want stricter sanitizing, tell me and I’ll lock it down.
    return typeof def === "string" ? def : "";
  }

  async function attachHandlers() {
    const terms = document.querySelectorAll(".glossary-term[data-term]");
    if (!terms.length) return;

    let dict;
    try {
      dict = await loadGlossary();
    } catch (e) {
      console.warn("Glossary load failed:", e);
      return;
    }

    terms.forEach(termEl => {
      const key = (termEl.getAttribute("data-term") || "").trim().toLowerCase();
      if (!key) return;

      const def = dict[key];
      if (!def) return; // no definition found, do nothing

      termEl.setAttribute("tabindex", "0"); // keyboard focusable
      termEl.setAttribute("aria-describedby", ""); // optional

      const html = formatDefinition(def);

      termEl.addEventListener("mouseenter", () => {
        if (hideTimer) clearTimeout(hideTimer);
        showTooltip(termEl, html);
      });

      termEl.addEventListener("mouseleave", () => scheduleHide());

      termEl.addEventListener("focus", () => {
        showTooltip(termEl, html);
      });

      termEl.addEventListener("blur", () => scheduleHide());
    });

    // Click anywhere else closes tooltip (helpful in Rise)
    document.addEventListener("click", (e) => {
      if (!tooltipEl) return;
      const isTerm = e.target && e.target.closest && e.target.closest(".glossary-term");
      const isTooltip = e.target && e.target.closest && e.target.closest(".glossary-tooltip");
      if (!isTerm && !isTooltip) hideTooltip();
    });
  }

  // Rise can load content dynamically, so we try multiple times briefly.
  function bootWithRetries(retries = 10) {
    attachHandlers();
    if (retries <= 0) return;
    setTimeout(() => bootWithRetries(retries - 1), 800);
  }

  bootWithRetries();
})();
