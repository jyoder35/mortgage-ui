# Google Apps Script (clasp)

Two projects match the calculator:

| Folder | Backend | Used in `app.js` as |
|--------|---------|----------------------|
| [ws2](./ws2/) | Live pricing web app | `WS2_PRICE` |
| [ws4](./ws4/) | Logger / Calculator Database / email quote | `WS4_LOG` |

## One-time setup

1. Enable **Google Apps Script API**: [script.google.com/home/usersettings](https://script.google.com/home/usersettings).

2. From repo root: `npm install` then `npm run clasp:login`.

3. **Per project**, copy the example config and add the Script ID (from each script’s **Project settings**):

   ```text
   apps-script/ws2/.clasp.json.example  →  apps-script/ws2/.clasp.json
   apps-script/ws4/.clasp.json.example  →  apps-script/ws4/.clasp.json
   ```

4. Pull Google → disk:

   ```bash
   npm run clasp:pull:ws2
   npm run clasp:pull:ws4
   ```

## Commands (from repo root)

| Command | Project |
|---------|---------|
| `npm run clasp:pull:ws2` / `clasp:push:ws2` | Pricing |
| `npm run clasp:pull:ws4` / `clasp:push:ws4` | Logger / DB |
| `npm run clasp:open:ws2` / `clasp:open:ws4` | Open in browser editor |
| `npm run clasp:status:ws2` / `clasp:status:ws4` | Files to push |
| `npm run clasp:logs:ws2` / `clasp:logs:ws4` | Recent logs |

`clasp:login` is global for your machine (run once).

After `clasp:push`, web app behavior updates when you use a **new deployment** (or redeploy) in Apps Script, same as before.
