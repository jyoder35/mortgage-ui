// ---- llpa_matrix_loader.gs (discrete lookup; self-contained robust parsers) ----
//
// What this module does:
//   • Parse LLPA sections (Purchase / Rate/Term / Cash Out) into {columns, ficoBands, table}.
//   • Pick the single cell that contains (LTV, FICO) — no interpolation.
//   • Read FHA/VA FICO adjusters via pickAdjusterFromBandsDiscrete_().
//   • DSCR: loadDscrFromLlpaDiscrete_ + dscrPoints_ (Ratio / Adjusters / Loan Amount / PPP).
//
// Requires project globals: PRICING_SHEET_ID, TAB_LLPA (config.gs).
//
// Why this replacement?
//   • Avoids reliance on external parsers by including robust local parsers that handle:
//       - "LTV " prefix, ASCII >=/<=, Unicode ≥/≤, ranges with hyphen or en-dash, optional %.
//       - "FICO " prefix on row labels.
//   • Prevents the 0–100 / 0–900 fallbacks that collapse the grid.

/////////////////////
// Public surface  //
/////////////////////

function llpaPoints_(ctx) {
  const src = loadLlpaSourceDiscrete_();
  const prog = String(ctx.program || '').toUpperCase();
  const txn = normalizeTxnLocal_(String(ctx.txn || 'PURCHASE'));

  if (prog.startsWith('CONV')) {
    const grid =
      txn === 'CASHOUT' ? src.cashout : txn === 'RTREFI' ? src.rt : src.purchase;
    const pts = grid ? llpaPickDiscrete_(grid, Number(ctx.ltvPct), Number(ctx.fico)) : 0;
    return { points: pts, explain: { base: round3Local_(pts), adders: { total: 0, list: [] } } };
  }

  if (prog === 'FHA30' && src.fhaAdj) {
    const pts = pickAdjusterFromBandsDiscrete_(src.fhaAdj, Number(ctx.fico));
    return { points: pts, explain: { fhaFicoAdj: round3Local_(pts) } };
  }
  if (prog === 'VA30' && src.vaAdj) {
    const pts = pickAdjusterFromBandsDiscrete_(src.vaAdj, Number(ctx.fico));
    return { points: pts, explain: { vaFicoAdj: round3Local_(pts) } };
  }
  return { points: 0, explain: {} };
}

function dscrPoints_(ctx) {
  var src = loadDscrFromLlpaDiscrete_();
  var ltv = Number(ctx.ltvPct || 0);
  var fico = Number(ctx.fico || 0);
  var txn = normalizeTxnLocal_(String(ctx.txn || 'PURCHASE'));
  var dscr = Number(ctx.dscr || 1.25);
  var loanAmt = Number(ctx.loan != null ? ctx.loan : ctx.loanAmount != null ? ctx.loanAmount : 0);

  var basePts = llpaPickDiscrete_(src.grid, ltv, fico);
  var cashoutPts =
    txn === 'CASHOUT' && src.cashout ? pickByLtvDiscrete_(src.cashout.byLtv, ltv) : 0;

  var tierKey = '>= 1.25';
  if (dscr < 1.25) tierKey = '1.00-1.2499';
  var tierRow = src.tiers[tierKey] || src.tiers[tierKey === '1.00-1.2499' ? '1.00-1.24' : '>=1.25'];
  var tierPts = tierRow ? pickByLtvDiscrete_(tierRow.byLtv, ltv) : 0;

  var opt = src.optionalRows || {};
  var mu = 0,
    co = 0,
    io = 0;
  if (ctx.multiunit && opt.multiunit) mu = pickByLtvDiscrete_(opt.multiunit.byLtv, ltv);
  if (ctx.condo && opt.condo) co = pickByLtvDiscrete_(opt.condo.byLtv, ltv);
  if (ctx.interestOnly && opt.interestOnly) io = pickByLtvDiscrete_(opt.interestOnly.byLtv, ltv);

  var loanPts = pickLoanAmountAdj_(src.loanAmountBands || [], loanAmt);
  var pppPts = pickPppAdj_(src.pppByLabel || {}, ctx.ppp != null ? ctx.ppp : ctx.prepaymentPenalty);

  var total = Number(basePts + cashoutPts + tierPts + mu + co + io + loanPts + pppPts);
  return {
    points: total,
    explain: {
      baseGrid: round3Local_(basePts),
      cashOutAdj: round3Local_(cashoutPts),
      dscrTier: { tier: tierKey, points: round3Local_(tierPts) },
      multiunit: round3Local_(mu),
      condo: round3Local_(co),
      interestOnly: round3Local_(io),
      loanAmount: round3Local_(loanPts),
      ppp: round3Local_(pppPts),
    },
  };
}

/////////////////////
//   Load & Parse  //
/////////////////////

function loadLlpaSourceDiscrete_() {
  const sh = SpreadsheetApp.openById(PRICING_SHEET_ID).getSheetByName(TAB_LLPA);
  if (!sh) throw new Error('Missing LLPA tab: ' + TAB_LLPA);
  const v = sh.getDataRange().getValues();

  const iPurchase = findRowIndexLocal_(v, /^Purchase$/i);
  const iRT = findRowIndexLocal_(v, /^Rate\s*\/?\s*Term$/i);
  const iCashout = findRowIndexLocal_(v, /^Cash\s*Out$/i);
  const iFhaAdj = findRowIndexLocal_(v, /^FHA\s*FICO$/i);
  const iVaAdj = findRowIndexLocal_(v, /^VA\s*FICO$/i);

  const purchase = iPurchase >= 0 ? parseLlpaSectionDiscrete_(v, iPurchase) : null;
  const rt = iRT >= 0 ? parseLlpaSectionDiscrete_(v, iRT) : null;
  const cashout = iCashout >= 0 ? parseLlpaSectionDiscrete_(v, iCashout) : null;
  const fhaAdj = iFhaAdj >= 0 ? parseAdjusterBlockDiscrete_(v, iFhaAdj) : null;
  const vaAdj = iVaAdj >= 0 ? parseAdjusterBlockDiscrete_(v, iVaAdj) : null;

  return { purchase: purchase, rt: rt, cashout: cashout, fhaAdj: fhaAdj, vaAdj: vaAdj };
}

function parseLlpaSectionDiscrete_(rows, startIdx) {
  const hdrRow = rows[startIdx + 1];
  const ltvLabels = hdrRow
    .slice(1)
    .map(function (c) {
      return String(c).trim();
    })
    .filter(function (s) {
      return s !== '';
    });
  const columns = ltvLabels.map(parseLtvBandLocal_);

  const data = [];
  let i = startIdx + 2;
  for (; i < rows.length; i++) {
    const lab = String(rows[i][0] || '').trim();

    if (!lab) continue;

    if (/^(Purchase|Rate\s*\/?\s*Term|Cash\s*Out|FHA|VA|DSCR|PPP)/i.test(lab)) {
      break;
    }

    const vals = rows[i].slice(1).map(Number);
    data.push({
      label: lab,
      band: parseFicoBandLocal_(lab),
      vals: vals,
    });
  }
  const ficoBands = data.map(function (r) {
    return r.band;
  });
  const table = data.map(function (r) {
    return r.vals;
  });
  return { columns: columns, ficoBands: ficoBands, table: table };
}

function parseAdjusterBlockDiscrete_(rows, startIdx) {
  const out = [];
  let i = startIdx + 1;
  for (; i < rows.length; i++) {
    const lab = String(rows[i][0] || '').trim();
    if (!lab) break;
    if (
      /^(Purchase|Rate\s*\/?\s*Term|Cash\s*Out|FHA\s*FICO|VA\s*FICO|DSCR\s*Ratio|DSCR\s*Adjusters|DSCR\s*Loan\s*Amount|PPP|DSCR)$/i.test(
        lab
      ) &&
      i > startIdx + 1
    ) {
      break;
    }
    const pts = Number(rows[i][1] || 0);
    out.push({ band: parseFicoBandLocal_(lab), pts: pts });
  }
  return out;
}

/** LTV map from zipLtvValsLocal_: keys "lo-hi" fixed decimals */
function pickByLtvDiscrete_(byLtvMap, ltv) {
  if (!byLtvMap || typeof byLtvMap !== 'object') return 0;
  const keys = Object.keys(byLtvMap);
  const x = Number(ltv);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var parts = key.split('-');
    if (parts.length !== 2) continue;
    var lo = Number(parts[0]);
    var hi = Number(parts[1]);
    if (x >= lo && x <= hi) return Number(byLtvMap[key] || 0);
  }
  var best = 0;
  var bestD = 1e9;
  for (var j = 0; j < keys.length; j++) {
    var key2 = keys[j];
    var p2 = key2.split('-');
    if (p2.length !== 2) continue;
    var lo2 = Number(p2[0]);
    var hi2 = Number(p2[1]);
    var c = (lo2 + hi2) / 2;
    var d = Math.abs(x - c);
    if (d < bestD) {
      bestD = d;
      best = Number(byLtvMap[key2] || 0);
    }
  }
  return best;
}

function skipBlankRowsDscr_(v, i) {
  var j = i;
  while (j < v.length && !String(v[j][0] || '').trim()) j++;
  return j;
}

/** Column A = loan amount band; column B = points (single number). */
function parseLoanAmountBandLocal_(label) {
  var s = String(label).trim();
  var m = s.match(/^(\d+)\s*[-–]\s*(\d+)\s*$/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  m = s.match(/^(?:>=|≥)\s*(\d+)\s*$/);
  if (m) return { lo: Number(m[1]), hi: 1e15 };
  return null;
}

function pickLoanAmountAdj_(bandList, loanAmount) {
  if (!bandList || !bandList.length) return 0;
  var L = Number(loanAmount) || 0;
  for (var i = 0; i < bandList.length; i++) {
    var b = bandList[i].band;
    if (!b) continue;
    if (L >= b.lo && L <= b.hi) return Number(bandList[i].pts) || 0;
  }
  var best = 0;
  var bestD = 1e9;
  for (var j = 0; j < bandList.length; j++) {
    var b2 = bandList[j].band;
    if (!b2) continue;
    var c = (b2.lo + b2.hi) / 2;
    var d = Math.abs(L - c);
    if (d < bestD) {
      bestD = d;
      best = Number(bandList[j].pts) || 0;
    }
  }
  return best;
}

/** Normalize PPP row labels for lookup (matches "5 year", "none", etc.). */
function normalizePppLabel_(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*-\s*year/g, '$1 year');
}

function pickPppAdj_(pppByLabel, requested) {
  if (!pppByLabel || typeof pppByLabel !== 'object') return 0;
  var key = normalizePppLabel_(requested);
  if (!key) return 0;
  if (Object.prototype.hasOwnProperty.call(pppByLabel, key)) return Number(pppByLabel[key]) || 0;
  var alt = key.replace(/-/g, ' ');
  if (Object.prototype.hasOwnProperty.call(pppByLabel, alt)) return Number(pppByLabel[alt]) || 0;
  return 0;
}

function loadDscrFromLlpaDiscrete_() {
  var sh = SpreadsheetApp.openById(PRICING_SHEET_ID).getSheetByName(TAB_LLPA);
  if (!sh) throw new Error('Missing LLPA tab: ' + TAB_LLPA);
  var v = sh.getDataRange().getValues();

  var idxDscr = findRowIndexLocal_(v, /^DSCR$/i);
  if (idxDscr < 0) throw new Error('Could not find "DSCR" section in LLPA tab');

  var hdr = v[idxDscr + 1].slice(1).map(function (c) {
    return String(c).trim();
  });
  var columns = hdr.map(parseLtvBandLocal_);

  var dataRows = [];
  var i = idxDscr + 2;
  for (; i < v.length; i++) {
    var lab = String(v[i][0] || '').trim();
    if (!lab) break;
    if (/^DSCR\s*Ratio$/i.test(lab)) break;
    if (/^DSCR\s*Adjusters$/i.test(lab)) break;
    if (/^DSCR\s*Loan\s*Amount$/i.test(lab)) break;
    if (/^Cash\s*Out\s*Adj$/i.test(lab)) break;
    if (/^DSCR\s*1\.00\s*-\s*1\.24$/i.test(lab)) break;
    if (/^DSCR\s*(?:>=|≥)\s*1\.25$/i.test(lab)) break;
    var vals = v[i].slice(1).map(Number);
    dataRows.push({ label: lab, band: parseFicoBandLocal_(lab), vals: vals });
  }

  var ficoBands = dataRows.map(function (r) {
    return r.band;
  });
  var table = dataRows.map(function (r) {
    return r.vals;
  });

  var cashout = null;
  var tiers = {};
  var optionalRows = { multiunit: null, condo: null, interestOnly: null };
  var loanAmountBands = [];
  var pppByLabel = {};

  i = skipBlankRowsDscr_(v, i);

  if (i < v.length && /^Cash\s*Out\s*Adj$/i.test(String(v[i][0] || '').trim())) {
    var valsCo = v[i].slice(1).map(Number);
    cashout = { byLtv: zipLtvValsLocal_(columns, valsCo) };
    i++;
    i = skipBlankRowsDscr_(v, i);
    if (i < v.length && /^DSCR\s*1\.00\s*-\s*1\.24$/i.test(String(v[i][0] || '').trim())) {
      var valsT1 = v[i].slice(1).map(Number);
      var tLow = { byLtv: zipLtvValsLocal_(columns, valsT1) };
      tiers['1.00-1.2499'] = tLow;
      tiers['1.00-1.24'] = tLow;
      i++;
    }
    if (i < v.length && /^DSCR\s*(?:>=|≥)\s*1\.25$/i.test(String(v[i][0] || '').trim())) {
      var valsT2 = v[i].slice(1).map(Number);
      var tHi = { byLtv: zipLtvValsLocal_(columns, valsT2) };
      tiers['>= 1.25'] = tHi;
      tiers['>=1.25'] = tHi;
      i++;
    }
    i = skipBlankRowsDscr_(v, i);
  }

  if (i < v.length && /^DSCR\s*Ratio$/i.test(String(v[i][0] || '').trim())) {
    i++;
    i = skipBlankRowsDscr_(v, i);
    while (i < v.length) {
      var labR = String(v[i][0] || '').trim();
      if (!labR) break;
      if (/^DSCR\s*Adjusters$/i.test(labR)) break;
      if (/^DSCR\s*Loan\s*Amount$/i.test(labR)) break;
      if (/^PPP$/i.test(labR)) break;
      var valsR = v[i].slice(1).map(Number);
      if (/^1\.00\s*-\s*1\.2499$/i.test(labR) || /^DSCR\s*1\.00\s*-\s*1\.24$/i.test(labR)) {
        var tLowR = { byLtv: zipLtvValsLocal_(columns, valsR) };
        tiers['1.00-1.2499'] = tLowR;
        tiers['1.00-1.24'] = tLowR;
      } else if (/^(?:DSCR\s*)?(?:>=|≥)\s*1\.25$/i.test(labR)) {
        var tHiR = { byLtv: zipLtvValsLocal_(columns, valsR) };
        tiers['>= 1.25'] = tHiR;
        tiers['>=1.25'] = tHiR;
      }
      i++;
    }
    i = skipBlankRowsDscr_(v, i);
  }

  if (i < v.length && /^DSCR\s*Adjusters$/i.test(String(v[i][0] || '').trim())) {
    i++;
    i = skipBlankRowsDscr_(v, i);
    while (i < v.length) {
      var labA = String(v[i][0] || '').trim();
      if (!labA) break;
      if (/^DSCR\s*Loan\s*Amount$/i.test(labA)) break;
      if (/^PPP$/i.test(labA)) break;
      var valsA = v[i].slice(1).map(Number);
      if (/^Cash\s*Out\s*Adj$/i.test(labA)) {
        cashout = { byLtv: zipLtvValsLocal_(columns, valsA) };
      } else if (/^Multiunit$/i.test(labA)) {
        optionalRows.multiunit = { byLtv: zipLtvValsLocal_(columns, valsA) };
      } else if (/^Condo$/i.test(labA)) {
        optionalRows.condo = { byLtv: zipLtvValsLocal_(columns, valsA) };
      } else if (/^Interest\s*Only$/i.test(labA)) {
        optionalRows.interestOnly = { byLtv: zipLtvValsLocal_(columns, valsA) };
      }
      i++;
    }
    i = skipBlankRowsDscr_(v, i);
  }

  if (i < v.length && /^DSCR\s*Loan\s*Amount$/i.test(String(v[i][0] || '').trim())) {
    i++;
    i = skipBlankRowsDscr_(v, i);
    while (i < v.length) {
      var labL = String(v[i][0] || '').trim();
      if (!labL) break;
      var bandL = parseLoanAmountBandLocal_(labL);
      if (!bandL) break;
      var ptsL = Number(v[i][1] || 0);
      loanAmountBands.push({ band: bandL, pts: ptsL });
      i++;
    }
  }

  i = skipBlankRowsDscr_(v, i);

  if (i < v.length && /^PPP$/i.test(String(v[i][0] || '').trim())) {
    i++;
    i = skipBlankRowsDscr_(v, i);
    while (i < v.length) {
      var labP = String(v[i][0] || '').trim();
      if (!labP) break;
      if (/^DSCR$/i.test(labP) || /^Purchase$/i.test(labP)) break;
      var ptsP = Number(v[i][1] || 0);
      pppByLabel[normalizePppLabel_(labP)] = isFinite(ptsP) ? ptsP : 0;
      i++;
    }
  }

  return {
    grid: { columns: columns, ficoBands: ficoBands, table: table },
    cashout: cashout,
    tiers: tiers,
    optionalRows: optionalRows,
    loanAmountBands: loanAmountBands,
    pppByLabel: pppByLabel,
  };
}

/////////////////////
//    Selection    //
/////////////////////

function llpaPickDiscrete_(grid, ltv, fico) {
  const j = pickColIndexLocal_(grid.columns, ltv);
  const i = pickRowIndexLocal_(grid.ficoBands, fico);
  const val = grid.table[i] && grid.table[i][j];
  return Number(val || 0);
}

function pickColIndexLocal_(columns, ltv) {
  for (let j = 0; j < columns.length; j++) {
    const b = columns[j];
    if (ltv >= b.lo && ltv <= b.hi) return j;
  }
  let best = 0,
    bestD = 1e9;
  for (let j = 0; j < columns.length; j++) {
    const b = columns[j],
      c = (b.lo + b.hi) / 2,
      d = Math.abs(ltv - c);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

function pickRowIndexLocal_(bands, fico) {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (fico >= b.lo && fico <= b.hi) return i;
  }
  let best = 0,
    bestD = 1e9;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i],
      c = (b.lo + b.hi) / 2,
      d = Math.abs(fico - c);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/////////////////////
//  FHA / VA adj   //
/////////////////////

function pickAdjusterFromBandsDiscrete_(bandList, fico) {
  if (!Array.isArray(bandList)) return 0;
  for (const b of bandList) {
    if (b && b.band && typeof b.pts !== 'undefined') {
      if (fico >= b.band.lo && fico <= b.band.hi) return Number(b.pts) || 0;
    }
  }
  return 0;
}

/////////////////////
//   Parsers       //
/////////////////////

function parseFicoBandLocal_(label) {
  const s = String(label)
    .replace(/FICO\s*/i, '')
    .trim();

  let m = s.match(/^(?:>=|≥)\s*(\d+)\s*$/);
  if (m) return { lo: Number(m[1]), hi: 900 };

  m = s.match(/^(?:>)\s*(\d+)\s*$/);
  if (m) return { lo: Number(m[1]) + 1, hi: 900 };

  m = s.match(/^(?:<=|≤)\s*(\d+)\s*$/);
  if (m) return { lo: 0, hi: Number(m[1]) };

  m = s.match(/^(?:<)\s*(\d+)\s*$/);
  if (m) return { lo: 0, hi: Math.max(0, Number(m[1]) - 1) };

  m = s.match(/^(\d+)\s*[-–]\s*(\d+)\s*$/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };

  return { lo: 0, hi: 900 };
}

function parseLtvBandLocal_(label) {
  const s = String(label)
    .replace(/^LTV\s*/i, '')
    .trim();
  let m = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%?$/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  m = s.match(/^(?:<=|[\u2264])\s*(\d+(?:\.\d+)?)\s*%?$/);
  if (m) return { lo: 0, hi: Number(m[1]) };
  return { lo: 0, hi: 100 };
}

/////////////////////
//  Small helpers  //
/////////////////////

function zipLtvValsLocal_(columns, vals) {
  const m = {};
  for (let k = 0; k < columns.length; k++) {
    const b = columns[k];
    const key = b.lo.toFixed(2) + '-' + b.hi.toFixed(2);
    m[key] = Number(vals[k] || 0);
  }
  return m;
}

function findRowIndexLocal_(rows, regex) {
  for (let i = 0; i < rows.length; i++) {
    const s = String(rows[i][0] || '').trim();
    if (regex.test(s)) return i;
  }
  return -1;
}

function round3Local_(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function normalizeTxnLocal_(s) {
  const t = String(s || 'PURCHASE')
    .toUpperCase()
    .trim();
  if (t.includes('CASH')) return 'CASHOUT';
  if (t.includes('IRRRL')) return 'IRRRL';
  if (t.includes('RT') || t.includes('RATE') || t.includes('TERM') || t.includes('REFI')) return 'RTREFI';
  return 'PURCHASE';
}
