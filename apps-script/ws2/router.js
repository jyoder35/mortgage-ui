// ---- router.gs ----
function doPost(e){
  try{
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();

    let body = {};
  if (e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (_) {}
  }

  // DSCR landing page: { input, minDscr?, pricingFastMode?, pricingDiagnostics? }
  if (body && body.input && String(body.input.program || '').toUpperCase() === 'DSCR') {
    const minD = body.minDscr != null ? Number(body.minDscr) : 1.1;
    const out = dscrThreeScenarios_(body.input, minD, {
      fast: !!body.pricingFastMode,
      diagnostics: !!body.pricingDiagnostics,
    });
    if (!out.ok) return json_(out);
    return json_(out);
  }
    
    if (action === 'price'){
      const payload = body.payload || {};
      const defaultPointsCsv = '-1,-0.5,0,0.5,1,1.5,2,2.5,3';
      const pointsCsv = String((e.parameter && e.parameter.points) || defaultPointsCsv);
      const fields    = String((e.parameter && e.parameter.fields) || 'full').toLowerCase();
      const debug     = !!((e.parameter && e.parameter.debug) && String(e.parameter.debug) !== '0');

      const opts = {
        curvePoints: pointsCsv.split(',').map(s => Number(s.trim())).filter(n => isFinite(n)),
        fields, debug
      };
      return json_(priceScenario_(payload, opts));
    }

    return json_({ ok:false, error:'Unknown action' });
  }catch(err){
    return json_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

// ---- debug.gs ----
// GET helpers so you can inspect what the server is reading
function doGet(e){
  const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
  if (action === 'ping') return json_({ ok:true, engine: ENGINE_MODEL });

  if (action === 'debug-pmi'){
    const ltv  = Number(e.parameter && e.parameter.ltv  || 95);
    const fico = Number(e.parameter && e.parameter.fico || 656);

    const src  = loadPmiSource_();
    const [c0,c1,a] = locateSpan_(src.grid.columns, ltv);
    const [r0,r1,b] = locateSpan_(src.grid.ficoBands, fico);

    return json_({
      ok: true,
      engine: ENGINE_MODEL,
      inputs: { ltv, fico },
      multipliers: src.multipliers,
      columns: src.grid.columns,
      ficoBands: src.grid.ficoBands,
      brackets: { c0,c1,alpha:a, r0,r1,beta:b }
    });
  }

  if (action === 'debug-llpa'){
    const ltv  = Number(e.parameter && e.parameter.ltv  || 95);
    const fico = Number(e.parameter && e.parameter.fico || 656);
    const txn  = String(e.parameter && e.parameter.txn || 'PURCHASE').toUpperCase();

    const src  = loadLlpaSource_();
    const grid = (txn === 'CASHOUT') ? src.cashout : ((txn==='RT'||txn==='RTREFI')?src.rt:src.purchase);

    const [c0,c1,a] = locateSpan_(grid.columns, ltv);
    const [r0,r1,b] = locateSpan_(grid.ficoBands, fico);

    return json_({
      ok: true,
      engine: ENGINE_MODEL,
      inputs: { ltv, fico, txn },
      columns: grid.columns,
      ficoBands: grid.ficoBands,
      brackets: { c0,c1,alpha:a, r0,r1,beta:b }
    });
  }

  return json_({ ok:false, error: 'Unknown or missing action' });
}