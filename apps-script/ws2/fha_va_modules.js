// ---- fha_va_modules.gs ----
const FHA_DEFAULT_UFMIP_PCT = 1.75; // %

function applyFHA_(baseLoan, ltvPct, fico, financeUFMIP, annualMipPct){
  const ufmip = baseLoan * (FHA_DEFAULT_UFMIP_PCT / 100);
  const totalLoan = financeUFMIP ? (baseLoan + ufmip) : baseLoan;
  return { ufmipPct: FHA_DEFAULT_UFMIP_PCT, ufmip, totalLoan, annualMipPct };
}

function vaFundingFeePct_(firstUse, exempt, downPct, irrrl){
  if (exempt) return 0;
  if (irrrl)  return 0.5;
  if (downPct >= 10) return 1.25;
  if (downPct >= 5)  return 1.50;
  return firstUse ? 2.15 : 3.30;
}
function applyVA_(baseLoan, firstUse, exempt, downPct, financeFF, irrrl){
  const ffPct = vaFundingFeePct_(firstUse, exempt, downPct, irrrl);
  const ff = baseLoan * (ffPct / 100);
  const totalLoan = financeFF ? (baseLoan + ff) : baseLoan;
  return { ffPct, ff, totalLoan };
}