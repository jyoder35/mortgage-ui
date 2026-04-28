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
