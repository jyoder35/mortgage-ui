/**
 * Iframe resize helper: sends document height to parent (e.g. myazm.com).
 * Parent MUST verify message origin is your Netlify URL before resizing.
 *
 * Enabled when: ?embed=1 on the iframe src, or embedded in iframe (unless ?embed=0).
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
    /** Opt out only; iframe presence alone turns this on (?embed=0 to disable). */
    if (params.get("embed") === "0") return;
    if (!inIframe) return;

    function measuredHeightPx() {
      const e = document.documentElement;
      const b = document.body;
      const hEl = e
        ? Math.max(e.scrollHeight, e.offsetHeight, e.clientHeight || 0)
        : 0;
      const hBody = b
        ? Math.max(b.scrollHeight, b.offsetHeight, b.scrollHeight || 0)
        : 0;
      const raw = Math.ceil(Math.max(hEl, hBody));
      const vp = window.innerHeight || 600;
      const floorVp = vp * 1; /* hint: ~minimum one viewport tall */
      return Math.max(raw, Math.ceil(floorVp));
    }

    let debounceTimer;
    function sendOnce() {
      const height = measuredHeightPx();
      const vp = window.innerHeight || 600;
      window.parent.postMessage(
        {
          type: "azm-embed-resize",
          height,
          viewportHeight: vp,
          hintMaxVp: Math.ceil(vp * 1.8),
        },
        "*"
      );
    }

    function schedule() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendOnce, 80);
    }

    window.addEventListener("load", schedule);
    window.addEventListener("resize", schedule);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => schedule());
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }

    schedule();
    setTimeout(sendOnce, 400);
    setTimeout(sendOnce, 1400);
  } catch (_) {
    /* ignore */
  }
})();
