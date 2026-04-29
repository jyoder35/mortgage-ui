(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.AZMShared;
  if (!S) {
    console.error("AZMShared missing — load shared-mortgage-data.js first");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const PAGE_VARIANT =
    (document.body && document.body.dataset && document.body.dataset.affordPage) ||
    (params.get("funnel") === "1" ? "funnel" : "funnel");

  /** myazm.com iframe or ?embed=1: affordweb header copy without step badges (affordfunnel unchanged). */
  let embeddedAffordWebsite = false;
  try {
    embeddedAffordWebsite =
      params.get("embed") === "1" || window.self !== window.top;
  } catch {
    embeddedAffordWebsite = params.get("embed") === "1";
  }

  const WEB_EMBEDDED_SUB = {
    form:
      "Enter your income, debts, and where you\u2019re buying. You\u2019ll refine numbers on the next screen.",
    results:
      "See your estimated maximum home purchase price and adjust settings to see what you can afford.",
  };

  const WS1_RATES_URL =
    "https://script.google.com/macros/s/AKfycbxFUmGP213ag2uV4cey3V2ox0diofarpDKNt0szGrSajVpO8CF_paFN7u_R9cPa4Y3FwA/exec?action=rates";

  const FALLBACK_RATES = { CONV: 6.875, FHA: 6.75, VA: 6.625 };
  const activeRates = { ...FALLBACK_RATES };
  let ratesMeta = { source: "fallback", asOf: "" };

  function parseWs1RatesPayload(data) {
    if (!data || data.ok !== true) return null;
    const conv = data.conv30Purchase?.rate0ptLPC;
    const fha = data.FHA30?.rate0ptLPC;
    const va = data.VA30?.rate0ptLPC;
    if (![conv, fha, va].every((x) => typeof x === "number" && isFinite(x))) return null;
    return { CONV: conv, FHA: fha, VA: va, asOf: data.asOf || "", model: data.model?.version || "" };
  }

  async function refreshWs1Rates() {
    try {
      const res = await fetch(WS1_RATES_URL, { cache: "no-store" });
      const data = await res.json();
      const parsed = parseWs1RatesPayload(data);
      if (parsed) {
        activeRates.CONV = parsed.CONV;
        activeRates.FHA = parsed.FHA;
        activeRates.VA = parsed.VA;
        ratesMeta = { source: "ws1", asOf: parsed.asOf, model: parsed.model };
        return true;
      }
    } catch {
      /* use fallback */
    }
    ratesMeta = { source: "fallback", asOf: "", model: "" };
    Object.assign(activeRates, FALLBACK_RATES);
    return false;
  }

  function snapshotRates() {
    return { CONV: activeRates.CONV, FHA: activeRates.FHA, VA: activeRates.VA };
  }

  const FHA_UFMIP_PCT = 1.75;
  const FHA_MONTHLY_MIP_PCT = 0.55;
  const VA_FF_FIRST = 2.15;
  const PMI_RATE_PCT = 0.30;

  const fmtUSD = (n) =>
    isFinite(+n) && +n >= 0 ? "$" + Math.round(+n).toLocaleString() : "—";

  function fmtCurrencyInput(n) {
    const v = Math.round(+n);
    return isFinite(v) && v >= 0 ? "$" + v.toLocaleString() : "";
  }

  function stripRaw(str) {
    return String(str || "").replace(/[$,%\s]/g, "").trim();
  }

  function parseNum(str) {
    const n = Number(stripRaw(str));
    return isFinite(n) ? n : NaN;
  }

  function fmtK(n) {
    if (!isFinite(n)) return "—";
    if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
    return "$" + Math.round(n).toLocaleString();
  }

  function bucketBasis50k(p) {
    const x = Math.floor(Math.max(0, Number(p)) / 50000) * 50000;
    return Math.max(50000, x);
  }

  function ceilToNearest5000(n) {
    return Math.ceil(Math.max(0, n) / 5000) * 5000;
  }

  let advTaxTouched = false;
  let advHoiTouched = false;
  let advFormTaxEdited = false;
  let advFormHoiEdited = false;

  function getAdvOverrides() {
    const taxEl = $("advTax");
    const hoiEl = $("advHoi");
    const hoaEl = $("advHoa");
    const taxS = taxEl ? String(taxEl.value || "").trim() : "";
    const hoiS = hoiEl ? String(hoiEl.value || "").trim() : "";
    const hoaS = hoaEl ? String(hoaEl.value || "").trim() : "";
    const taxN = taxS ? parseNum(taxS) : NaN;
    const hoiN = hoiS ? parseNum(hoiS) : NaN;
    const hoaN = hoaS ? parseNum(hoaS) : NaN;
    return {
      tax: advTaxTouched
        ? (taxS && isFinite(taxN) && taxN >= 0 ? taxN : null)
        : null,
      hoi: advHoiTouched
        ? (hoiS && isFinite(hoiN) && hoiN >= 0 ? hoiN : null)
        : null,
      hoa: isFinite(hoaN) && hoaN >= 0 ? hoaN : 0
    };
  }

  function fixedCostsForP(price, stateAbbr, adv) {
    const a = adv || { tax: null, hoi: null, hoa: 0 };
    const b = bucketBasis50k(price);
    const st = String(stateAbbr || "").toUpperCase();
    const tax = a.tax != null ? a.tax : Math.round(S.estimateAnnualTaxes(b, st));
    const hoi = a.hoi != null ? a.hoi : Math.round(S.estimateAnnualHoiByAffordRate(b, st));
    const hoa = isFinite(a.hoa) && a.hoa > 0 ? a.hoa : 0;
    return { tax, hoi, hoa };
  }

  function setupPillToggle(groupId, onChange) {
    const group = $(groupId);
    if (!group) return;
    const pills = group.querySelectorAll(".pill");
    pills.forEach((p) => {
      p.addEventListener("click", () => {
        pills.forEach((q) => {
          q.classList.remove("active");
          q.setAttribute("aria-checked", "false");
        });
        p.classList.add("active");
        p.setAttribute("aria-checked", "true");
        if (typeof onChange === "function") onChange(p.dataset.val);
      });
    });
  }

  function getPillValue(groupId) {
    const group = $(groupId);
    if (!group) return null;
    const active = group.querySelector(".pill.active");
    return active ? active.dataset.val : null;
  }

  function setPillValue(groupId, val) {
    const group = $(groupId);
    if (!group) return;
    group.querySelectorAll(".pill").forEach((p) => {
      const on = p.dataset.val === val;
      p.classList.toggle("active", on);
      p.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function hideCalcMsg() {
    const el = $("affordCalcErr");
    if (el) { el.style.display = "none"; el.className = "msg bad"; el.textContent = ""; }
  }
  function showCalcMsg(msg, kind = "bad") {
    const el = $("affordCalcErr");
    if (!el) return;
    el.textContent = msg; el.className = "msg " + kind; el.style.display = "block";
  }
  function hideResultMsg() {
    const el = $("affordCalcErrResults");
    if (el) { el.style.display = "none"; el.className = "msg bad"; el.textContent = ""; }
  }
  function showResultMsg(msg, kind = "bad") {
    const el = $("affordCalcErrResults");
    if (!el) return;
    el.textContent = msg; el.className = "msg " + kind; el.style.display = "block";
  }

  function fillStateSelect() {
    const sel = $("propState");
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.textContent = "Select state"; ph.selected = true;
    sel.appendChild(ph);
    S.US_STATES.forEach(({ abbr, name }) => {
      const o = document.createElement("option");
      o.value = abbr; o.textContent = name + " (" + abbr + ")";
      sel.appendChild(o);
    });
  }

  function formatBlurCurrency(id) {
    const el = $(id);
    if (!el) return;
    const n = parseNum(el.value);
    if (isFinite(n) && n >= 0) el.value = fmtCurrencyInput(n);
  }

  function readFormPage1() {
    const state = $("propState").value;
    const rawGd = parseNum($("goalDownText").value);
    const goalDown = isFinite(rawGd) && rawGd > 0 ? rawGd : NaN;
    const vet = getPillValue("vetToggle") === "yes";
    const owned3 = getPillValue("owned3Toggle");
    return {
      stateAbbr: state,
      annualIncome: parseNum($("annualIncomeText").value),
      monthlyDebt: parseNum($("monthlyDebtText").value),
      veteranYes: vet,
      firstTime3yr: owned3 === "no",
      ownedInLast3: owned3 === "yes",
      goalDown
    };
  }

  function minConventionalPct(f) {
    if (f.veteranYes) return 0;
    return f.firstTime3yr ? 3 : 5;
  }

  function minConventionalDownDollars(maxPrice, f) {
    if (f.veteranYes) return 0;
    const pct = f.firstTime3yr ? 3 : 5;
    return Math.round(maxPrice * (pct / 100));
  }

  function maxHousingPaymentByDti(annualIncome, monthlyDebt, dtiPct) {
    const incM = Number(annualIncome) / 12;
    const debt = Number(monthlyDebt) || 0;
    if (!isFinite(incM) || incM <= 0) return 0;
    return Math.max(0, (Number(dtiPct) / 100) * incM - debt);
  }

  function housingAtPrice(P, downCash, program, stateAbbr, adv, includePmi) {
    const price = Number(P);
    if (!isFinite(price) || price <= 0) return Infinity;
    const cash = Math.min(Math.max(0, Number(downCash) || 0), price);
    const baseLoan = Math.max(0, price - cash);
    const ltv = price > 0 ? (baseLoan / price) * 100 : 100;

    const fixed = fixedCostsForP(price, stateAbbr, adv);
    const taxM = (fixed.tax || 0) / 12;
    const insM = (fixed.hoi || 0) / 12;
    const hoaM = fixed.hoa || 0;

    if (program === "VA") {
      const financed = baseLoan * (1 + VA_FF_FIRST / 100);
      return S.monthlyPI(financed, activeRates.VA, 360) + taxM + insM + hoaM;
    }
    if (program === "FHA") {
      const financed = baseLoan * (1 + FHA_UFMIP_PCT / 100);
      const pi = S.monthlyPI(financed, activeRates.FHA, 360);
      const mip = (baseLoan * (FHA_MONTHLY_MIP_PCT / 100)) / 12;
      return pi + mip + taxM + insM + hoaM;
    }
    const pi = S.monthlyPI(baseLoan, activeRates.CONV, 360);
    const pmi = (includePmi && ltv > 80) ? (baseLoan * (PMI_RATE_PCT / 100)) / 12 : 0;
    return pi + pmi + taxM + insM + hoaM;
  }

  function solveMaxPrice(downCash, program, maxPay, stateAbbr, adv, includePmi) {
    if (!isFinite(maxPay) || maxPay <= 0) return 0;
    let lo = Math.max(50000, downCash);
    let hi = 5000000;
    let best = 0;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const h = housingAtPrice(mid, downCash, program, stateAbbr, adv, includePmi);
      if (h <= maxPay) { best = mid; lo = mid; }
      else { hi = mid; }
    }
    return Math.round(best);
  }

  /** Sticky down %: at each trial price, down = price × (downPct/100). */
  function solveMaxPriceByDownPercent(downPct, program, maxPay, stateAbbr, adv, includePmi) {
    if (!isFinite(maxPay) || maxPay <= 0) return 0;
    if (!isFinite(downPct) || downPct <= 0) return 0;
    let lo = 50000, hi = 5000000, best = 0;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const dCash = (mid * downPct) / 100;
      const h = housingAtPrice(mid, dCash, program, stateAbbr, adv, includePmi);
      if (h <= maxPay) { best = mid; lo = mid; }
      else { hi = mid; }
    }
    return Math.round(best);
  }

  function dtiBucket(dti) {
    if (dti <= 39) return { label: "Comfortable", cls: "comfortable" };
    if (dti <= 44) return { label: "Stretch", cls: "stretch" };
    return { label: "Aggressive", cls: "aggressive" };
  }
  function renderDtiLabel() {
    const dti = Number($("dtiSlider").value);
    $("dtiValue").textContent = dti + "%";
    const b = dtiBucket(dti);
    const lbl = $("dtiLabel");
    lbl.textContent = b.label;
    lbl.className = "dti-label " + b.cls;
  }

  function updateDownSliderRange(maxPrice) {
    const floor = 50000;
    const proposed = Math.max(floor, Math.round((maxPrice * 0.5) / 10000) * 10000);
    const sl = $("downDollarSlider");
    sl.max = String(proposed);
    const lbl = $("downDollarMaxLbl");
    if (lbl) lbl.textContent = fmtK(proposed);
    if (Number(sl.value) > proposed) sl.value = String(proposed);
  }

  let currentForm = null;
  let currentProgram = "CONV";
  /** Set after each full recalc; drives sticky-% solves when the user is not moving $ down. */
  let downPctSticky = null;
  let forceDollarDownRecalc = false;
  let pendingDownDollarUserEdit = false;

  function syncFormAdvToResults() {
    const pairs = [["advTaxForm", "advTax"], ["advHoiForm", "advHoi"], ["advHoaForm", "advHoa"]];
    pairs.forEach(([a, b]) => {
      const elA = $(a);
      const elB = $(b);
      if (elA && elB) elB.value = elA.value;
    });
    const p = getPillValue("pmiFormToggle");
    if (p) setPillValue("pmiToggle", p);
  }

  function syncResultsAdvToForm() {
    const pairs = [["advTax", "advTaxForm"], ["advHoi", "advHoiForm"], ["advHoa", "advHoaForm"]];
    pairs.forEach(([a, b]) => {
      const elA = $(a);
      const elB = $(b);
      if (elA && elB) elB.value = elA.value;
    });
    const p = getPillValue("pmiToggle");
    if (p) setPillValue("pmiFormToggle", p);
  }

  function updateResultAdvancedTaxHoiDisplay(maxPrice, stateAbbr) {
    const taxEl = $("advTax");
    const hoiEl = $("advHoi");
    const hoaEl = $("advHoa");
    if (!taxEl || !hoiEl) return;
    const st = String(stateAbbr || "").toUpperCase();
    const b = bucketBasis50k(maxPrice);
    const estTax = Math.round(S.estimateAnnualTaxes(b, st));
    const estHoi = Math.round(S.estimateAnnualHoiByAffordRate(b, st));
    if (!advTaxTouched) {
      taxEl.value = fmtCurrencyInput(estTax);
      taxEl.placeholder = "(est.)";
    } else {
      if (!String(taxEl.value || "").trim()) taxEl.placeholder = "(est.)";
    }
    if (!advHoiTouched) {
      hoiEl.value = fmtCurrencyInput(estHoi);
      hoiEl.placeholder = "(est.)";
    } else {
      if (!String(hoiEl.value || "").trim()) hoiEl.placeholder = "(est.)";
    }
    if (hoaEl && !String(hoaEl.value || "").trim()) hoaEl.placeholder = "$ / mo";
  }

  function recalcAffordability() {
    if (!currentForm) return 0;
    const f = currentForm;
    const dti = Number($("dtiSlider").value);
    const maxPay = maxHousingPaymentByDti(f.annualIncome, f.monthlyDebt, dti);
    const adv = getAdvOverrides();
    const includePmi = getPillValue("pmiToggle") === "yes";

    let downCash;
    let maxPrice;

    const useDollarPath = f.veteranYes
      || pendingDownDollarUserEdit
      || downPctSticky == null
      || forceDollarDownRecalc;
    if (pendingDownDollarUserEdit) pendingDownDollarUserEdit = false;
    if (forceDollarDownRecalc) forceDollarDownRecalc = false;

    if (f.veteranYes) {
      downCash = 0;
      maxPrice = solveMaxPrice(0, currentProgram, maxPay, f.stateAbbr, adv, includePmi);
      downPctSticky = maxPrice > 0 ? 0 : null;
    } else if (useDollarPath) {
      downCash = Math.max(0, Number($("downDollarSlider").value) || 0);
      maxPrice = solveMaxPrice(downCash, currentProgram, maxPay, f.stateAbbr, adv, includePmi);
      for (let i = 0; i < 3; i++) {
        const minDown = minConventionalDownDollars(maxPrice, f);
        if (downCash >= minDown) break;
        downCash = minDown;
        maxPrice = solveMaxPrice(downCash, currentProgram, maxPay, f.stateAbbr, adv, includePmi);
        $("downDollarSlider").value = String(Math.round(downCash));
        $("downDollarText").value = fmtCurrencyInput(Math.round(downCash));
      }
      downPctSticky = maxPrice > 0 ? (downCash / maxPrice) * 100 : null;
    } else {
      const minP = minConventionalPct(f);
      const pct = Math.max(downPctSticky, minP);
      maxPrice = solveMaxPriceByDownPercent(pct, currentProgram, maxPay, f.stateAbbr, adv, includePmi);
      downCash = Math.round((maxPrice * pct) / 100);
      const minD = minConventionalDownDollars(maxPrice, f);
      if (downCash < minD) downCash = minD;
      $("downDollarSlider").value = String(Math.round(downCash));
      $("downDollarText").value = fmtCurrencyInput(Math.round(downCash));
      downPctSticky = maxPrice > 0 ? (downCash / maxPrice) * 100 : null;
    }

    const fix = fixedCostsForP(maxPrice, f.stateAbbr, adv);
    const payment = housingAtPrice(maxPrice, downCash, currentProgram, f.stateAbbr, adv, includePmi);
    const loan = Math.max(0, maxPrice - downCash);
    const downPct = maxPrice > 0 ? (downCash / maxPrice) * 100 : 0;

    $("outMaxPrice").textContent = fmtUSD(maxPrice);
    $("outPayment").textContent =
      isFinite(payment) && payment > 0 ? fmtUSD(payment) + "/mo" : "—";
    $("outLoan").textContent = fmtUSD(loan);
    $("downPctDisplay").textContent = maxPrice > 0 ? downPct.toFixed(1) + "% of price" : "—";

    renderDtiLabel();
    updateDownSliderRange(maxPrice);
    updateResultAdvancedTaxHoiDisplay(maxPrice, f.stateAbbr);

    const note = $("dpMinNote");
    if (note) note.style.display = f.veteranYes ? "none" : "";

    persistAffordResult({
      stateAbbr: f.stateAbbr,
      stateName: S.stateNameFromAbbr(f.stateAbbr),
      annualIncome: f.annualIncome,
      monthlyDebt: f.monthlyDebt,
      veteranYes: f.veteranYes,
      firstTime3yr: f.firstTime3yr,
      ownedInLast3: f.ownedInLast3,
      goalDownForm: f.goalDown,
      includePmi,
      downPctSticky,
      tax: fix.tax, hoi: fix.hoi, hoa: fix.hoa,
      taxBandBasis: bucketBasis50k(maxPrice),
      dtiPct: dti,
      downCash,
      downPct,
      maxPrice, loan,
      estHousing: Math.round(payment),
      program: currentProgram,
      ratesUsed: snapshotRates(),
      ratesSource: ratesMeta.source,
      ratesAsOf: ratesMeta.asOf
    });

    if (maxPrice > 0 && loan < 150000) {
      showResultMsg(
        "Note: estimated loan of " + fmtUSD(loan) +
        " is under $150k. Results may not reflect available programs for smaller loans.",
        "warn"
      );
    } else {
      hideResultMsg();
    }

    return maxPrice;
  }

  async function runCalculate() {
    hideCalcMsg();
    formatBlurCurrency("annualIncomeText");
    formatBlurCurrency("monthlyDebtText");
    formatBlurCurrency("goalDownText");

    const f = readFormPage1();

    if (!f.stateAbbr) { showCalcMsg("Select a property state."); return; }
    if (!isFinite(f.annualIncome) || f.annualIncome < 20000) {
      showCalcMsg("Enter your annual household income (at least $20,000)."); return;
    }
    if (!isFinite(f.monthlyDebt) || f.monthlyDebt < 0) {
      showCalcMsg("Enter your monthly debts (use 0 if none)."); return;
    }

    const incM = f.annualIncome / 12;
    const preDTI = incM > 0 ? (f.monthlyDebt / incM) * 100 : 100;
    if (preDTI > 50) {
      showCalcMsg(
        "Existing monthly debt already exceeds 50% of gross monthly income. Reduce debt or increase income to use this tool."
      );
      return;
    }

    $("btnCalc").disabled = true;
    try {
      await refreshWs1Rates();
      currentForm = f;
      currentProgram = "CONV";
      downPctSticky = null;
      forceDollarDownRecalc = true;

      const wasTT = advTaxTouched;
      const wasHT = advHoiTouched;
      syncFormAdvToResults();
      const fne = (id) => !!($(id) && String($(id).value || "").trim());
      advTaxTouched = advFormTaxEdited || (wasTT && fne("advTax"));
      advHoiTouched = advFormHoiEdited || (wasHT && fne("advHoi"));
      advFormTaxEdited = false;
      advFormHoiEdited = false;
      const ab = $("advBody");
      const at = $("advToggle");
      if (ab) { ab.style.display = "none"; }
      if (at) { at.setAttribute("aria-expanded", "false"); }

      const maxPay0 = maxHousingPaymentByDti(f.annualIncome, f.monthlyDebt, 39);
      const adv0 = { tax: null, hoi: null, hoa: 0 };

      let initialDown = 0;
      if (f.veteranYes) {
        initialDown = 0;
      } else if (isFinite(f.goalDown) && f.goalDown > 0) {
        initialDown = Math.round(f.goalDown);
      } else {
        const m0 = solveMaxPrice(0, "CONV", maxPay0, f.stateAbbr, adv0, false);
        let d = ceilToNearest5000(0.05 * m0);
        const m1 = solveMaxPrice(d, "CONV", maxPay0, f.stateAbbr, adv0, false);
        d = ceilToNearest5000(0.05 * m1);
        initialDown = d;
      }

      $("dtiSlider").value = "39";
      renderDtiLabel();
      $("downDollarSlider").value = String(initialDown);
      $("downDollarText").value = fmtCurrencyInput(initialDown);

      recalcAffordability();
      showResultsView();
    } finally {
      $("btnCalc").disabled = false;
    }
  }

  function persistAffordResult(data) {
    sessionStorage.setItem("azm_afford_result", JSON.stringify(data));
  }

  function openLead() {
    $("leadModal").setAttribute("aria-hidden", "false");
    $("leadErr").style.display = "none";
    ["leadFirstErr", "leadLastErr", "leadPhoneErr", "leadEmailErr",
     "leadCreditErr", "leadVeteranErr", "leadFirstTimeErr", "leadTimelineErr"].forEach((id) => {
      const el = $(id);
      if (el) { el.style.display = "none"; el.textContent = ""; }
    });
    const formVet = getPillValue("vetToggle");
    if (formVet && !$("leadVeteran").value) $("leadVeteran").value = formVet;
    const o3 = getPillValue("owned3Toggle");
    if (o3 && !$("leadFirstTime").value) {
      $("leadFirstTime").value = o3 === "no" ? "yes" : "no";
    }
  }
  function closeLead() {
    $("leadModal").setAttribute("aria-hidden", "true");
  }

  function validateLead() {
    let ok = true;
    const nameRe = /^[A-Za-z][A-Za-z' -]{1,}$/;
    const first = $("leadFirst").value.trim();
    const last = $("leadLast").value.trim();
    const phone = $("leadPhone").value.trim();
    const email = $("leadEmail").value.trim();
    const credit = $("leadCredit").value;
    const vet = $("leadVeteran").value;
    const ft = $("leadFirstTime").value;
    const tl = $("leadTimeline").value;

    const err = (id, msg) => { const e = $(id); e.textContent = msg; e.style.display = "block"; ok = false; };

    if (!nameRe.test(first)) err("leadFirstErr", "Enter first name (2+ letters.)");
    else $("leadFirstErr").style.display = "none";
    if (!nameRe.test(last)) err("leadLastErr", "Enter last name (2+ letters.)");
    else $("leadLastErr").style.display = "none";
    const phoneRe = /^\s*(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\s*$/;
    if (!phoneRe.test(phone)) err("leadPhoneErr", "Enter a valid 10-digit phone.");
    else $("leadPhoneErr").style.display = "none";
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRe.test(email)) err("leadEmailErr", "Enter a valid email.");
    else $("leadEmailErr").style.display = "none";
    if (!credit) err("leadCreditErr", "Select a credit score bucket.");
    else $("leadCreditErr").style.display = "none";
    if (!vet) err("leadVeteranErr", "Please answer veteran status.");
    else $("leadVeteranErr").style.display = "none";
    if (!ft) err("leadFirstTimeErr", "Please answer first-time buyer.");
    else $("leadFirstTimeErr").style.display = "none";
    if (!tl) err("leadTimelineErr", "Select a timeline.");
    else $("leadTimelineErr").style.display = "none";

    return ok;
  }

  function creditBucketToFico(bucket) {
    switch (bucket) {
      case "excellent": return 760;
      case "good":      return 720;
      case "fair":      return 660;
      case "poor":      return 580;
      default:          return 720;
    }
  }

  function recommendProgram(veteranYes, fico) {
    if (veteranYes) return { ui: "VA",   name: "VA",           blurb: "VA loans offer competitive options for eligible veterans with no monthly PMI." };
    if (fico < 700) return { ui: "FHA",  name: "FHA",          blurb: "FHA may be a strong fit for this credit profile \u2014 flexible terms and lower down payment options." };
    return              { ui: "CONV", name: "Conventional", blurb: "Conventional is a solid starting point for your profile." };
  }

  async function submitLead() {
    if (!validateLead()) return;
    await refreshWs1Rates();

    const token = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : String(Date.now());

    localStorage.setItem("azm_leadToken", token);
    localStorage.setItem("azm_leadFirst", $("leadFirst").value.trim());
    localStorage.setItem("azm_leadLast", $("leadLast").value.trim());
    localStorage.setItem("azm_leadPhone", $("leadPhone").value.trim());
    localStorage.setItem("azm_leadEmail", $("leadEmail").value.trim());
    localStorage.setItem("azm_leadTimeline", $("leadTimeline").value);

    const creditBucket = $("leadCredit").value;
    const fico = creditBucketToFico(creditBucket);
    const veteranYes = $("leadVeteran").value === "yes";
    const twoPlus = $("leadBorrowers").value === "2";
    const firstTime = $("leadFirstTime").value === "yes";
    const downAvail = $("leadDownAvail").value.trim();
    const downAvailNum = downAvail ? Number(downAvail) : null;

    const f = currentForm;
    const rec = recommendProgram(veteranYes, fico);
    if (!f) return;

    const dti = Number($("dtiSlider").value);
    const downCashCur = Math.max(0, Number($("downDollarSlider").value) || 0);
    const adv = getAdvOverrides();
    const includePmi = getPillValue("pmiToggle") === "yes";
    const maxPay = maxHousingPaymentByDti(f.annualIncome, f.monthlyDebt, dti);
    const maxForRec = solveMaxPrice(downCashCur, rec.ui, maxPay, f.stateAbbr, adv, includePmi);
    const fix = fixedCostsForP(maxForRec, f.stateAbbr, adv);
    const loanRec = Math.max(0, maxForRec - downCashCur);
    const payRec = Math.round(housingAtPrice(maxForRec, downCashCur, rec.ui, f.stateAbbr, adv, includePmi));

    const raw = sessionStorage.getItem("azm_afford_result");
    const base = raw ? JSON.parse(raw) : {};

    sessionStorage.setItem("azm_funnel_payload", JSON.stringify({
      ...base,
      programUI: rec.ui,
      veteran: veteranYes,
      creditBucket,
      fico,
      twoPlusBorrowers: twoPlus,
      firstTimeBuyer: firstTime,
      downPaymentAvailable: isFinite(downAvailNum) ? downAvailNum : null,
      downCash: downCashCur,
      dtiPct: dti,
      fixedCosts: fix,
      includePmi,
      maxPriceRecommended: maxForRec,
      loanRecommended: loanRec,
      estHousingRecommended: payRec,
      ratesUsed: snapshotRates(),
      ratesSource: ratesMeta.source,
      ratesAsOf: ratesMeta.asOf,
      funnelLeadComplete: true,
      fromFunnel: true
    }));

    $("recommendTitle").textContent = "We suggest: " + rec.name;

    const sugNameForBody = programDisplayName(rec.ui);
    const leadIn =
      "Based on your profile, we suggest " +
      sugNameForBody +
      ", but other calculators may be available options based on your responses.";
    const statsLine =
      rec.blurb + " Estimated max price about " + fmtUSD(maxForRec) +
      " (loan about " + fmtUSD(loanRec) + ", housing about " + fmtUSD(payRec) + "/mo) using your current scenario.";
    $("recommendBody").textContent = embeddedAffordWebsite ? leadIn : statsLine;

    $("funnelNext").style.display = "none";
    buildCalcButtons(veteranYes, fico, loanRec, rec.ui);
    $("recommendBox").classList.add("visible");
    $("recommendBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
    closeLead();
    syncAffordStickyFooter();
    notifyParentEmbedHeight();
  }

  function notifyParentEmbedHeight() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.__azmIframeNotifyHeight === "function") window.__azmIframeNotifyHeight();
      });
    });
  }

  /** Sticky footer when affordweb embedded in iframe (paired with compact embed CSS). */
  function syncAffordStickyFooter() {
    if (PAGE_VARIANT !== "web" || !embeddedAffordWebsite || !$("affordEmbedFooter")) return;

    const formViewEl = $("affordFormView");
    const isForm = formViewEl && window.getComputedStyle(formViewEl).display !== "none";

    const stackForm = $("affordStickyForm");
    const stackLead = $("affordStickyLead");
    const stackCalc = $("affordStickyCalc");
    if (!stackForm || !stackLead || !stackCalc) return;

    stackForm.style.display = "none";
    stackLead.style.display = "none";
    stackCalc.style.display = "none";

    const foot = $("affordEmbedFooter");

    /* Step 1: primary actions stay in-flow in the panel; hiding them for a duplicate sticky bar caused a large gray gap */
    if (isForm) {
      if (foot) foot.classList.remove("afford-embed-footer--visible");
      return;
    }

    const fn = $("funnelNext");
    const leadVisible = fn && window.getComputedStyle(fn).display !== "none";
    const rec = $("recommendBox");
    const recVisible = rec && rec.classList.contains("visible");

    /* In-panel CTAs only (form, lead, recommend). No sticky bar on any results phase. */
    if (recVisible || leadVisible) {
      if (foot) foot.classList.remove("afford-embed-footer--visible");
      return;
    }

    if (foot) foot.classList.remove("afford-embed-footer--visible");
  }

  function syncAffordWebEmbeddedHeader(which) {
    if (PAGE_VARIANT !== "web" || !embeddedAffordWebsite) return;
    const sub = $("affordSubhead");
    if (!sub) return;
    sub.textContent = which === "results" ? WEB_EMBEDDED_SUB.results : WEB_EMBEDDED_SUB.form;
    const badge = $("funnelBadge");
    if (badge) badge.style.display = "none";
  }

  function showFormView() {
    syncResultsAdvToForm();
    $("affordFormView").style.display = "";
    $("affordResultsView").style.display = "none";
    syncAffordWebEmbeddedHeader("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
    syncAffordStickyFooter();
    notifyParentEmbedHeight();
  }
  function showResultsView() {
    $("affordFormView").style.display = "none";
    $("affordResultsView").style.display = "";
    syncAffordWebEmbeddedHeader("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
    syncAffordStickyFooter();
    notifyParentEmbedHeight();
  }
  function goSimpleWithProgram(prog) {
    window.location.href = "/live/?funnel=1&program=" + prog;
  }

  const FHA_LOAN_LIMIT_2026 = 541287;

  function programDisplayName(ui) {
    return ui === "CONV" ? "Conventional" : ui === "FHA" ? "FHA" : "VA";
  }

  /** When embedded: program buttons sit in #recommendBox (same row pattern as “Want tailored rates?”). */
  function buildCalcButtons(veteranYes, fico, estLoan, suggestedProg) {
    const group = $("calcBtnGroup");
    if (!group) return;
    group.innerHTML = "";

    let eligibleProgs;
    if (veteranYes && fico >= 620)       eligibleProgs = ["CONV", "FHA", "VA"];
    else if (veteranYes && fico < 620)   eligibleProgs = ["FHA", "VA"];
    else if (!veteranYes && fico >= 620) eligibleProgs = ["CONV", "FHA"];
    else                                 eligibleProgs = ["FHA"];

    const btnLabel = (p) =>
      p === "CONV" ? "Conventional Calculator" : p === "FHA" ? "FHA Calculator" : "VA Calculator";

    const embedWeb = PAGE_VARIANT === "web" && embeddedAffordWebsite;

    if (embedWeb) {
      const row = document.createElement("div");
      row.className = "form-inline-actions recommend-calc-actions";
      row.style.cssText = "justify-content:flex-start;";
      const ordered = [suggestedProg, ...eligibleProgs.filter((x) => x !== suggestedProg)];
      const seen = new Set();
      ordered.forEach((p) => {
        if (seen.has(p)) return;
        seen.add(p);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = p === suggestedProg ? "btn btn-primary" : "btn";
        btn.textContent = btnLabel(p);
        btn.addEventListener("click", () => goSimpleWithProgram(p));
        row.appendChild(btn);
      });
      group.appendChild(row);
    } else {
      const sugName = programDisplayName(suggestedProg);
      const hintText =
        "Based on your profile, we suggest " +
        sugName +
        ", but other calculators may be available options based on your responses.";
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "btn btn-primary";
      primary.style.cssText = "width:100%;box-sizing:border-box;";
      primary.textContent = btnLabel(suggestedProg);
      primary.addEventListener("click", () => goSimpleWithProgram(suggestedProg));
      group.appendChild(primary);

      const secondary = eligibleProgs.filter((p) => p !== suggestedProg);
      if (secondary.length > 0) {
        const hint = document.createElement("p");
        hint.className = "helper-notes recommend-program-hint";
        hint.style.marginTop = "12px";
        hint.textContent = hintText;
        group.appendChild(hint);

        const secRow = document.createElement("div");
        secRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;";
        secondary.forEach((p) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn";
          btn.textContent = btnLabel(p);
          btn.addEventListener("click", () => goSimpleWithProgram(p));
          secRow.appendChild(btn);
        });
        group.appendChild(secRow);
      }
    }

    const warnEl = $("fhaLimitWarn");
    if (warnEl) {
      if (suggestedProg !== "FHA" && eligibleProgs.includes("FHA") && estLoan > FHA_LOAN_LIMIT_2026) {
        warnEl.textContent =
          "*Note: the 2026 FHA max loan amount is $541,287 and your estimated loan of " +
          fmtUSD(estLoan) +
          " may not be available in your county. Exceptions apply based on county \u2014 please contact us to confirm.";
        warnEl.style.display = "block";
      } else {
        warnEl.style.display = "none";
      }
    }
  }

  function resetForm() {
    hideCalcMsg();
    ["annualIncomeText", "monthlyDebtText", "goalDownText",
     "advTax", "advHoi", "advHoa", "advTaxForm", "advHoiForm", "advHoaForm"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    fillStateSelect();
    setPillValue("vetToggle", "no");
    setPillValue("owned3Toggle", "no");
    setPillValue("pmiToggle", "no");
    setPillValue("pmiFormToggle", "no");
    const advBody = $("advBody");
    const advToggle = $("advToggle");
    if (advBody) advBody.style.display = "none";
    if (advToggle) advToggle.setAttribute("aria-expanded", "false");
    const advFormBody = $("advFormBody");
    const advFormToggle = $("advFormToggle");
    if (advFormBody) advFormBody.style.display = "none";
    if (advFormToggle) advFormToggle.setAttribute("aria-expanded", "false");
    advTaxTouched = false;
    advHoiTouched = false;
    advFormTaxEdited = false;
    advFormHoiEdited = false;

    $("dtiSlider").value = "39";
    renderDtiLabel();
    $("downDollarSlider").value = "0";
    $("downDollarText").value = "";
    downPctSticky = null;
    $("recommendBox").classList.remove("visible");
    const progRow = $("affordProgBtnRow");
    if (progRow) progRow.innerHTML = "";
    $("funnelNext").style.display = "";
    currentForm = null;
    hideResultMsg();
    showFormView();
  }

  if (PAGE_VARIANT === "web") {
    const form = $("affordFormView");
    const res = $("affordResultsView");
    if (form) form.style.paddingTop = "12px";
    if (res) res.style.paddingTop = "12px";
    if (embeddedAffordWebsite) syncAffordWebEmbeddedHeader("form");
  }

  fillStateSelect();
  renderDtiLabel();
  refreshWs1Rates();

  ["annualIncomeText", "monthlyDebtText", "advTaxForm", "advHoiForm", "advHoaForm"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("focus", () => { el.value = stripRaw(el.value); });
    el.addEventListener("blur", () => formatBlurCurrency(id));
  });
  function wireResultAdvTaxHoi(id, isTax) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("focus", () => { el.value = stripRaw(el.value); });
    el.addEventListener("input", () => {
      if (isTax) advTaxTouched = true;
      else advHoiTouched = true;
    });
    el.addEventListener("blur", () => {
      if (!stripRaw(el.value)) {
        if (isTax) advTaxTouched = false;
        else advHoiTouched = false;
      }
      formatBlurCurrency(id);
      recalcAffordability();
    });
  }
  wireResultAdvTaxHoi("advTax", true);
  wireResultAdvTaxHoi("advHoi", false);
  function bindFormAdvEdited(id, isTax) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (isTax) advFormTaxEdited = true;
      else advFormHoiEdited = true;
    });
    el.addEventListener("blur", () => {
      if (!stripRaw(el.value)) {
        if (isTax) advFormTaxEdited = false;
        else advFormHoiEdited = false;
      }
    });
  }
  bindFormAdvEdited("advTaxForm", true);
  bindFormAdvEdited("advHoiForm", false);
  const hoaR = $("advHoa");
  if (hoaR) {
    hoaR.addEventListener("focus", () => { hoaR.value = stripRaw(hoaR.value); });
    hoaR.addEventListener("change", () => { recalcAffordability(); });
    hoaR.addEventListener("blur", () => {
      formatBlurCurrency("advHoa");
      recalcAffordability();
    });
  }
  const goalDownEl = $("goalDownText");
  if (goalDownEl) {
    goalDownEl.addEventListener("focus", () => { goalDownEl.value = stripRaw(goalDownEl.value); });
    goalDownEl.addEventListener("blur", () => {
      const n = parseNum(goalDownEl.value);
      if (!isFinite(n) || n <= 0) goalDownEl.value = "";
      else formatBlurCurrency("goalDownText");
    });
  }
  setupPillToggle("vetToggle");
  setupPillToggle("owned3Toggle");
  setupPillToggle("pmiFormToggle");
  setupPillToggle("pmiToggle", () => { recalcAffordability(); });

  $("btnCalc").addEventListener("click", runCalculate);
  $("btnReset").addEventListener("click", resetForm);
  $("btnEditScenario").addEventListener("click", showFormView);
  $("btnOpenLead").addEventListener("click", openLead);

  if ($("btnCalcSticky")) {
    $("btnCalcSticky").addEventListener("click", () => $("btnCalc").click());
    $("btnResetSticky").addEventListener("click", () => $("btnReset").click());
    $("btnOpenLeadSticky").addEventListener("click", () => $("btnOpenLead").click());
    $("btnEditScenarioSticky").addEventListener("click", () => $("btnEditScenario").click());
  }

  function wireAdvToggle(toggleId, bodyId) {
    const t = $(toggleId);
    if (!t) return;
    t.addEventListener("click", () => {
      const body = $(bodyId);
      if (!body) return;
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "" : "none";
      t.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });
  }
  wireAdvToggle("advToggle", "advBody");
  wireAdvToggle("advFormToggle", "advFormBody");

  $("dtiSlider").addEventListener("input", () => {
    renderDtiLabel();
    recalcAffordability();
  });
  $("downDollarSlider").addEventListener("input", () => {
    pendingDownDollarUserEdit = true;
    const v = Number($("downDollarSlider").value) || 0;
    $("downDollarText").value = fmtCurrencyInput(v);
    recalcAffordability();
  });
  $("downDollarText").addEventListener("focus", () => {
    $("downDollarText").value = stripRaw($("downDollarText").value);
  });
  $("downDollarText").addEventListener("blur", () => {
    pendingDownDollarUserEdit = true;
    const n = Math.max(0, parseNum($("downDollarText").value) || 0);
    const sl = $("downDollarSlider");
    const maxV = Number(sl.max) || 200000;
    const clamped = Math.min(n, maxV);
    sl.value = String(clamped);
    $("downDollarText").value = fmtCurrencyInput(clamped);
    recalcAffordability();
  });

  $("leadBackdrop").addEventListener("click", closeLead);
  $("leadClose").addEventListener("click", closeLead);
  $("leadCancel").addEventListener("click", closeLead);
  $("leadSubmit").addEventListener("click", submitLead);

  /* embed-resize.js runs after this file; reschedule sticky sync once html.azm-iframe-embed is set */
  setTimeout(() => {
    syncAffordStickyFooter();
    notifyParentEmbedHeight();
  }, 0);
})();
