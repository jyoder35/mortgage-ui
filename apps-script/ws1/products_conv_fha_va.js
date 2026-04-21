// ---- products_conv_fha_va.gs ----
function buildProduct_(cfg){
  try{
    if (!cfg.seriesMap) throw new Error("Unable to fetch FRED series: " + cfg.seriesId);
    const latest = getLatestSeriesValue_(cfg.seriesMap);
    if (!latest) throw new Error("No latest series value found for: " + cfg.seriesId);

    const cal = computeCalibration_(cfg.seriesMap, cfg.calRows, cfg.minCalN);
    if (!cal) throw new Error("Calibration unavailable for " + cfg.label + " (need >= " + cfg.minCalN + ").");

    const wholesalePar = latest.value + cal.spreadMedian;

    const slopeMedian = cal.pricePer1RateMedian;
    const slopeUsedNearPar = clamp_(slopeMedian, cfg.nearParClamp.lo, cfg.nearParClamp.hi);
    const ratePerPointNearPar = 1 / Math.abs(slopeUsedNearPar);

    const lpcRateBump = cfg.lpc * ratePerPointNearPar;
    const rate0ptLPC  = wholesalePar + lpcRateBump;

    const belowPtsPerRate = cfg.piecewise.belowPar.ptsPerRate;
    const abovePtsPerRate = cfg.piecewise.abovePar.ptsPerRate;
    const ratePerPointBelowPar = 1 / Math.abs(belowPtsPerRate);
    const ratePerPointAbovePar = 1 / Math.abs(abovePtsPerRate);

    return {
      index: latest,
      calibration: {
        n: cal.n,
        dropped: cal.dropped,
        spreadMedian: round3_(cal.spreadMedian),
        spreadMean: round3_(cal.spreadMean),
        pricePer1RateMean: round3_(cal.pricePer1RateMean),
        pricePer1RateMedian: round3_(cal.pricePer1RateMedian),
        pricePer1RateUsedNearPar: round3_(slopeUsedNearPar)
      },
      wholesalePar: round3_(wholesalePar),
      lpcRateBump: round3_(lpcRateBump),
      rate0ptLPC: round3_(rate0ptLPC),
      slopes: {
        nearPar: { ptsPerRate: round6_(slopeUsedNearPar), ratePerPoint: round6_(ratePerPointNearPar) },
        belowPar:{ region:"points in [+1.0, +3.0]", ptsPerRate: round6_(belowPtsPerRate), ratePerPoint: round6_(ratePerPointBelowPar) },
        abovePar:{ region:"points <= -0.5",         ptsPerRate: round6_(abovePtsPerRate), ratePerPoint: round6_(ratePerPointAbovePar) }
      }
    };
  }catch(err){
    return null;
  }
}
