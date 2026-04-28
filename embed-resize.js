/**
 * Iframe resize helper: notifies parent window of accurate document height (e.g. myazm.com).
 * Parent MUST verify message origin matches your Netlify URL.
 *
 * When embedded: sets html class so body does not stretch to fill the iframe (removes gray dead zone).
 *
 * Enabled in iframe unless ?embed=0.
 */
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch (_) {
      inIframe = true;
    }
    if (params.get("embed") === "0") return;
    if (!inIframe) return;

    document.documentElement.classList.add("azm-iframe-embed");

    /**
     * Height for postMessage — anchored to scrollable columns (<main>),
     * ignores position:fixed (footer/toast). Clamps when html scrollHeight is
     * artificially larger than visible layout (common /live iframe issue).
     */
    function measuredHeightPx() {
      const scrollY = window.scrollY || 0;
      const b = document.body;
      if (!b) return 480;

      let mainBottom = 0;
      document.querySelectorAll("main.container.app").forEach((main) => {
        if (window.getComputedStyle(main).display === "none") return;
        const r = main.getBoundingClientRect();
        mainBottom = Math.max(mainBottom, Math.ceil(r.bottom + scrollY));
      });

      let flowBottom = 0;
      for (let i = 0; i < b.children.length; i++) {
        const node = b.children[i];
        if (!(node instanceof Element)) continue;
        const cs = window.getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (cs.position === "fixed") continue;
        const r = node.getBoundingClientRect();
        flowBottom = Math.max(flowBottom, Math.ceil(r.bottom + scrollY));
      }

      const scrollH = Math.ceil(
        Math.max(
          document.documentElement.scrollHeight,
          b.scrollHeight || 0,
          b.offsetHeight || 0
        )
      );

      const anchored = Math.max(mainBottom, flowBottom);
      let h =
        anchored > 80 ? anchored + 8 : scrollH;
      /* html/body min-height quirks can inflate scrollH — trust layout anchors when sane. */
      if (anchored > 80 && scrollH > anchored + 32) {
        h = anchored + 8;
      }
      return Math.max(Math.ceil(h), 200);
    }

    let debounceTimer;

    /** Call from app code after SPA-style view swaps (simple.js panels, etc.). */
    function notifyNow() {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      const vp = window.innerHeight || 600;
      window.parent.postMessage(
        {
          type: "azm-embed-resize",
          height: measuredHeightPx(),
          viewportHeight: vp,
        },
        "*"
      );
    }

    window.__azmIframeNotifyHeight = notifyNow;

    function schedule() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(notifyNow, 120);
    }

    window.addEventListener("load", schedule);

    window.addEventListener(
      "resize",
      () => {
        schedule();
      },
      { passive: true }
    );

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => schedule());
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
      /** Live / afford: shrink when switching form ↔ results (#simpleMain grows). */
      const mainRoots = document.querySelectorAll(
        "#simpleMain, #affordFormView, #affordResultsView, #resultsPanel"
      );
      mainRoots.forEach((el) => ro.observe(el));
    }

    notifyNow();
    setTimeout(() => notifyNow(), 280);
    setTimeout(() => notifyNow(), 900);
    setTimeout(() => notifyNow(), 1800);
  } catch (_) {
    /* ignore */
  }
})();
