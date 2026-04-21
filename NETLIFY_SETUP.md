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

- Output is **`dist/`** after `npm run build:dist`: root `index.html`, `afford/index.html`, `live/index.html`, shared `styles.css`, `app.js`, `afford.js`, `simple.js`, `shared-mortgage-data.js`, `assets/` (including logo)
- `netlify.toml` (config; sets build + legacy redirects to `/afford/` and `/live/`)
- Source HTML in the repo root stays for editing; **Netlify publishes `dist/` only** when the build command runs

**WordPress iframe examples:** `https://YOUR_SITE.netlify.app/`, `…/afford/`, `…/live/` — use the trailing slash or rely on Netlify redirects.
