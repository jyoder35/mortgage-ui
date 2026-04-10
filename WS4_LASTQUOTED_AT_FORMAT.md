# WS4 (Calculator Database): `LastQuotedAt` display format

**Implemented in-repo:** `apps-script/ws4/Logger.js` (`formatQuotedWallTime_`, used for Leads `LastQuotedAt` and Quotes `Timestamp` / `QuotedAt`). Deploy with `npm run clasp:push:ws4`, then **Manage deployment** on your existing web app → **New version** (same deployment URL).

Google Sheets shows ISO strings like `2026-03-13T13:21:00-07:00` when you store `new Date().toISOString()` or similar. To write a **plain local wall time** string (no `T`, no offset), format in the **Apps Script** that updates the Leads row (same project as `logQuote` / `upsertLead`).

## Helper (add once)

```javascript
/**
 * Local wall time for the sheet / script timezone — not UTC ISO.
 * Examples: 03-13-26 13:21:00 (yy) or 03-13-2026 13:21:00 (yyyy)
 */
function formatLastQuotedAt_() {
  var tz =
    Session.getScriptTimeZone() ||
    (function () {
      try {
        return SpreadsheetApp.getActive().getSpreadsheetTimeZone();
      } catch (e) {
        return 'America/Phoenix';
      }
    })();
  return Utilities.formatDate(new Date(), tz, 'MM-dd-yy HH:mm:ss');
  // Four-digit year: use 'MM-dd-yyyy HH:mm:ss' instead.
}
```

## Apply it

Wherever you currently set `LastQuotedAt` (or the equivalent property written to the **Leads** tab), assign:

```javascript
lastQuotedAt: formatLastQuotedAt_()
```

instead of `new Date().toISOString()` (or `toJSON()`).

**Timezone note:** `Utilities.formatDate` uses the timezone you pass (script or spreadsheet). That is fixed for the deployment, not each visitor’s browser. For “Arizona office local time,” set the script or spreadsheet timezone accordingly in Google settings.

After editing, deploy a **new version** of the Web App.
