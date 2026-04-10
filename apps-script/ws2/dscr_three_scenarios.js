/**
 * DSCR three-scenario pricing for dscr-landing (merge into Workspace 2 project).
 *
 * Depends on (same Apps Script project):
 *   config.gs          — DEFAULT_LPC, ENGINE_MODEL, RATES_API_URL
 *   price_engine.gs    — fetchMarket_, priceCurveCore_, normalizeTxn_, normalizeTermToMonths_
 *   utils_math_core.gs — round2_, round3_, pmntMonthly_
 *   llpa_matrix_loader.gs — dscrPoints_ (via priceCurveCore_)
 *
 * @param {object} input - Same shape as DscrLandingInput (landing form).
 * @param {number} minDscr - Floor for max-loan scenario (e.g. 1.1).
 * @param {{ fast?: boolean }} [options] - If fast=true, skips binary search for max loan (one ceiling check).
 * @returns {object} ok + scenarios[0..2], or { ok:false, code:'CREDIT', error }
 */
function isCreditPricingError_(msg) {
  const s = String(msg || '').toLowerCase();
  return /fico|credit|score|ineligible|below minimum|minimum fico|not eligible/.test(s);
}

function findMaxLoanDscrBand_(ctx, lo, hi, floor, fast, rent) {
  if (hi < lo || lo < 1) return null;
  const pitiaAt = function (L) {
    const r = ctx.ensurePrice(L);
    return r.ok ? r.monthlyPitia : NaN;
  };
  const pLo = pitiaAt(lo);
  if (!isFinite(pLo) || pLo <= 0) return null;
  const dLo = rent / pLo;
  if (!isFinite(dLo) || dLo < floor) return null;

  const pHi = pitiaAt(hi);
  const dHi = pHi > 0 ? rent / pHi : 0;
  if (isFinite(dHi) && dHi >= floor) {
    return Math.min(Math.floor(hi / 100) * 100, hi);
  }

  if (fast) {
    const mid = (lo + hi) / 2;
    const pm = pitiaAt(mid);
    const dm = pm > 0 ? rent / pm : 0;
    if (isFinite(dm) && dm >= floor) return Math.min(Math.floor(hi / 100) * 100, hi);
    return Math.min(Math.floor(lo / 100) * 100, hi);
  }

  var loB = lo;
  var hiB = hi;
  for (var i = 0; i < 22; i++) {
    if (hiB - loB < 100) break;
    const mid = (loB + hiB) / 2;
    const p = pitiaAt(mid);
    if (!isFinite(p) || p <= 0) {
      hiB = mid;
      continue;
    }
    const d = rent / p;
    if (d >= floor) loB = mid;
    else hiB = mid;
  }
  var outL = Math.floor(loB / 100) * 100;
  return Math.min(outL, hi);
}

/**
 * When payoff is above 80% LTV, column 1 (max loan at DSCR floor) and column 2 (loan at exactly 80% cap
 * after paydown) often land within a few hundred dollars at the same note rate — duplicate UI. Merge to one card.
 */
function dedupeOver80TwinScenarios_(scenarios, payoffRaw, L80) {
  if (!scenarios || scenarios.length !== 2) return scenarios;
  const a = scenarios[0];
  const b = scenarios[1];
  if (!a || !b || a.id !== 'max_loan' || b.id !== 'best_rate_submitted') return scenarios;
  const dLoan = Math.abs(Number(a.loanAmount) - Number(b.loanAmount));
  const dRate = Math.abs(Number(a.interestRate) - Number(b.interestRate));
  if (dLoan > 5000 || dRate > 0.00035) return scenarios;
  const paydown = payoffRaw > L80 ? Math.max(0, Math.round(payoffRaw - L80)) : 0;
  const merged = Object.assign({}, a);
  if (paydown > 0) merged.paydownRequired = paydown;
  return [merged];
}

function findNearestLoanDownDscr_(ctx, L0, minL, rent, floor) {
  const step = 5000;
  var L = Math.floor(L0 / 100) * 100;
  for (; L >= minL; L -= step) {
    if (L < 1) break;
    const r = priceAtLoanForDscr_(L, ctx);
    if (r && r.ok === false && isCreditPricingError_(r.error)) return { creditBlock: true };
    if (r && r.ok) {
      const pit = r.monthlyPitia;
      const d = pit > 0 ? rent / pit : 0;
      if (isFinite(d) && d >= floor - 1e-6) return { L: L, pr: r };
    }
  }
  return null;
}

function dscrThreeScenarios_(input, minDscr, options) {
  const fast = !!(options && options.fast);
  const diagnostics = !!(options && options.diagnostics);
  const minD = Number(minDscr);
  const floor = isFinite(minD) && minD > 0 ? minD : 1.1;

  const market = fetchMarket_(DEFAULT_LPC);
  if (!market || !market.ok) {
    return { ok: false, error: 'Rates market unavailable (WS1)' };
  }
  if (!market.conv30Purchase || !market.conv30Purchase.slopes) {
    return { ok: false, error: 'Conv slopes missing from market (WS1)' };
  }

  const value = Number(input.propertyValue);
  const rent = Number(input.grossMonthlyRent);
  const payoffRaw = Math.min(Number(input.existingPayoff) || 0, value > 0 ? value * 0.95 : 0);
  const fico = Number(input.creditScore);
  const annualTaxes = Number(input.annualTaxes) || 0;
  const annualInsurance = Number(input.annualInsurance) || 0;
  const monthlyHoa = Number(input.monthlyHoa) || 0;
  const termYears = Number(input.amortizationYears) || 30;
  const termMonths = normalizeTermToMonths_(termYears <= 50 ? termYears * 12 : termYears);

  const txnNorm = mapLandingTxnToWs2_(input.transactionType);
  const txnLc = String(input.transactionType || '').toLowerCase();
  const isPurchase = txnLc === 'purchase';
  const isCashOut = txnLc === 'cash_out';

  const MAX_LTV_DSCR = 0.8;
  const maxLoanCap = value > 0 ? Math.floor(value * MAX_LTV_DSCR) : 0;
  const maxCashOutCap = 500000;
  const cashDesired = input.cashOutDesired != null ? Number(input.cashOutDesired) : null;
  const effectiveCashOutCap =
    isCashOut && cashDesired != null && isFinite(cashDesired) && cashDesired > 0
      ? Math.min(maxCashOutCap, cashDesired)
      : maxCashOutCap;

  const ctx = {
    market: market,
    value: value,
    rent: rent,
    payoff: payoffRaw,
    fico: fico,
    termMonths: termMonths,
    termYears: termYears,
    txnNorm: txnNorm,
    annualTaxes: annualTaxes,
    annualInsurance: annualInsurance,
    monthlyHoa: monthlyHoa,
    input: input,
    minDscrFloor: floor,
    _priceMemo: Object.create(null),
  };

  ctx.ensurePrice = function (L) {
    const key = String(Math.round(L));
    if (ctx._priceMemo[key] !== undefined) return ctx._priceMemo[key];
    const r = priceAtLoanForDscr_(L, ctx);
    ctx._priceMemo[key] = r;
    return r;
  };

  if (!(value > 0) || !(rent >= 0)) {
    return { ok: false, error: 'Invalid propertyValue or rent' };
  }
  if (maxLoanCap < 1) {
    return { ok: false, error: 'Invalid max loan cap (check property value)' };
  }

  const L80 = maxLoanCap;
  const ltvSubmitted = value > 0 ? payoffRaw / value : 0;
  const overEightyLtv = ltvSubmitted > MAX_LTV_DSCR + 1e-12;

  // --- Column 2 first: best rate at submitted loan (catch credit before max-loan work) ---
  var LRate = overEightyLtv ? L80 : Math.min(payoffRaw > 0 ? payoffRaw : L80, L80);
  if (isPurchase && payoffRaw < 1) LRate = L80;

  var prRate = ctx.ensurePrice(LRate);
  if (prRate && prRate.ok === false && isCreditPricingError_(prRate.error)) {
    return {
      ok: false,
      code: 'CREDIT',
      error: prRate.error || 'Credit profile not supported on this pricing grid.',
    };
  }

  var rateNearestHint = '';
  if (!prRate || prRate.ok === false) {
    const nn = findNearestLoanDownDscr_(ctx, LRate, Math.max(1, Math.floor(L80 * 0.25)), rent, floor);
    if (nn && nn.creditBlock) {
      return { ok: false, code: 'CREDIT', error: 'Credit profile not supported on this pricing grid.' };
    }
    if (nn && nn.pr) {
      LRate = nn.L;
      prRate = nn.pr;
      rateNearestHint = 'Nearest loan we could price (LTV/DSCR). ';
      ctx._priceMemo[String(Math.round(LRate))] = prRate;
    } else {
      LRate = null;
      prRate = null;
    }
  }

  // --- Column 1: max loan / lowest down ---
  var loanMax = null;
  if (overEightyLtv) {
    loanMax = findMaxLoanDscrBand_(ctx, Math.max(1, Math.floor(L80 * 0.15)), L80, floor, fast, rent);
  } else if (isPurchase) {
    loanMax = findMaxLoanDscrBand_(ctx, Math.max(1, Math.floor(L80 * 0.1)), L80, floor, fast, rent);
  } else {
    var hiM = Math.min(L80, payoffRaw + effectiveCashOutCap);
    var loM = Math.max(1, payoffRaw);
    if (hiM < loM) hiM = loM;
    loanMax = findMaxLoanDscrBand_(ctx, loM, hiM, floor, fast, rent);
  }

  if (loanMax != null && loanMax >= 1) {
    const tMax = ctx.ensurePrice(loanMax);
    if (tMax && tMax.ok === false && isCreditPricingError_(tMax.error)) {
      return { ok: false, code: 'CREDIT', error: tMax.error || 'Credit profile not supported on this pricing grid.' };
    }
    if (!tMax || !tMax.ok) loanMax = null;
  }

  const scenarios = [];
  const discParts = [];

  if (loanMax != null && loanMax >= 1) {
    const labelMax = isPurchase
      ? 'Max loan (lowest down at 80% LTV cap)'
      : 'Max loan (80% LTV + DSCR floor)';
    const cashOutMax = isCashOut && !overEightyLtv ? Math.max(0, loanMax - payoffRaw) : 0;
    scenarios.push(
      buildScenarioCard_('max_loan', labelMax, loanMax, ctx, {
        cashOutLabel: cashOutMax,
        userHint: '',
      })
    );
  }

  if (LRate != null && prRate && prRate.ok) {
    const paydown = overEightyLtv && payoffRaw > L80 ? Math.max(0, Math.round(payoffRaw - L80)) : 0;
    const labelRate = overEightyLtv ? 'Best rate at 80% LTV (after paydown)' : 'Best rate at your loan amount';
    scenarios.push(
      buildScenarioCard_('best_rate_submitted', labelRate, LRate, ctx, {
        cashOutLabel: 0,
        paydownRequired: paydown > 0 ? paydown : undefined,
        userHint: rateNearestHint,
      })
    );
  }

  if (!scenarios.length) {
    return {
      ok: true,
      outcome: 'no_results',
      layout: 'empty',
      scenarios: [],
      userMessage: 'No results available for these inputs.',
      disclaimer: 'Rent / DSCR may not support a loan at this value and cap, or pricing failed. Not a Loan Estimate.',
      lowestRate: null,
      balanced: null,
      highestLoan: null,
    };
  }

  var scenariosOut = dedupeOver80TwinScenarios_(scenarios, payoffRaw, L80);

  if (diagnostics && scenariosOut.length) {
    for (var si = 0; si < scenariosOut.length; si++) {
      var subCtx = Object.assign({}, ctx, {
        _priceMemo: Object.create(null),
        pricingDiagnostics: true,
      });
      delete subCtx.ensurePrice;
      var prDiag = priceAtLoanForDscr_(Number(scenariosOut[si].loanAmount), subCtx);
      if (prDiag && prDiag.pricingDiagnostics) {
        scenariosOut[si].rateDiagnostics = prDiag.pricingDiagnostics;
      }
    }
  }

  var userMessage = '';
  if (scenariosOut.length === 1 && scenariosOut[0].id === 'best_rate_submitted') {
    userMessage = 'Nearest available option: we could not illustrate a maximum loan for these inputs; showing the rate column only.';
  } else if (scenariosOut.length === 1 && scenariosOut[0].id === 'max_loan' && scenarios.length === 1) {
    userMessage = 'We could not price your submitted loan amount; showing the maximum loan column only.';
  }

  if (overEightyLtv && payoffRaw > L80) {
    if (scenariosOut.length === 1 && scenariosOut[0].paydownRequired) {
      discParts.push(
        'Balance is above 80% LTV; the option shown is at the program cap with estimated paydown to reach that cap (DSCR treated as above your minimum for illustration).'
      );
    } else if (scenariosOut.length > 1) {
      discParts.push(
        'Balance is above 80% LTV; second column assumes paydown to the program cap (DSCR treated as above your minimum for illustration).'
      );
    }
  }

  const baseDisclaimer =
    discParts.join(' ') +
    (discParts.length ? ' ' : '') +
    'Illustrative pricing from Workspace 2 DSCR engine + your LLPA sheet. Not a Loan Estimate. Rates and eligibility vary.';
  return {
    ok: true,
    outcome: 'success',
    model: ENGINE_MODEL,
    layout: 'two_goal',
    scenarios: scenariosOut,
    lowestRate: scenariosOut[0],
    balanced: null,
    highestLoan: scenariosOut.length > 1 ? scenariosOut[1] : scenariosOut[0],
    userMessage: userMessage,
    disclaimer: fast ? baseDisclaimer + ' Fast mode: coarser max-loan search.' : baseDisclaimer,
  };
}

/**
 * Fixed-point on DSCR tier: reprices until dscr input stabilizes vs PITIA from quoted rate.
 */
function priceAtLoanForDscr_(L, ctx) {
  const value = ctx.value;
  const rent = ctx.rent;
  const floorD = ctx.minDscrFloor != null && isFinite(ctx.minDscrFloor) ? Number(ctx.minDscrFloor) : 1.1;
  const ltv = value > 0 ? (L / value) * 100 : 0;
  var dscrGuess = Math.max(floorD, 1.25);
  var dscrForDiag = dscrGuess;

  var last = null;
  for (var iter = 0; iter < 4; iter++) {
    dscrForDiag = dscrGuess;
    const inputs = {
      program: 'DSCR30',
      txn: ctx.txnNorm,
      term: ctx.termYears,
      loan: L,
      ltv: ltv,
      fico: ctx.fico,
      dscr: dscrGuess,
      taxes: ctx.annualTaxes,
      ins: ctx.annualInsurance,
      hoa: ctx.monthlyHoa,
      pmiToggle: false,
      borrowerPts: 0,
      lpc: DEFAULT_LPC,
    };

    const out = priceCurveCore_(inputs, ctx.market, {
      curvePoints: [0],
      fields: 'core',
      debug: false,
    });

    if (!out || !out.ok) {
      return { ok: false, error: (out && out.error) || 'priceCurveCore failed' };
    }

    const q = out.quotes && out.quotes['0'];
    if (!q) {
      return { ok: false, error: 'No 0-point quote on curve' };
    }

    const notePct = Number(q.noteRate);
    const mt = monthlyTotals_(
      notePct,
      L,
      ctx.termMonths,
      ctx.annualTaxes,
      ctx.annualInsurance,
      ctx.monthlyHoa,
      0
    );
    const pitia = mt.total;
    const dscrAct = pitia > 0 ? rent / pitia : 999;

    last = {
      ok: true,
      notePct: notePct,
      noteDecimal: notePct / 100,
      monthlyPayment: q.piMonthly,
      monthlyPitia: pitia,
      dscr: dscrAct,
      ltv: value > 0 ? L / value : 0,
    };

    if (Math.abs(dscrAct - dscrGuess) < 0.02) break;
    dscrGuess = Math.max(floorD, Math.min(dscrAct, 3));
  }

  if (!last || !last.ok) {
    return last || { ok: false, error: 'Pricing iteration failed' };
  }

  if (ctx.pricingDiagnostics) {
    const inputsDiag = {
      program: 'DSCR30',
      txn: ctx.txnNorm,
      term: ctx.termYears,
      loan: L,
      ltv: ltv,
      fico: ctx.fico,
      dscr: dscrForDiag,
      taxes: ctx.annualTaxes,
      ins: ctx.annualInsurance,
      hoa: ctx.monthlyHoa,
      pmiToggle: false,
      borrowerPts: 0,
      lpc: DEFAULT_LPC,
    };
    const outD = priceCurveCore_(inputsDiag, ctx.market, {
      curvePoints: [0],
      fields: 'core',
      debug: true,
    });
    if (outD && outD.meta) {
      last.pricingDiagnostics = {
        loanAmount: L,
        ltvPct: ltv,
        dscrUsedForLlpaGrid: dscrForDiag,
        noteRatePar0Pct: last.notePct,
        dscrFromPitia: last.dscr,
        engineMeta: outD.meta,
      };
    }
  }

  return last;
}

function buildScenarioCard_(id, label, loanAmt, ctx, extra) {
  const pr = typeof ctx.ensurePrice === 'function' ? ctx.ensurePrice(loanAmt) : priceAtLoanForDscr_(loanAmt, ctx);
  if (!pr || pr.ok === false) {
    const bad = {
      id: id,
      label: label,
      loanAmount: Math.round(loanAmt),
      interestRate: 0,
      originationPercent: 1.0,
      monthlyPayment: 0,
      monthlyPitia: 0,
      dscr: 0,
      ltv: ctx.value > 0 ? loanAmt / ctx.value : 0,
      cashOut: extra.cashOutLabel != null ? extra.cashOutLabel : 0,
      closingCostRangeLabel: '—',
    };
    if (extra.paydownRequired != null) bad.paydownRequired = Math.round(extra.paydownRequired);
    if (extra.targetLtvPct != null) bad.targetLtvPct = extra.targetLtvPct;
    if (extra.userHint) bad.userHint = extra.userHint;
    return bad;
  }

  const good = {
    id: id,
    label: label,
    loanAmount: Math.round(loanAmt),
    interestRate: pr.noteDecimal,
    originationPercent: 1.0,
    monthlyPayment: pr.monthlyPayment,
    monthlyPitia: pr.monthlyPitia,
    dscr: pr.dscr,
    ltv: pr.ltv,
    cashOut: extra.cashOutLabel != null ? extra.cashOutLabel : 0,
    closingCostRangeLabel: '$1,505 – $2,355',
  };
  if (extra.paydownRequired != null) good.paydownRequired = Math.round(extra.paydownRequired);
  if (extra.targetLtvPct != null) good.targetLtvPct = extra.targetLtvPct;
  if (extra.userHint) good.userHint = extra.userHint;
  return good;
}

function mapLandingTxnToWs2_(transactionType) {
  const t = String(transactionType || '').toLowerCase();
  if (t === 'cash_out') return 'CASHOUT';
  if (t === 'rate_term') return 'RTREFI';
  return 'PURCHASE';
}
