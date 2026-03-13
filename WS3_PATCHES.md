# WS3 (Leads DB & Monitoring) Patches

**Re-reviewed:** `upsertLead_` and `saveQuoteForLead_` are important for WS3 and should be kept. The router handlers `action=upsertLead` and `action=saveQuote` remain in place.

---

## Only change: Add getLead_ to leads_repo.gs

The router's `action=getlead` calls `getLead_(q)` but that function does not exist in leads_repo. `upsertLead_` does **not** substitute: it's a write (insert/update) that returns `{ leadToken, rowIndex, updated }`. `getLead_` is a **read** (lookup by token/email) that returns the full lead object. Different purposes.

Add this after `findLeadRow_` in leads_repo.gs:

```javascript
/** Look up a lead by leadToken and/or email (Past Client DB). Returns null if not found. */
function getLead_(query) {
  const sh = getLeadsSheet_();
  const hit = findLeadRow_(sh, {
    leadToken: query.leadToken,
    email: query.email || query['Primary Borrower Email']
  });
  if (!hit) return null;
  return rowToObj_(hit.row, LEADS_HEADERS);
}
```

---

## Summary (unchanged in WS3)

| Item | Status |
|------|--------|
| upsertLead router handler | Keep |
| saveQuote router handler | Keep |
| upsertLead_ | Keep |
| saveQuoteForLead_ | Keep |
| getLead_ | **Add** (required by getlead handler) |
