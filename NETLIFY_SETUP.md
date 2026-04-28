# Netlify Setup Guide – AZM Lending Calculator

## Option A: Drag-and-Drop (quickest)

1. **Build the published folder** (repo root):
   ```bash
   npm run build:dist
   ```
   This creates `dist/` with the root calculator (`/`), **`/afford/`**, and **`/live/`**.
2. **Go to [netlify.com](https://netlify.com)** and sign in (or create a free account).
3. **Drag only the `dist` folder** (`c:\Users\joshu\mortgage-ui\dist`) onto the Netlify drop zone—not the whole repo.
4. Netlify will deploy. In ~30 seconds you’ll get a live URL like `https://random-name-123.netlify.app`.
5. **Optional:** Rename the site in Netlify → Site settings → Change site name (e.g. `azm-calculator` → `azm-calculator.netlify.app`).

**Canonical URLs on the live site:** `/` (live pricing calculator), `/afford/` (afford funnel), `/live/` (live estimate step). Legacy paths like `/simple.html` redirect to `/live/`.

## Option B: Deploy via Git (for automatic updates)

1. **Create a GitHub repo** and push your project:
   ```bash
   cd c:\Users\joshu\mortgage-ui
   git init
   git add index.html app.js styles.css netlify.toml assets/ .netlifyignore
   git commit -m "Initial calculator deploy"
   # Create repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/mortgage-ui.git
   git push -u origin main
   ```

2. **In Netlify:** New site from Git → Connect to GitHub → choose `mortgage-ui`.
3. Netlify will detect `netlify.toml`. Build settings should be:
   - **Build command:** `npm run build:dist`
   - **Publish directory:** `dist`
4. Deploy. Future pushes to `main` will auto-deploy.

## Custom Domain (optional)

1. In Netlify: **Site settings → Domain management → Add custom domain**.
2. Enter e.g. `calc.azmlending.com`.
3. Add the CNAME record Netlify shows to your DNS.

## What Gets Deployed

- Output is **`dist/`** after `npm run build:dist`: root `index.html`, `afford/index.html`, `live/index.html`, shared `styles.css`, `embed-resize.js`, `app.js`, `afford.js`, `simple.js`, `shared-mortgage-data.js`, `assets/` (including logo)
- `netlify.toml` (config; sets build + legacy redirects to `/afford/` and `/live/`)
- Source HTML in the repo root stays for editing; **Netlify publishes `dist/` only** when the build command runs

**WordPress iframe examples:** `https://azmcalculator.netlify.app/`, `/afford/`, `/live/` — use the trailing slash or rely on Netlify redirects.

Include `embed-resize.js` in the deployed bundle (wired in HTML); it notifies the parent `window` of content height **only when the page is embedded** in another site’s iframe (`?embed=0` disables).

### Local preview (CSS + scripts work reliably)

Opening raw `.html` from disk (**`file://`**) breaks `<base href="/">` asset paths — use a static server instead:

```bash
npm run preview:dist
```

Then browse e.g. `http://localhost:4179/` and `/afford/`, `/live/`. Alternate: `npm run build:dist` then `npx serve dist`.

### WordPress: auto-resizing the iframe (`postMessage`)

1. Give your iframe an **id** (example: `azm-afford-iframe`).
2. Set **`src`** e.g. `https://azmcalculator.netlify.app/afford/` (resize script uses iframe detection; append `?embed=0` to disable resizing if needed).
3. **Avoid a large CSS `min-height` on the iframe** (for example avoid `70vh`) — that reserves empty space below the calculator and hides the footer **Get Rate** bar. Prefer `width:100%`, optional `max-width`, and `min-height:0` so the listener-driven `height` is the only constraint.

On the WordPress page, add **Custom HTML** (same page as the iframe) or **footer code** with:

```html
<script>
(function () {
  var NET = "https://azmcalculator.netlify.app"; /* no trailing slash */
  window.addEventListener("message", function (e) {
    var o = NET.replace(/\/+$/, "");
    if (String(e.origin || "").replace(/\/+$/, "") !== o) return;
    var d = e.data;
    if (!d || d.type !== "azm-embed-resize" || !(d.height > 0)) return;
    var ifr =
      document.getElementById("azm-afford-iframe") ||
      document.getElementById("azm-live-iframe") ||
      document.getElementById("azm-calc-iframe");
    if (ifr) ifr.style.height = d.height + "px";
  });
})();
</script>
```

If you change the Netlify hostname, update `NET` accordingly. Adjust `getElementById` if your iframe id differs (`azm-afford-iframe`, `azm-live-iframe`, or `azm-calc-iframe`).

### `/live/` (Live Estimate): parent wrapper on WordPress / Elementor

Grey bands and **Get Rate hiding off-screen** are often caused by **the parent**, not Netlify:

- **`min-height: 70vh` or `vh` fractions on the iframe** — reserves empty vertical space inside the iframe’s box (gray shows behind the iframe in the section).
- **A tall Elementor section** around the iframe while the iframe is short enough to reveal the footer *inside* the iframe — mismatch between section background and iframe height listener.

Use a **narrow shell**, let `postMessage` set **`iframe.style.height`** in **pixels**, and avoid locking the iframe to viewport height:

```html
<div class="azm-calc-shell" style="max-width:980px;margin:0 auto;line-height:0;">
  <iframe
    id="azm-live-iframe"
    title="AZM Live Estimate"
    src="https://azmcalculator.netlify.app/live/"
    width="980"
    height="560"
    loading="lazy"
    style="display:block;width:100%;border:0;min-height:0;height:560px;line-height:normal;">
  </iframe>
</div>
```

Then add **the same resize script** from this doc (the `window.addMessageListener` block targeting `document.getElementById("azm-live-iframe")`).

Recommended **additional CSS** in WordPress (Appearance → Customize → Additional CSS, or Elementor):

```css
/* Do not stretch the iframe to a fraction of viewport — that hides the fixed Get Rate footer */
.azm-calc-shell iframe#azm-live-iframe {
  min-height: 0 !important;
}
```

If Elementor adds extra padding below the iframe, reduce **section Bottom padding / min-height** for that row, or set that section **`min-height: 0`**.

Permission note: edits under **`azmcalculator.netlify.app`** are in **this repo**; **wrapper + CSS live on WordPress** — whoever can edit WP should paste/update the snippets above so parent layout matches `/live/` height.
