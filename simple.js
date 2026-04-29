/**
 * Live Estimate: 30yr fixed purchase, 0-pt baseline, minimal fields.
 * Prefills from sessionStorage (afford funnel) when present.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.AZMShared;

  const WS2_PRICE =
    "https://script.google.com/macros/s/AKfycbzM2epYNmWxxIP5Sp4Fnl1iz4tCcSf_lCVGb0Hm-0pQBaST8mb8EsQ-jVC6_5WIXZon/exec?action=price&curve=9&points=-1,-0.5,0,0.5,1,1.5,2,2.5,3&fields=core";
  const WS4_LOG =
    "https://script.google.com/macros/s/AKfycbx146CZOaBxUg2fKGZKyGiTGKQbpcM7CgFtCU01boTLgh6JhaksMgZKSYx4oeeujrS7pA/exec";

  const FHA_UFMIP_PCT = 1.75;
  function vaFFPct_UI(firstUse, exempt, downPct) {
    if (exempt) return 0;
    if (downPct >= 10) return 1.25;
    if (downPct >= 5) return 1.5;
    return firstUse ? 2.15 : 3.3;
  }

  const params = new URLSearchParams(window.location.search);
  const FUNNEL = params.get("funnel") === "1";

  let leadToken = localStorage.getItem("azm_leadToken") || "";
  let lastQuote = null;
  let zipResolved = false;
  let stateAbbr = "AZ";
  let estimateResultsVisible = false;

  const fmtUSD = (n) => (isFinite(+n) ? "$" + Math.round(+n).toLocaleString() : "—");
  const fmtRate = (r) =>
    isFinite(+r) ? (+r).toFixed(3).replace(/\.?0+$/, "") + "%" : "—";
  const monthly = (n) => (isFinite(+n) ? Math.round(+n / 12) : 0);
  const monthlyHoa = (h) => { const x = Number(h); return isFinite(x) ? Math.round(x) : 0; };
  const clamp = (n, lo, hi) => { n = Number(n); if (!isFinite(n)) return lo; return Math.max(lo, Math.min(hi, n)); };

  /** Strip commas/spaces so a formatted field value can be parsed as a number. */
  const stripComma = (s) => String(s || "").replace(/,/g, "").trim();
  /** Parse a field value that may contain commas. */
  const numField = (id) => { const el = $(id); return el ? Number(stripComma(el.value)) : 0; };
  /** Format a non-negative integer with thousands commas for display in an input. */
  const fmtComma = (n) => (isFinite(+n) && +n >= 0 ? Math.round(+n).toLocaleString() : "");

  const elSimpleMain = $("simpleMain");

  /** Reformat the three currency structure fields with commas after sync/blur. */
  function formatStructureFields() {
    ["value", "equity", "loan"].forEach((id) => {
      const el = $(id);
      if (!el || el.value === "") return;
      const n = numField(id);
      if (isFinite(n) && n >= 0) el.value = fmtComma(n);
    });
  }

  function normalizeZip(z) {
    const d = String(z ?? "").replace(/\D/g, "");
    return d.length >= 5 ? d.slice(0, 5) : "";
  }

  function notifyParentIframeHeight() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.__azmIframeNotifyHeight === "function") window.__azmIframeNotifyHeight();
      });
    });
  }

  function toast(msg, type = "info") {
    const host = $("toastHost");
    if (!host) return;
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.textContent = msg;
    host.appendChild(div);
    requestAnimationFrame(() => div.classList.add("in"));
    setTimeout(() => { div.classList.remove("in"); setTimeout(() => host.removeChild(div), 240); }, 2400);
  }

  function showFoot(text, cls = "") {
    const el = $("footerIndicator");
    if (el) { el.textContent = text; el.className = "footer-indicator" + (cls ? " " + cls : ""); }
  }

  // ── View management ──────────────────────────────────────────────────────────

  const FORM_PANEL_IDS = ["panelScenario", "panelStructure", "panelTaxes", "panelCredit"];

  function showFormPanels() {
    FORM_PANEL_IDS.forEach((id) => { const el = $(id); if (el) el.style.display = ""; });
    refreshVaPanel();
    $("resultsPanel").style.display = "none";
    const editBtn = $("btnEditScenario");
    if (editBtn) editBtn.style.display = "none";
    $("btnRecalc").style.display = "";
    if (elSimpleMain) elSimpleMain.classList.remove("simple-main--results");
    window.scrollTo({ top: 0, behavior: "smooth" });
    notifyParentIframeHeight();
  }

  function showResultsPanel() {
    FORM_PANEL_IDS.forEach((id) => { const el = $(id); if (el) el.style.display = "none"; });
    $("resultsPanel").style.display = "";
    const editBtn = $("btnEditScenario");
    if (editBtn) editBtn.style.display = "";
    $("btnRecalc").style.display = "none";
    if (elSimpleMain) elSimpleMain.classList.add("simple-main--results");
    window.scrollTo({ top: 0, behavior: "smooth" });
    notifyParentIframeHeight();
  }

  // ── Step badge / subheader ────────────────────────────────────────────────────

  function refreshStepBanner() {
    const badge = $("simpleStepBadge");
    const sub = $("simpleSubhead");
    if (estimateResultsVisible) {
      if (sub) sub.textContent = "Based on the information you provided. Updated in real time.";
      if (!FUNNEL) { if (badge) badge.style.display = "none"; }
      else {
        const raw = sessionStorage.getItem("azm_funnel_payload");
        let p;
        if (raw) { try { p = JSON.parse(raw); } catch { p = null; } }
        if (badge) {
          if (p && p.funnelLeadComplete) { badge.style.display = ""; badge.textContent = "Step 3 of 3"; }
          else badge.style.display = "none";
        }
      }
      return;
    }
    if (sub) sub.textContent = "Confirm your loan scenario";
    if (!FUNNEL) { if (badge) badge.style.display = "none"; return; }
    const raw = sessionStorage.getItem("azm_funnel_payload");
    if (!raw) { if (badge) badge.style.display = "none"; return; }
    let p;
    try { p = JSON.parse(raw); } catch { return; }
    if (!p.funnelLeadComplete) { if (badge) badge.style.display = "none"; return; }
    if (badge) {
      badge.style.display = "";
      badge.textContent = "Step 2 of 3";
    }
    if (sub) sub.textContent = "Verify and edit specifics to see live results of your loan scenario.";
  }

  // ── State & ZIP ───────────────────────────────────────────────────────────────

  function populateStateSelect() {
    if (!S) return;
    const sel = $("stateSelect");
    if (!sel || sel.options.length > 0) return;
    S.US_STATES.forEach(({ abbr, name }) => {
      const o = document.createElement("option");
      o.value = abbr;
      o.textContent = name + " (" + abbr + ")";
      sel.appendChild(o);
    });
  }

  function applyStateAndDefaultZip(abbr) {
    if (!S) return;
    const a = String(abbr || "AZ").toUpperCase();
    stateAbbr = a;
    const z = S.defaultZipForState(a);
    const hid = $("zip");
    if (hid) hid.value = z;
    const sel = $("stateSelect");
    if (sel) sel.value = a;
    zipResolved = normalizeZip(z).length === 5;
  }

  function refreshTaxInsFromState() {
    if (!S) return;
    const v = numField("value");
    if (!isFinite(v) || v <= 0) return;
    $("taxes").value = String(Math.round(S.estimateAnnualTaxes(v, stateAbbr)));
    $("ins").value = String(S.estimateAnnualHoi(v, stateAbbr));
  }

  // ── Effective down pct from funnel handoff ─────────────────────────────────

  function effectiveDownPctFromHandoff(p) {
    const prog = p.programUI || "CONV";
    const vet = !!p.veteran;
    const vaZero = !!p.vaZeroDownScenario;
    const raw = Number(p.downPct);
    const dp = isFinite(raw) ? raw : 10;
    if (prog === "VA" && (vet || vaZero)) return dp;
    return Math.max(3, dp);
  }

  // ── Program & LTV helpers ────────────────────────────────────────────────────

  function currentProgKind() { return $("program").value || "CONV"; }
  function backendProgram() {
    return { CONV: "CONV30", FHA: "FHA30", VA: "VA30" }[currentProgKind()] || "CONV30";
  }

  function getMaxLTV() {
    const kind = currentProgKind();
    if (kind === "FHA") return 96.5;
    if (kind === "VA") return 100;
    return $("firstTimeBuyer").checked ? 97 : 95;
  }

  function computeFinancedLoan(baseLoan) {
    const kind = currentProgKind();
    if (kind === "FHA") return Math.round(baseLoan + baseLoan * (FHA_UFMIP_PCT / 100));
    if (kind === "VA") {
      const exempt = $("vaExempt").checked;
      const first = $("vaFirstUse").checked;
      const ltv = Number($("ltv").value || 0);
      const downPct = Math.max(0, 100 - ltv);
      const ffPct = vaFFPct_UI(first, exempt, downPct);
      return Math.round(baseLoan + baseLoan * (ffPct / 100));
    }
    return baseLoan;
  }

  // ── Loan / LTV / Down sync ───────────────────────────────────────────────────

  /**
   * @param {"price"|"eq"|"pct"|"loan"} trigger - which field was changed by user
   * @param {boolean} applyCorrections - when true (blur), enforce max LTV and auto-correct
   */
  function syncLoanLtvFromStructure(trigger, applyCorrections) {
    const v = numField("value");
    let eq = numField("equity");
    let pct = Number($("equityPct").value); // pct field never has commas

    if (trigger === "pct") {
      if (isFinite(v) && v > 0 && isFinite(pct) && pct >= 0) {
        eq = Math.round(v * pct / 100);
        $("equity").value = String(eq);
      }
    } else if (trigger === "loan") {
      const loanInput = numField("loan");
      if (isFinite(v) && v > 0 && isFinite(loanInput) && loanInput >= 0) {
        eq = Math.max(0, Math.round(v - loanInput));
        $("equity").value = String(eq);
        $("equityPct").value = String(Math.round((eq / v) * 1000) / 10);
      }
    } else {
      // price or eq changed: recompute pct from eq/price
      if (isFinite(v) && v > 0 && isFinite(eq) && eq >= 0) {
        const computedPct = Math.round((eq / v) * 1000) / 10;
        $("equityPct").value = String(computedPct);
      }
    }

    // Re-read after possible updates
    eq = numField("equity");
    if (!isFinite(v) || v <= 0 || !isFinite(eq) || eq < 0) {
      $("ltvDisplay").textContent = "—";
      $("loan").value = "";
      $("ltv").value = "";
      return;
    }
    let loan = Math.round(v - eq);
    if (loan < 0) loan = 0;
    let ltv = v > 0 ? (loan / v) * 100 : 0;
    const max = getMaxLTV();
    if (applyCorrections && isFinite(ltv) && ltv > max) {
      // Only snap to max LTV when user has finished editing (blur)
      ltv = max;
      loan = Math.round(v * ltv / 100);
      eq = Math.round(v - loan);
      $("equity").value = String(eq);
      if (isFinite(v) && v > 0) $("equityPct").value = String(Math.round((eq / v) * 1000) / 10);
    }
    $("loan").value = String(loan);
    $("ltv").value = String(Math.round(ltv * 1000) / 1000);
    $("ltvDisplay").textContent = (Math.round(ltv * 100) / 100).toFixed(2) + "%";
  }

  // ── VA Specific Factors ──────────────────────────────────────────────────────

  function refreshVaPanel() {
    const isVa = currentProgKind() === "VA";
    const col = $("vaFactorsCol");
    if (col) col.style.display = isVa ? "" : "none";
  }

  function refreshVaPills() {
    ["vaExempt", "vaFirstUse"].forEach((id) => {
      const cb = $(id);
      const pill = cb?.closest(".pill");
      if (!cb || !pill) return;
      pill.classList.toggle("pill-selected", cb.checked);
    });
  }

  function initVaPills() {
    ["vaExempt", "vaFirstUse"].forEach((id) => {
      const cb = $(id);
      if (!cb) return;
      cb.addEventListener("change", () => refreshVaPills());
    });
    refreshVaPills();
  }

  // ── FICO ─────────────────────────────────────────────────────────────────────

  function effectiveFicoForPricing(programUI, entered) {
    const f = Number(entered || 0);
    if (programUI === "CONV") return Math.max(620, Math.min(850, f));
    if (programUI === "FHA" || programUI === "VA") return Math.max(580, Math.min(850, f));
    return Math.max(300, Math.min(850, f));
  }

  // ── Inputs snapshot ──────────────────────────────────────────────────────────

  function currentInputs() {
    const programUI = currentProgKind();
    const program = backendProgram();
    const baseLoan = numField("loan");
    const ltv = Number($("ltv").value || 0);
    const enteredFico = clamp($("fico").value, 300, 850);
    const pricingFico = effectiveFicoForPricing(programUI, enteredFico);
    const taxes = Number($("taxes").value || 0);
    const ins = Number($("ins").value || 0);
    const hoa = Number($("hoa").value || 0);
    const loanCalc = computeFinancedLoan(baseLoan);
    const fha = program.startsWith("FHA") ? { financeUfmip: true, annualMip: 0.55 } : undefined;
    const va = program.startsWith("VA")
      ? { exempt: $("vaExempt").checked, firstUse: $("vaFirstUse").checked }
      : undefined;
    return {
      program, programUI, txn: "PURCHASE", term: 360,
      loan: baseLoan, loanCalc, ltv,
      fico: pricingFico, ficoEntered: enteredFico, borrowerPts: 1,
      taxes, ins, hoa,
      pmiToggle: $("pmiToggle").checked,
      dtiOver45: false,
      twoPlusBorrowers: $("twoPlusBorrowers").checked,
      firstTimeBuyer: $("firstTimeBuyer").checked,
      fha, va, dscrRatio: 1.25
    };
  }

  function inputsForPricingPayload(inputs) {
    const h = Number(inputs.hoa);
    return { ...inputs, hoa: isFinite(h) ? h * 12 : 0 };
  }

  function computeCardData(quote, inputs) {
    return {
      loanCalc: inputs.loanCalc,
      rate: quote?.noteRate,
      apr: computeAPR(quote, inputs),
      pi: quote?.piMonthly,
      mi: quote?.miMonthly,
      taxesM: monthly(inputs.taxes),
      insM: monthly(inputs.ins),
      hoaM: monthlyHoa(inputs.hoa)
    };
  }

  function housingTotal(pi, mi, taxesM, insM, hoaM) {
    return (Number(pi)||0) + (Number(mi)||0) + (Number(taxesM)||0) + (Number(insM)||0) + (Number(hoaM)||0);
  }

  /**
   * Approximate APR for the displayed 1-point buydown rate.
   * Formula: noteRate + 0.10 (1pt cost amortized) + program-specific MI/FF add-ons.
   */
  function computeAPR(quote, inputs) {
    const noteRate = +quote?.noteRate;
    if (!isFinite(noteRate)) return null;
    const program = inputs.programUI;
    const ltv = +inputs.ltv;
    const baseLoan = +inputs.loan;
    const miMonthly = +(quote?.miMonthly || 0);

    let apr = noteRate + 0.10; // 1-point buydown cost contribution

    if (program === "VA") {
      const vaFirstUse = inputs.va?.firstUse ?? true;
      const vaExempt = inputs.va?.exempt ?? false;
      if (!vaExempt) {
        const ffAddon = vaFirstUse
          ? (ltv > 95 ? 0.215 : ltv > 90 ? 0.15 : 0.125)
          : (ltv > 95 ? 0.33  : ltv > 90 ? 0.15 : 0.125);
        apr += ffAddon;
      }
    } else if (program === "FHA") {
      apr += 0.175 + 0.55; // UFMIP + annual MIP contribution
    } else if (program === "CONV" && miMonthly > 0 && baseLoan > 0) {
      const annualPmiPct = (miMonthly * 12 / baseLoan) * 100;
      apr += annualPmiPct / 3; // PMI paid ~1/3 of term on average
    }

    return Math.round(apr * 1000) / 1000;
  }

  function renderKPIs(quote) {
    const inputs = currentInputs();
    const card = computeCardData(quote, inputs);
    const total = housingTotal(quote?.piMonthly, quote?.miMonthly, card.taxesM, card.insM, card.hoaM);
    $("kpiRate").textContent = fmtRate(quote?.noteRate);
    $("kpiTotal").textContent = fmtUSD(total);
    const apr = computeAPR(quote, inputs);
    const kpiAPR = $("kpiAPR");
    if (kpiAPR) kpiAPR.textContent = apr != null ? fmtRate(apr) + " APR" : "";
  }

  function fillResultCards(quote, inputs, { loanCalc, pi, mi, taxesM, insM, hoaM }) {
    const total = housingTotal(pi, mi, taxesM, insM, hoaM);
    $("with_housing").textContent = fmtUSD(total) + "/mo";
    $("with_pi").textContent = fmtUSD(pi) + "/mo";
    $("with_mi").textContent = fmtUSD(mi) + "/mo";
    $("with_taxes").textContent = fmtUSD(taxesM) + "/mo";
    $("with_ins").textContent = fmtUSD(insM) + "/mo";
    $("with_hoa").textContent = fmtUSD(hoaM) + "/mo";
    $("with_loanCalc").textContent = fmtUSD(loanCalc);
    const typeLabel = { CONV: "Conventional", FHA: "FHA", VA: "VA" }[inputs.programUI] || inputs.program || "—";
    $("with_loanType").textContent = typeLabel;
    const termM = Number(inputs.term) || 360;
    $("with_loanTerm").textContent = termM % 12 === 0 ? (termM / 12) + " Year" : termM + " mo";
    $("with_rateType").textContent = "Fixed";
  }

  function loanStructureComplete() {
    const v = numField("value");
    const loan = numField("loan");
    const eq = numField("equity");
    const ok = isFinite(v) && v > 0 && isFinite(loan) && loan > 0 && isFinite(eq) && eq >= 0;
    const msg = $("loanStructMsg");
    if (!ok) { msg.textContent = "Enter valid purchase price, down payment, and loan."; msg.style.display = "block"; }
    else { msg.style.display = "none"; }
    return ok;
  }

  function validateBeforePrice() {
    if (!normalizeZip($("zip").value)) {
      toast("Property state is not set — pick state on affordability first.", "warn");
      return false;
    }
    if (!zipResolved) { toast("Property location not ready.", "warn"); return false; }
    if (!loanStructureComplete()) return false;
    const entered = Number($("fico").value);
    if (!isFinite(entered) || entered < 300 || entered > 850) {
      $("ficoMsg").textContent = "FICO between 300 and 850.";
      $("ficoMsg").style.display = "block";
      return false;
    }
    $("ficoMsg").style.display = "none";
    return true;
  }

  // ── Logging ──────────────────────────────────────────────────────────────────

  async function logRunToQuotes(inputs, quoteWith) {
    try {
      if (!WS4_LOG) return;
      const leadMeta = {
        first: localStorage.getItem("azm_leadFirst") || "",
        last: localStorage.getItem("azm_leadLast") || "",
        email: localStorage.getItem("azm_leadEmail") || "",
        phone: localStorage.getItem("azm_leadPhone") || ""
      };
      await fetch(WS4_LOG, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "logQuote",
          payload: {
            leadToken,
            subjectZip: normalizeZip($("zip").value),
            value: numField("value"),
            inputs: { ...inputs, leadToken },
            quote: quoteWith || {},
            parQuote: null,
            leadMeta,
            attribution: { source: "live-estimate" }
          }
        }),
        keepalive: true
      });
    } catch { /* ignore */ }
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────

  async function priceSimple() {
    if (!leadToken) {
      toast("Complete the affordability step first (lead info).", "warn");
      showFoot("Sign in via affordability funnel", "bad");
      return;
    }
    if (!validateBeforePrice()) return;

    const inputs = currentInputs();
    const inputsPrice = inputsForPricingPayload(inputs);
    showFoot("Pricing…", "");
    $("btnSave").disabled = true;

    try {
      const res = await fetch(WS2_PRICE, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ payload: { inputs: inputsPrice, leadToken } })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        showFoot("Bad response from pricing", "bad"); toast("Pricing failed", "error"); return;
      }
      if (data?.error && !data?.ok) {
        showFoot(data.error || "Pricing error", "bad"); toast("Pricing error", "error"); return;
      }
      let quote = null;
      if (data?.quotes && data?.context) {
        const q = data.quotes;
        // Prefer 1-point buydown rate; fall back to 0-point then first available
        quote = q["1"] ?? q["0"] ?? Object.values(q)[0];
      } else {
        quote = data;
      }
      if (!quote || !isFinite(quote.piMonthly)) {
        showFoot("Unexpected pricing shape", "bad"); return;
      }

      lastQuote = quote;
      const cardD = computeCardData(quote, inputs);
      renderKPIs(quote);
      fillResultCards(quote, inputs, cardD);
      $("btnSave").disabled = false;
      estimateResultsVisible = true;
      showResultsPanel();
      refreshStepBanner();
      showFoot("Priced successfully", "ok");
      toast("Pricing complete", "success");
      const d = new Date();
      const month = d.toLocaleString("en-US", { month: "long" });
      const t = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      $("lastQuoted").textContent =
        "Quote generated " + month + " " + d.getDate() + " at " + t + ". Rates can change daily.";
      logRunToQuotes(inputs, quote);
    } catch {
      showFoot("Network error", "bad"); toast("Pricing failed", "error");
    }
  }

  function editScenario() {
    estimateResultsVisible = false;
    lastQuote = null;
    $("btnSave").disabled = true;
    refreshStepBanner();
    showFoot("Adjust fields, then Get Rate", "");
    showFormPanels();
  }

  // ── Email modal ──────────────────────────────────────────────────────────────

  function openEmailModal() {
    $("emailConfirm").value = localStorage.getItem("azm_leadEmail") || "";
    $("emailConfirmErr").style.display = "none";
    $("emailErr").style.display = "none";
    $("emailModal").setAttribute("aria-hidden", "false");
  }
  function closeEmailModal() { $("emailModal").setAttribute("aria-hidden", "true"); }

  async function sendQuoteEmail() {
    const email = ($("emailConfirm").value || "").trim();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(email)) {
      $("emailConfirmErr").textContent = "Valid email required.";
      $("emailConfirmErr").style.display = "block";
      return;
    }
    $("emailSubmit").disabled = true;
    try {
      const inputs = currentInputs();
      const payload = {
        action: "sendQuote", leadToken, email,
        inputs: { ...inputs, subjectZip: normalizeZip($("zip").value), value: numField("value"), equity: numField("equity") },
        quote: lastQuote,
        card: computeCardData(lastQuote, inputs),
        leadMeta: {
          first: localStorage.getItem("azm_leadFirst") || "",
          last: localStorage.getItem("azm_leadLast") || "",
          email,
          phone: localStorage.getItem("azm_leadPhone") || ""
        },
        attribution: { source: "live-estimate" }
      };
      const res = await fetch(WS4_LOG, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
      const out = await res.json();
      if (!res.ok || !out.ok) {
        $("emailErr").textContent = out.error || "Send failed"; $("emailErr").style.display = "block"; return;
      }
      closeEmailModal();
      toast("Quote emailed to " + email, "success");
    } catch {
      $("emailErr").textContent = "Network error"; $("emailErr").style.display = "block";
    } finally { $("emailSubmit").disabled = false; }
  }

  // ── Load funnel handoff ───────────────────────────────────────────────────────

  function loadHandoff() {
    const raw = sessionStorage.getItem("azm_funnel_payload") || sessionStorage.getItem("azm_afford_result");
    if (!raw) {
      if (FUNNEL) {
        const b = $("simpleBanner");
        if (b) { b.textContent = "Start with the affordability step, then return here with your numbers."; b.style.display = "block"; }
      }
      applyStateAndDefaultZip(stateAbbr);
      showFormPanels();
      return;
    }
    let p;
    try { p = JSON.parse(raw); } catch {
      applyStateAndDefaultZip(stateAbbr); showFormPanels(); return;
    }

    if (p.programUI) $("program").value = p.programUI;
    if (isFinite(p.maxPriceRecommended)) $("value").value = String(Math.round(p.maxPriceRecommended));
    else if (isFinite(p.maxPrice)) $("value").value = String(Math.round(p.maxPrice));

    const v = numField("value");
    const effDp = effectiveDownPctFromHandoff(p);
    if (isFinite(v) && v > 0) {
      $("equity").value = String(Math.round(v * effDp / 100));
      $("equityPct").value = String(effDp);
    }

    if (isFinite(p.fico)) {
      const fc = Math.max(500, Math.min(850, Math.round(p.fico)));
      $("fico").value = String(Math.round(p.fico));
      $("ficoRange").value = String(fc);
      $("ficoChip").textContent = $("fico").value;
    }

    $("firstTimeBuyer").checked = !!p.firstTimeBuyer || !!p.firstTime3yr;
    $("twoPlusBorrowers").checked = !!p.twoPlusBorrowers;
    if (p.veteran) $("vaFirstUse").checked = true;

    const abbr = p.stateAbbr || "AZ";
    applyStateAndDefaultZip(abbr);

    if (isFinite(v) && v > 0 && S) {
      if (isFinite(p.tax) && p.tax >= 0) $("taxes").value = String(Math.round(p.tax));
      else $("taxes").value = String(Math.round(S.estimateAnnualTaxes(v, abbr)));
      if (isFinite(p.hoi) && p.hoi >= 0) $("ins").value = String(Math.round(p.hoi));
      else $("ins").value = String(S.estimateAnnualHoi(v, abbr));
    }
    if (isFinite(p.hoa) && p.hoa > 0 && $("hoa")) $("hoa").value = String(Math.round(p.hoa));

    syncLoanLtvFromStructure("eq", true);
    formatStructureFields();
    estimateResultsVisible = false;
    showFormPanels();
    refreshStepBanner();
  }

  // ── DOMContentLoaded ─────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", () => {
    leadToken = localStorage.getItem("azm_leadToken") || "";

    populateStateSelect();
    loadHandoff();

    if (!normalizeZip($("zip").value) && S) applyStateAndDefaultZip(stateAbbr);
    initVaPills();

    const foot = $("linkAffordFooter");
    if (foot) foot.setAttribute("href", "/afford/");

    if (!leadToken) {
      showFoot("Complete affordability (funnel) to unlock pricing", "warn");
      $("btnRecalc").disabled = true;
    }

    // Honour ?program= URL param (set by affordability calculator buttons)
    const progParam = params.get("program");
    if (progParam && ["CONV", "FHA", "VA"].includes(progParam)) {
      $("program").value = progParam;
      syncLoanLtvFromStructure("eq", true);
      formatStructureFields();
      refreshVaPanel();
    }

    // Focus: strip commas so user can type raw numbers freely
    ["value", "equity", "loan"].forEach((id) => {
      $(id).addEventListener("focus", () => { $(id).value = stripComma($(id).value); });
    });

    // Input: live sync WITHOUT corrections (no auto-correct while the user is mid-type)
    $("value").addEventListener("input", () => { syncLoanLtvFromStructure("price", false); refreshTaxInsFromState(); });
    $("equity").addEventListener("input", () => syncLoanLtvFromStructure("eq", false));
    $("equityPct").addEventListener("input", () => syncLoanLtvFromStructure("pct", false));
    $("loan").addEventListener("input", () => syncLoanLtvFromStructure("loan", false));

    // Blur: apply corrections + reformat with commas once user leaves the field
    $("value").addEventListener("blur", () => {
      syncLoanLtvFromStructure("price", true);
      formatStructureFields();
      refreshTaxInsFromState();
    });
    $("equity").addEventListener("blur", () => {
      syncLoanLtvFromStructure("eq", true);
      formatStructureFields();
    });
    $("equityPct").addEventListener("blur", () => {
      const p = Number($("equityPct").value);
      if (isFinite(p)) $("equityPct").value = String(Math.round(p * 10) / 10);
      syncLoanLtvFromStructure("pct", true);
      formatStructureFields();
    });
    $("loan").addEventListener("blur", () => {
      const v = numField("value");
      const loan = numField("loan");
      const msg = $("loanStructMsg");
      if (isFinite(v) && v > 0 && isFinite(loan)) {
        if (loan <= 0) { if (msg) { msg.textContent = "Loan amount must be greater than 0."; msg.style.display = "block"; } }
        else if (loan > v) { if (msg) { msg.textContent = "Loan cannot exceed purchase price."; msg.style.display = "block"; } }
        else { if (msg) msg.style.display = "none"; }
      }
      syncLoanLtvFromStructure("loan", true);
      formatStructureFields();
    });

    // State dropdown
    $("stateSelect").addEventListener("change", () => {
      const abbr = $("stateSelect").value;
      if (abbr) {
        applyStateAndDefaultZip(abbr);
        refreshTaxInsFromState();
        syncLoanLtvFromStructure("eq", true);
        formatStructureFields();
      }
    });

    // Program change
    $("program").addEventListener("change", () => {
      syncLoanLtvFromStructure("eq", true);
      formatStructureFields();
      refreshVaPanel();
    });

    // FICO
    $("ficoRange").addEventListener("input", () => {
      const v = $("ficoRange").value; $("fico").value = v; $("ficoChip").textContent = v;
    });
    $("fico").addEventListener("blur", () => {
      let v = Math.max(300, Math.min(850, Math.round(Number($("fico").value) || 740)));
      $("fico").value = String(v);
      $("ficoChip").textContent = String(v);
      $("ficoRange").value = String(Math.max(500, Math.min(850, v)));
    });

    $("btnRecalc").addEventListener("click", priceSimple);
    $("btnEditScenario")?.addEventListener("click", editScenario);
    $("btnSave").addEventListener("click", () => { if (!lastQuote) { toast("Get a rate first", "warn"); return; } openEmailModal(); });
    $("emailModalBackdrop").addEventListener("click", closeEmailModal);
    $("closeEmail").addEventListener("click", closeEmailModal);
    $("cancelEmail").addEventListener("click", closeEmailModal);
    $("emailSubmit").addEventListener("click", sendQuoteEmail);
  });
})();
