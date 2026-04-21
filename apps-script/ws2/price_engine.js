// ---- price_engine.gs ----

function priceScenario_(payload, opts){
  const inputs = payload.inputs || {};

  const lpc    = (inputs.lpc != null) ? Number(inputs.lpc) : DEFAULT_LPC;
  const market = payload.market || fetchMarket_(lpc);
  if (!market || !market.ok) return { ok:false, error:'Rates market unavailable' };

  const prog = String(inputs.program || 'CONV30').toUpperCase();
  const txn  = normalizeTxn_(String(inputs.txn || 'PURCHASE'));
  const termMonths = normalizeTermToMonths_(Number(inputs.term || 360));
  const baseLoan   = Number(inputs.loan || 0);
  const ltv        = Number(inputs.ltv  || 0);
  const fico       = Number(inputs.fico || 0);

  const product = (prog === 'FHA30') ? market.FHA30 :
                  (prog === 'VA30')  ? market.VA30  :
                                        market.conv30Purchase;
  if (!product) return { ok:false, error:'Program market data missing' };

  if (opts && opts.fields === 'core' && Array.isArray(opts.curvePoints) && opts.curvePoints.length > 0){
    return priceCurveCore_(inputs, market, opts);
  }

  const slopes = product.slopes;
  if (!slopes || !slopes.nearPar || !slopes.belowPar || !slopes.abovePar) {
    return { ok:false, error:'Slope data missing from market' };
  }

  let llpaPts = 0, llpaExplain = null;
  const llpaRes = (typeof llpaPoints_ === 'function')
    ? llpaPoints_({ program: prog, txn, ltvPct: ltv, fico })
    : { points: 0, explain: { note: 'llpaPoints_ missing' } };
  llpaPts     = llpaRes.points || 0;
  llpaExplain = llpaRes.explain || {};

  const borrowerPts = Number(inputs.borrowerPts || 0);
  const netPts      = borrowerPts - llpaPts;

  let totalLoan = baseLoan, miAnnualPct = 0, meta = {};
  if (prog === 'FHA30'){
    const financeUFMIP = !!(inputs.fha && inputs.fha.financeUfmip);
    const mipPct       = (inputs.fha && inputs.fha.annualMip != null) ? Number(inputs.fha.annualMip) : 0.55;
    const fha = applyFHA_(baseLoan, ltv, fico, financeUFMIP, mipPct);
    totalLoan   = fha.totalLoan; miAnnualPct = fha.annualMipPct; meta.fha = fha;
  } else if (prog === 'VA30'){
    const exempt    = !!(inputs.va && inputs.va.exempt);
    const firstUse  = !!(inputs.va && inputs.va.firstUse);
    const downPct   = Math.max(0, 100 - ltv);
    const financeFF = true; const irrrl = (txn === 'IRRRL');
    const va  = applyVA_(baseLoan, firstUse, exempt, downPct, financeFF, irrrl);
    totalLoan = va.totalLoan; meta.va = va;
  } else {
    const showPMI = (inputs.pmiToggle === true || String(inputs.pmiToggle).toLowerCase() === 'yes');
    // Conventional monthly PMI: LTV must be *above* 80% (at 80% = 20% down, no PMI)
    if (showPMI && ltv > 80) {
      const pmi = (typeof pmiAnnualRate_ === 'function')
        ? pmiAnnualRate_({
            ltvPct: ltv, fico: fico,
            dtiOver45: !!inputs.dtiOver45,
            twoPlusBorrowers: !!inputs.twoPlusBorrowers
          })
        : { annualPct: 0 };
      miAnnualPct = pmi.annualPct || 0; meta.pmi = pmi;
    }
  }

  const noteRate = round3_( product.rate0ptLPC + pointsToRateDelta_(netPts, slopes) );
  const mt       = monthlyTotals_(noteRate, totalLoan, termMonths,
                                  Number(inputs.taxes||0), Number(inputs.ins||0), Number(inputs.hoa||0),
                                  miAnnualPct);

  return {
    ok: true,
    model: ENGINE_MODEL,
    usingRatesModel: market.model,
    program: prog, txn,
    parRate: product.wholesalePar,
    noteRate,
    totalLoan: Math.round(totalLoan),
    piMonthly: mt.pi,
    miMonthly: mt.mi,
    totalPayment: mt.total,
    breakdown: {
      rate0ptLPC: product.rate0ptLPC,
      lpcRateBump: product.lpcRateBump,
      llpaPoints: round3_(llpaPts),
      borrowerPoints: round3_(borrowerPts),
      netPoints: round3_(netPts),
      slopeRegion: (netPts >= 0 ? 'belowPar' : 'abovePar'),
      slopesUsed: slopes,
      llpaExplain
    },
    meta
  };
}

function priceCurveCore_(inputs, market, opts){
  const prog = String(inputs.program || 'CONV30').toUpperCase();
  const txn  = normalizeTxn_(String(inputs.txn || 'PURCHASE'));
  const termMonths = normalizeTermToMonths_(Number(inputs.term || 360));
  const baseLoan   = Number(inputs.loan || 0);
  const ltv        = Number(inputs.ltv  || 0);
  const fico       = Number(inputs.fico || 0);

  const nativeDscr = (function () {
    if (prog !== 'DSCR' && prog !== 'DSCR30') return null;
    const p = market.dscr30Purchase;
    if (!p || !p.slopes) return null;
    if (p.rate0ptLPC == null || !isFinite(Number(p.rate0ptLPC))) return null;
    return p;
  })();

  const baseProduct = (prog === 'FHA30') ? market.FHA30 :
                      (prog === 'VA30')  ? market.VA30  :
                      nativeDscr ? nativeDscr :
                                            market.conv30Purchase;
  if (!baseProduct || !baseProduct.slopes) return { ok:false, error:'Slopes unavailable' };
  const slopes = baseProduct.slopes;

  let totalLoan = baseLoan, miAnnualPct = 0;
  if (prog === 'FHA30'){
    const financeUFMIP = !!(inputs.fha && inputs.fha.financeUfmip);
    const mipPct       = (inputs.fha && inputs.fha.annualMip != null) ? Number(inputs.fha.annualMip) : 0.55;
    const fha = applyFHA_(baseLoan, ltv, fico, financeUFMIP, mipPct);
    totalLoan = fha.totalLoan; miAnnualPct = fha.annualMipPct;
  } else if (prog === 'VA30'){
    const exempt    = !!(inputs.va && inputs.va.exempt);
    const firstUse  = !!(inputs.va && inputs.va.firstUse);
    const downPct   = Math.max(0, 100 - ltv);
    const financeFF = true; const irrrl = (txn === 'IRRRL');
    const va = applyVA_(baseLoan, firstUse, exempt, downPct, financeFF, irrrl);
    totalLoan = va.totalLoan; miAnnualPct = 0;
  } else {
    const showPMI = (inputs.pmiToggle === true || String(inputs.pmiToggle).toLowerCase() === 'yes');
    if (showPMI && ltv > 80) {
      const pmi = (typeof pmiAnnualRate_ === 'function')
        ? pmiAnnualRate_({
            ltvPct: ltv, fico: fico,
            dtiOver45: !!inputs.dtiOver45,
            twoPlusBorrowers: !!inputs.twoPlusBorrowers
          })
        : { annualPct: 0 };
      miAnnualPct = pmi.annualPct || 0;
    }
  }

  let baseConsumerPar = Number(baseProduct.rate0ptLPC);
  if ((prog === 'DSCR' || prog === 'DSCR30') && !nativeDscr) {
    if (!market.conv30Purchase || market.conv30Purchase.rate0ptLPC == null) {
      return { ok: false, error: 'Conv consumer par unavailable for DSCR anchor' };
    }
    baseConsumerPar = Number(market.conv30Purchase.rate0ptLPC) + Number(DSCR_PAR_SPREAD);
  }

  let gridPts = 0;
  var dscrResForMeta = null;
  if (prog === 'DSCR' || prog === 'DSCR30'){
    dscrResForMeta = (typeof dscrPoints_ === 'function')
      ? dscrPoints_({
          ltvPct: ltv,
          fico: fico,
          txn: txn,
          dscr: Number(inputs.dscr || 1.25),
          loan: baseLoan,
          loanAmount: baseLoan,
        })
      : { points: 0 };
    gridPts = dscrResForMeta.points || 0;
  } else {
    const llpaRes = (typeof llpaPoints_ === 'function')
      ? llpaPoints_({ program: prog, txn, ltvPct: ltv, fico })
      : { points: 0 };
    gridPts = llpaRes.points || 0;
  }

  const defaultPts = [-1,-0.5,0,0.5,1,1.5,2,2.5,3];
  const ptsList    = (opts.curvePoints && opts.curvePoints.length) ? opts.curvePoints : defaultPts;

  const quotes = {};
  let parRateFromMap = null;

  ptsList.forEach(k => {
    const borrowerPtsK = Number(k);
    const netPtsK      = borrowerPtsK - gridPts;
    const rateK        = round3_( baseConsumerPar + pointsToRateDelta_(netPtsK, slopes) );
    const piK          = pmntMonthly_(rateK, termMonths, totalLoan);
    const miK          = (Number(miAnnualPct)||0)/100 * totalLoan / 12; // PI + MI only
    const totalCore    = piK + miK;

    quotes[String(k)] = { noteRate: rateK, piMonthly: round2_(piK), miMonthly: round2_(miK), totalPayment: round2_(totalCore) };
    if (k === 0) parRateFromMap = rateK;
  });

  const ctx = { program: String(inputs.program || 'CONV30').toUpperCase(), txn, term: termMonths, parRate: (parRateFromMap != null) ? parRateFromMap : baseConsumerPar };
  const out = { ok:true, context: ctx, quotes };
  if (opts && opts.debug){
    out.meta = {
      totalLoan, miAnnualPct,
      baseConsumerPar,
      gridPoints: round3_(gridPts),
      slopes: baseProduct.slopes,
      usedConvAnchor:
        prog === 'DSCR' || prog === 'DSCR30'
          ? market.conv30Purchase
            ? market.conv30Purchase.rate0ptLPC
            : null
          : baseProduct.rate0ptLPC,
      dscrBaseSource:
        prog === 'DSCR' || prog === 'DSCR30'
          ? nativeDscr
            ? 'ws1_dscr30Purchase'
            : 'conv_rate0ptLPC_plus_spread'
          : null,
      dscrLlpaBreakdown: (dscrResForMeta && dscrResForMeta.explain) ? dscrResForMeta.explain : null,
    };
  }
  return out;
}

// Helpers
function fetchMarket_(lpc){
  const url  = RATES_API_URL + '?action=rates&lpc=' + encodeURIComponent((lpc!=null ? lpc : DEFAULT_LPC));
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  try { return JSON.parse(resp.getContentText() || '{}'); } catch(_) { return null; }
}
function pointsToRateDelta_(points, slopes){
  const pts = Number(points) || 0;
  if (pts >= 0) return -Math.abs(pts) * Number(slopes.belowPar.ratePerPoint);
  return  Math.abs(pts) * Number(slopes.abovePar.ratePerPoint);
}
function normalizeTxn_(s){
  const t = String(s||'PURCHASE').toUpperCase().trim();
  if (t.includes('CASH')) return 'CASHOUT';
  if (t.includes('RT') || t.includes('RATE') || t.includes('TERM')) return 'RTREFI';
  return 'PURCHASE';
}
function normalizeTermToMonths_(term){
  const n = Number(term||0);
  if (!isFinite(n) || n<=0) return 360;
  return (n <= 50) ? Math.round(n*12) : Math.round(n);
}
