// ---- rates_calibration.gs ----
function computeCalibration_(seriesMap, calRows, minN){
  const spreads = [];
  const slopes  = [];
  let dropped = 0;

  for (const row of calRows){
    const obs = getObsOnOrBefore_(seriesMap, row.d);
    if (!obs || !isFinite(obs.value) || !isFinite(row.parRate) || !isFinite(row.pricePer1Rate)){
      dropped++; continue;
    }
    spreads.push(row.parRate - obs.value);
    slopes.push(row.pricePer1Rate);
  }
  if (spreads.length < minN) return null;

  const spreadsClean = iqrTrim_(spreads);
  const slopesClean  = iqrTrim_(slopes);
  if (spreadsClean.length < minN || slopesClean.length < minN) return null;

  return {
    n: spreadsClean.length,
    dropped,
    spreadMedian: median_(spreadsClean),
    spreadMean:   mean_(spreadsClean),
    pricePer1RateMean:   mean_(slopesClean),
    pricePer1RateMedian: median_(slopesClean)
  };
}

function iqrTrim_(arr){
  const a = arr.slice().sort((x,y)=>x-y);
  const q1 = a[Math.floor(a.length*0.25)];
  const q3 = a[Math.floor(a.length*0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5*iqr;
  const hi = q3 + 1.5*iqr;
  return a.filter(v => v >= lo && v <= hi);
}