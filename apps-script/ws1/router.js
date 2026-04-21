// ---- router.gs ----
/** This Script (Workspace-1: Rates & Calibration API) Deployment URL: https://script.google.com/macros/s/AKfycbxFUmGP213ag2uV4cey3V2ox0diofarpDKNt0szGrSajVpO8CF_paFN7u_R9cPa4Y3FwA/exec */
const MODEL_VERSION = {
  model: "AZM_MULTI_BASE",
  version: "1.4.1",
  notes: [
    "Conv/FHA/VA from OBMMI + wholesale calibration",
    "IQR-trimmed medians for spread & near-par slope",
    "Piecewise slopes applied; LPC translated via near-par clamp",
    "dscr30Purchase: DSCR 30Y via WHOLESALE_CAL_DSCR30 (bootstrap +0.50 vs Conv until PDF-backed rows)"
  ]
};

function doGet(e){
  const action = String(e && e.parameter && e.parameter.action || "").toLowerCase();

  if (action === "pulse") {
    return json_(_pulse_());
  }

  if (action === "rates") {
    const lpc = toNum_((e && e.parameter && e.parameter.lpc) ? e.parameter.lpc : DEFAULT_LPC, DEFAULT_LPC);
    const out = {
      ok: true,
      asOf: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
      model: MODEL_VERSION,
      series: { conv30: SERIES_CONV30, fha30: SERIES_FHA30, va30: SERIES_VA30 },
      lpc,
      conv30Purchase: null,
      dscr30Purchase: null,
      FHA30: null,
      VA30: null,
      errors: []
    };
    try{
      const mapConv = getSeriesMap_(SERIES_CONV30);
      const mapFha  = getSeriesMap_(SERIES_FHA30);
      const mapVa   = getSeriesMap_(SERIES_VA30);

      out.conv30Purchase = buildProduct_({
        label: "conv30Purchase",
        seriesId: SERIES_CONV30,
        seriesMap: mapConv,
        calRows: WHOLESALE_CAL_CONV30,
        piecewise: PIECEWISE_SLOPES_CONV30,
        nearParClamp: { lo: 4.2, hi: 4.9 },
        minCalN: 5,
        lpc: lpc
      });

      out.FHA30 = buildProduct_({
        label: "FHA30",
        seriesId: SERIES_FHA30,
        seriesMap: mapFha,
        calRows: WHOLESALE_CAL_FHA30,
        piecewise: PIECEWISE_SLOPES_FHA30,
        nearParClamp: { lo: 3.6, hi: 4.6 },
        minCalN: 5,
        lpc: lpc
      });

      out.VA30 = buildProduct_({
        label: "VA30",
        seriesId: SERIES_VA30,
        seriesMap: mapVa,
        calRows: WHOLESALE_CAL_VA30,
        piecewise: PIECEWISE_SLOPES_VA30,
        nearParClamp: { lo: 2.8, hi: 3.6 },
        minCalN: 5,
        lpc: lpc
      });

      out.dscr30Purchase = buildProduct_({
        label: "dscr30Purchase",
        seriesId: SERIES_CONV30,
        seriesMap: mapConv,
        calRows: WHOLESALE_CAL_DSCR30,
        piecewise: PIECEWISE_SLOPES_DSCR30,
        nearParClamp: { lo: 4.2, hi: 4.9 },
        minCalN: 5,
        lpc: lpc
      });

      if (!out.conv30Purchase && !out.FHA30 && !out.VA30 && !out.dscr30Purchase){
        out.ok = false;
        out.errors.push("All series unavailable or calibration failed.");
      }
    }catch(err){
      out.ok = false;
      out.errors.push(String(err && err.message ? err.message : err));
    }
    return json_(out);
  }

  return json_({ ok:false, error:"Unknown action" });
}

// Health endpoint
function _pulse_(){
  const props = PropertiesService.getScriptProperties();
  const nowMs = Date.now();
  const series = [SERIES_CONV30, SERIES_FHA30, SERIES_VA30];
  const ages = {};
  series.forEach(id=>{
    const at = Number(props.getProperty("SERIESCSV_" + id + "_AT") || 0);
    ages[id] = at ? ((nowMs - at) / (1000*60*60)).toFixed(2) + "h" : "cold";
  });

  const maps = {
    conv: getSeriesMap_(SERIES_CONV30),
    fha:  getSeriesMap_(SERIES_FHA30),
    va:   getSeriesMap_(SERIES_VA30)
  };
  function lastObs(map){
    const keys = Object.keys(map||{}).sort();
    if (!keys.length) return null;
    const k = keys[keys.length-1];
    return { date:k, value: map[k] };
  }

  return {
    ok: true,
    model: MODEL_VERSION,
    cacheAgeHours: {
      conv30: ages[SERIES_CONV30],
      fha30:  ages[SERIES_FHA30],
      va30:   ages[SERIES_VA30]
    },
    latest: {
      conv30: lastObs(maps.conv),
      fha30:  lastObs(maps.fha),
      va30:   lastObs(maps.va)
    },
    config: { CACHE_TTL_HOURS, BACKFILL_DAYS }
  };
}