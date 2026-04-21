# Google Apps Script (clasp)

Apps Script projects for this repo:

| Folder | Backend | Used in UI as |
|--------|---------|----------------|
| [ws1](./ws1/) | Base rate / no-LLPA (planned) | `afford.js` `PLACEHOLDER_RATE` → WS1 URL (TBD) |
| [ws2](./ws2/) | Live pricing web app | `WS2_PRICE` in `app.js` / `simple.js` |
| [ws4](./ws4/) | Logger / Calculator Database / email quote | `WS4_LOG` |

## One-time setup

1. Enable **Google Apps Script API**: [script.google.com/home/usersettings](https://script.google.com/home/usersettings).

2. From repo root: `npm install` then `npm run clasp:login`.

3. **Per project**, copy the example config and add the Script ID (from each script’s **Project settings**):

   ```text
   apps-script/ws1/.clasp.json.example  →  apps-script/ws1/.clasp.json
   apps-script/ws2/.clasp.json.example  →  apps-script/ws2/.clasp.json
   apps-script/ws4/.clasp.json.example  →  apps-script/ws4/.clasp.json
   ```

4. Pull Google → disk:

   ```bash
   npm run clasp:pull:ws1
   npm run clasp:pull:ws2
   npm run clasp:pull:ws4
   ```

## Commands (from repo root)

| Command | Project |
|---------|---------|
| `npm run clasp:pull:ws1` / `clasp:push:ws1` | WS1 (base rate) |
| `npm run clasp:pull:ws2` / `clasp:push:ws2` | Pricing |
| `npm run clasp:pull:ws4` / `clasp:push:ws4` | Logger / DB |
| `npm run clasp:open:ws1` / `clasp:open:ws2` / `clasp:open:ws4` | Open in browser editor |
| `npm run clasp:status:ws1` / … | Files to push |
| `npm run clasp:logs:ws1` / … | Recent logs |

`clasp:login` is global for your machine (run once).

After `clasp:push`, web app behavior updates when you use a **new deployment** (or redeploy) in Apps Script, same as before.
