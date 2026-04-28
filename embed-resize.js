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

    function measuredHeightPx() {
      const e = document.documentElement;
      const b = document.body;
      if (!e || !b) return 480;
      const h = Math.ceil(
        Math.max(
          e.scrollHeight,
          e.getBoundingClientRect().height || 0,
          b.scrollHeight,
          b.offsetHeight
        )
      );
      return Math.max(h, 240);
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
    }

    notifyNow();
    setTimeout(() => notifyNow(), 280);
    setTimeout(() => notifyNow(), 900);
    setTimeout(() => notifyNow(), 1800);
  } catch (_) {
    /* ignore */
  }
})();
