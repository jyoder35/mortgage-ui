// ---- utils_math_core.gs ----
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function round2_(n){ return Math.round(Number(n) * 100) / 100; }
function round3_(n){ return Math.round(Number(n) * 1000) / 1000; }
function round6_(n){ return Math.round(Number(n) * 1000000) / 1000000; }

function pmntMonthly_(ratePctAnnual, nMonths, principal) {
  const r = Number(ratePctAnnual) / 100 / 12;
  if (!isFinite(r) || r === 0) return principal / nMonths;
  return principal * (r * Math.pow(1 + r, nMonths)) / (Math.pow(1 + r, nMonths) - 1);
}

function monthlyTotals_(noteRatePct, totalLoan, termMonths, taxesAnnual, insAnnual, hoaMonthly, miAnnualPct){
  const pi = pmntMonthly_(noteRatePct, termMonths, totalLoan);
  const tax = (Number(taxesAnnual)||0) / 12;
  const ins = (Number(insAnnual)||0) / 12;
  const hoa = Number(hoaMonthly)||0;
  const mi  = (Number(miAnnualPct)||0) / 100 * totalLoan / 12;
  const total = pi + tax + ins + hoa + mi;
  return { pi: round2_(pi), tax: round2_(tax), ins: round2_(ins), hoa: round2_(hoa), mi: round2_(mi), total: round2_(total) };
}

// ---------- band parsers ----------
function parseLtvBand_(label){
  const s = String(label).trim();
  const m  = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const m2 = s.match(/[\u2264<=]?\s*(\d+(?:\.\d+)?)/);
  if (m)  return { lo:Number(m[1]), hi:Number(m[2]) };
  if (m2) return { lo:0, hi:Number(m2[1]) };
  return { lo:0, hi:100 };
}
function parseFicoBandFlexible_(label){
  const s = String(label).replace(/FICO/i,'').trim();
  const ge = s.match(/[\u2265>=]\s*(\d+)/);
  const le = s.match(/[\u2264<=]\s*(\d+)/);
  const rr = s.match(/(\d+)\s*-\s*(\d+)/);
  if (ge) return { lo:Number(ge[1]), hi:900 };
  if (le) return { lo:0,             hi:Number(le[1]) };
  if (rr) return { lo:Number(rr[1]), hi:Number(rr[2]) };
  return { lo:0, hi:900 };
}

/** Ascending bands span locator (robust at edges). Returns [i0,i1,alpha]. */
function locateSpan_(bands, x){
  if (!Array.isArray(bands) || bands.length === 0) return [0,0,0];
  const n = bands.length;

  // If x is inside a band, return that band (no interpolation).
  for (let i=0; i<n; i++){
    const b = bands[i];
    if (x >= b.lo && x <= b.hi) return [i,i,0];
  }

  // If x is below the first band, clamp to first
  if (x < bands[0].lo) return [0,0,0];

  // If x is above the last band, clamp to last
  if (x > bands[n-1].hi) return [n-1,n-1,0];

  // Otherwise bracket between nearest consecutive bands
  for (let i=1; i<n; i++){
    const b0 = bands[i-1], b1 = bands[i];
    if (x > b0.hi && x < b1.lo){
      const span = Math.max(1, (b1.lo - b0.hi));
      const alpha = (x - b0.hi) / span;
      return [i-1, i, Math.max(0, Math.min(1, alpha))];
    }
  }

  // Fallback (should not hit if bands cover 0..900 and we clamped)
  return [n-1,n-1,0];
}

function findRowIndex_(rows, regex){
  for (let i=0;i<rows.length;i++){
    const s = String(rows[i][0] || '').trim();
    if (regex.test(s)) return i;
  }
  return -1;
}
