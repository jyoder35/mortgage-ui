# GitHub + Netlify Setup – Step-by-Step

Follow these steps to connect your calculator to GitHub and deploy automatically via Netlify.

---

## Prerequisites: Install Git

Git isn’t installed yet. Install it first:

1. Go to **[git-scm.com/download/win](https://git-scm.com/download/win)**
2. Download the Windows installer and run it (defaults are fine)
3. **Close and reopen** any terminal/Cursor after installing
4. Verify: open PowerShell and run `git --version` – you should see a version number

---

## Step 1: Create the GitHub Repository

1. Go to **[github.com/new](https://github.com/new)**
2. **Repository name:** `mortgage-ui` (or any name you prefer)
3. **Visibility:** Public or Private (both work with Netlify)
4. **Do NOT** check “Add a README” or “Initialize with .gitignore” – leave the form empty
5. Click **Create repository**
6. Leave the page open – you’ll need the repo URL in Step 3

---

## Step 2: Initialize and Push from Your Project

Open PowerShell or the Cursor terminal and run:

```powershell
cd c:\Users\joshu\mortgage-ui
```

```powershell
git init
```

```powershell
git add .
```

```powershell
git status
```
*(Confirm you see index.html, app.js, styles.css, assets/, netlify.toml. `node_modules` should not appear – it’s in .gitignore)*

```powershell
git commit -m "Initial deploy: AZM Lending calculator"
```

```powershell
git branch -M main
```

```powershell
git remote add origin https://github.com/YOUR_USERNAME/mortgage-ui.git
```
*(Replace `YOUR_USERNAME` with your actual GitHub username)*

```powershell
git push -u origin main
```
*(You may be prompted to sign in. Use a personal access token if 2FA is enabled.)*

---

## Step 3: Connect Netlify to GitHub

1. Go to **[app.netlify.com](https://app.netlify.com)** and sign in
2. Click **Add new site** → **Import an existing project**
3. Click **Deploy with GitHub**
4. Authorize Netlify to access your GitHub (one-time)
5. In the list of repositories, find **mortgage-ui** and click **Import**
6. Netlify will read `netlify.toml`. Settings should show:
   - **Build command:** (empty)
   - **Publish directory:** `.`
7. Click **Deploy site**
8. Wait ~30 seconds. You’ll get a live URL like `https://random-name.netlify.app`

---

## Step 4: (Optional) Rename Your Site

1. In Netlify: **Site configuration** → **General**
2. Under **Site name**, click **Change site name**
3. Enter something like `azm-calculator` → your URL becomes `azm-calculator.netlify.app`

---

## Future Updates

After this is set up, any change you make locally can go live by:

```powershell
cd c:\Users\joshu\mortgage-ui
git add .
git commit -m "Describe your change"
git push
```

Netlify will automatically detect the push and redeploy.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `git` not recognized | Restart Cursor/terminal after installing Git |
| Push rejected (auth failed) | Use a [GitHub Personal Access Token](https://github.com/settings/tokens) instead of password |
| Wrong files deploying | Check `.netlifyignore` – it excludes `node_modules` and docs |
