# WS1 — base rate / no-LLPA service (planned)

Used for **affordability** and other flows that need a **live** 0-pt baseline without borrower LLPAs. The static site calls the deployed web app `?action=rates` (see `WS1_RATES_URL` in `afford.js`).

1. Copy `.clasp.json.example` → `.clasp.json` and set **Script ID** from this project’s Apps Script **Project settings**.
2. From repo root: `npm run clasp:pull:ws1` then edit `.gs` / `.js` files here.
3. Push: `npm run clasp:push:ws1`
