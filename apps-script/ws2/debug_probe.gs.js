// ---- debug_probe.gs ----
// GET /exec?action=probe&program=FHA30&ltv=96.5&fico=680&loan=350000&txn=PURCHASE
// Common params:
//   program: CONV30 | FHA30 | VA30
//   ltv, fico, txn: PURCHASE | RTREFI | CASHOUT | IRRRL (IRRRL maps to VA workflow)
//   loan: base loan amount (pre-UFMIP/FF), term: months or years (<=50 means years)
//   borrowerPts: price at-point (e.g., 0, 0.5, -1), lpc: override LPC for market fetch
// FHA extras: fha_financeUfmip=yes/no, fha_annualMip=0.55 (default)
// VA extras: va_firstUse=yes/no (default yes), va_exempt=yes/no, va_irrrl=yes/no, va_financeFF=yes/no (default yes)
function doGet(e) {
  const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
  if (action !== 'probe') return json_({ ok: false, error: 'Unknown action' });

  // ---------- helpers ----------
  const bool = (v, d) => {
    if (v == null) return !!d;
    const s = String(v).trim().toLowerCase();
    return ['1','true','yes','y','on'].includes(s);
  };
  const num = (v, d) => {
    const n = Number(v);
    return (isFinite(n) ? n : d);
  };
  const normTxn = (s) => {
    const t = String(s || 'PURCHASE').toUpperCase().trim();
    if (t.includes('CASH')) return 'CASHOUT';
    if (t.includes('IRRRL')) return 'IRRRL';
    if (t.includes('RT') || t.includes('RATE') || t.includes('TERM') || t.includes('REFI')) return 'RTREFI';
    return 'PURCHASE';
  };
  const termMonths = (tIn) => {
    const t = num(tIn, 360);
    if (!isFinite(t) || t <= 0) return 360;
    return (t <= 50 ? Math.round(t * 12) : Math.round(t));
  };

  // ---------- inputs ----------
  const program = String((e.parameter && e.parameter.program) || 'CONV30').toUpperCase(); // CONV30/FHA30/VA30
  const ltv = num(e.parameter && e.parameter.ltv, 95);
  const fico = num(e.parameter && e.parameter.fico, 680);
  const txn = normTxn(e.parameter && e.parameter.txn);
  const baseLoan = num(e.parameter && e.parameter.loan, 0);
  const term = termMonths(e.parameter && e.parameter.term);
  const borrowerPts = num(e.parameter && e.parameter.borrowerPts, 0);
  const lpc = (e.parameter && e.parameter.lpc != null) ? Number(e.parameter.lpc) : DEFAULT_LPC;

  // FHA options
  const fha_financeUfmip = bool(e.parameter && e.parameter.fha_financeUfmip, false);
  const fha_annualMip = num(e.parameter && e.parameter.fha_annualMip, 0.55);

  // VA options
  const va_firstUse = bool(e.parameter && e.parameter.va_firstUse, true);
  const va_exempt = bool(e.parameter && e.parameter.va_exempt, false);
  const va_irrrl = bool(e.parameter && e.parameter.va_irrrl, false);
  const va_financeFF = bool(e.parameter && e.parameter.va_financeFF, true);

  // 1) Which sheet ID is in use
  const id = (typeof PRICING_SHEET_ID !== 'undefined') ? PRICING_SHEET_ID : '(undefined)';

  // 2) Market fetch (same function used in engine)
  const market = fetchMarket_(lpc); // { ok, model, conv30Purchase, FHA30, VA30, ... }
  if (!market || !market.ok) {
    return json_({ ok: false, error: 'Rates market unavailable for probe' });
  }

  // Pick product per program (mirrors priceScenario_)
  const product = (program === 'FHA30') ? market.FHA30
                  : (program === 'VA30') ? market.VA30
                  : market.conv30Purchase;
  if (!product || !product.slopes) {
    return json_({ ok: false, error: 'Program market data or slopes missing for probe' });
  }

  // 3) Program-specific loan math (UFMIP/FF & MI)
  let totalLoan = baseLoan;
  let miAnnualPct = 0;
  let fhaMeta = null, vaMeta = null;

  if (program === 'FHA30') {
    const fha = applyFHA_(baseLoan, ltv, fico, fha_financeUfmip, fha_annualMip);
    totalLoan = fha.totalLoan; miAnnualPct = fha.annualMipPct; fhaMeta = fha;
  } else if (program === 'VA30') {
    const downPct = Math.max(0, 100 - ltv);
    const va = applyVA_(baseLoan, va_firstUse, va_exempt, downPct, va_financeFF, va_irrrl);
    totalLoan = va.totalLoan; miAnnualPct = 0; vaMeta = { ...va, firstUse: !!va_firstUse, exempt: !!va_exempt, irrrl: !!va_irrrl, financeFF: !!va_financeFF, downPct };
  } else {
    // Conventional probe can show base PMI cell for reference
    // (The pricing engine applies multipliers; here we display the base cell to keep probe focused.)
    miAnnualPct = 0;
  }

  // 4) Grid/adjusters (uses your llpaPoints_ surface, including FHA/VA FICO adjusters)
  const llpaRes = (typeof llpaPoints_ === 'function')
    ? llpaPoints_({ program, txn, ltvPct: ltv, fico })
    : { points: 0, explain: { note: 'llpaPoints_ missing' } };
  const gridPts = Number(llpaRes.points || 0);

  // 5) Rate math chain (identical logic to priceScenario_)
  //    rate = product.rate0ptLPC + pointsToRateDelta_(borrowerPts - gridPts, product.slopes)
  const netPts = borrowerPts - gridPts;
  const rateDelta = pointsToRateDelta_(netPts, product.slopes);
  const noteRate = round3_(Number(product.rate0ptLPC) + Number(rateDelta)); // consumer-facing anchor with LPC
  // Optional PI/MI so you can spot if "high payment" is loan-amount-driven vs. rate-driven
  const miMonthly = round2_(((miAnnualPct || 0) / 100) * totalLoan / 12);
  const piMonthly = round2_(pmntMonthly_(noteRate, term, totalLoan));

  // 6) Optional conventional PMI context (cell readout only)
  let convPmi = null;
  if (program === 'CONV30') {
    const pmiSrc = loadPmiSource_();
    const pmiJ = pickColIndex_(pmiSrc.grid.columns, ltv);
    const pmiI = pickRowIndex_(pmiSrc.grid.ficoBands, fico);
    const pmiBase = Number((pmiSrc.grid.table[pmiI] && pmiSrc.grid.table[pmiI][pmiJ]) || 0);
    convPmi = {
      i: pmiI, j: pmiJ,
      ltvBand: pmiSrc.grid.columns[pmiJ],
      ficoBand: pmiSrc.grid.ficoBands[pmiI],
      basePct: pmiBase,
      multipliers: pmiSrc.multipliers
    };
  }

  // 7) Output — everything needed to see why a rate is high/low
  const out = {
    ok: true,
    sheetIdInUse: id,
    inputs: { program, txn, ltv, fico, loan: baseLoan, term, borrowerPts, lpc },
    market: {
      model: market.model,
      // Two useful "pars":
      //   wholesalePar: provided by your feed
      //   rate0ptLPC: your consumer par anchor used in engine calcs
      wholesalePar: product.wholesalePar,
      rate0ptLPC: product.rate0ptLPC,
      lpcRateBump: product.lpcRateBump,
      slopes: product.slopes
    },
    adjusters: {
      gridPoints: round3_(gridPts),
      explain: llpaRes.explain || {}
    },
    math: {
      netPoints: round3_(netPts),
      rateDeltaFromPoints: round3_(rateDelta),
      noteRate
    },
    payments: {
      totalLoan: Math.round(totalLoan),
      piMonthly,
      miAnnualPct,
      miMonthly,
      totalCore: round2_(piMonthly + miMonthly)
    }
  };

  if (fhaMeta) {
    out.fha = {
      ufmipPct: fhaMeta.ufmipPct,
      ufmip: Math.round(fhaMeta.ufmip),
      financed: !!fha_financeUfmip,
      totalLoan: Math.round(fhaMeta.totalLoan),
      annualMipPct: fhaMeta.annualMipPct
    };
  }
  if (vaMeta) {
    out.va = {
      firstUse: !!vaMeta.firstUse,
      exempt: !!vaMeta.exempt,
      irrrl: !!vaMeta.irrrl,
      financeFF: !!vaMeta.financeFF,
      downPct: vaMeta.downPct,
      ffPct: vaMeta.ffPct,
      fundingFee: Math.round(vaMeta.ff),
      totalLoan: Math.round(vaMeta.totalLoan)
    };
  }
  if (convPmi) out.conv = { pmi: convPmi };

  return json_(out);
}