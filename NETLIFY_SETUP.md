# Netlify Setup Guide – AZM Lending Calculator

## Option A: Drag-and-Drop (quickest)

1. **Go to [netlify.com](https://netlify.com)** and sign in (or create a free account).
2. **Drag your `mortgage-ui` folder** onto the Netlify drop zone.
   - In File Explorer: navigate to `c:\Users\joshu\mortgage-ui`
   - Drag the whole folder into the browser window
3. Netlify will deploy. In ~30 seconds you’ll get a live URL like `https://random-name-123.netlify.app`.
4. **Optional:** Rename the site in Netlify → Site settings → Change site name (e.g. `azm-calculator` → `azm-calculator.netlify.app`).

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
   - **Build command:** (leave empty)
   - **Publish directory:** `.` (or leave default)
4. Deploy. Future pushes to `main` will auto-deploy.

## Custom Domain (optional)

1. In Netlify: **Site settings → Domain management → Add custom domain**.
2. Enter e.g. `calc.azmlending.com`.
3. Add the CNAME record Netlify shows to your DNS.

## What Gets Deployed

- `index.html`, `app.js`, `styles.css`, `assets/` (including logo)
- `netlify.toml` (config)
- `node_modules` and dev files are excluded via `.netlifyignore`
