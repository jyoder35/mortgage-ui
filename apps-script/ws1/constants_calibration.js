/** ========================================================================
 * constants_calibration.gs
 * Static calibration anchors and piecewise slopes used by Workspace 1
 * These were derived from your uploaded wholesale sheets (30‑Day pricing)
 * and match the arrays you previously shipped in your API.
 * ======================================================================== */

// --------------------
// CONVENTIONAL 30Y
// --------------------
const WHOLESALE_CAL_CONV30 = [
  {d:"2025-11-06", parRate:5.715409, pricePer1Rate:3.863854},
  {d:"2025-12-08", parRate:5.660824, pricePer1Rate:3.940739},
  {d:"2025-12-18", parRate:5.623942, pricePer1Rate:4.080286},
  {d:"2025-12-19", parRate:5.682368, pricePer1Rate:3.940553},
  {d:"2025-12-22", parRate:5.681712, pricePer1Rate:3.940852},
  {d:"2025-12-23", parRate:5.704903, pricePer1Rate:3.979658},
  {d:"2025-12-24", parRate:5.666382, pricePer1Rate:3.926169},
  {d:"2025-12-26", parRate:5.577743, pricePer1Rate:3.957997},
  {d:"2025-12-29", parRate:5.593234, pricePer1Rate:3.992044},
  {d:"2025-12-30", parRate:5.631860, pricePer1Rate:3.868742},
  {d:"2025-12-31", parRate:5.641342, pricePer1Rate:3.890569},
  {d:"2026-01-02", parRate:5.652738, pricePer1Rate:3.954674},
  {d:"2026-01-06", parRate:5.661422, pricePer1Rate:4.000390},
]; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)

const PIECEWISE_SLOPES_CONV30 = {
  // points-per-1.000% rate (median across sheets)
  belowPar: { ptsPerRate: 6.16448974609375 },     // +1.0 to +3.0 pts region
  abovePar: { ptsPerRate: 2.320100880612401 },    // <= -0.5 pts region
}; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)


// --------------------
// FHA 30Y
// --------------------
const WHOLESALE_CAL_FHA30 = [
  // per-sheet parRate + near-par price slope (same wholesale dates)
  {d:"2025-11-06", parRate: 5.285937716964127, pricePer1Rate: 3.91754150390625},
  {d:"2025-12-08", parRate: 5.262555562999182, pricePer1Rate: 3.8853759765625},
  {d:"2025-12-18", parRate: 5.2390828677570305, pricePer1Rate: 6.32537841796875},
  {d:"2025-12-19", parRate: 5.280713186148017, pricePer1Rate: 3.80621337890625},
  {d:"2025-12-22", parRate: 5.275995889815108, pricePer1Rate: 3.73779296875},
  {d:"2025-12-23", parRate: 5.287048501301709, pricePer1Rate: 3.7735595703125},
  {d:"2025-12-24", parRate: 5.256774376683094, pricePer1Rate: 3.79302978515625},
  {d:"2025-12-26", parRate: 5.232699059497243, pricePer1Rate: 5.98992919921875},
  {d:"2025-12-29", parRate: 5.236505948279355, pricePer1Rate: 6.023193359375},
  {d:"2025-12-30", parRate: 5.251927024827532, pricePer1Rate: 3.78692626953125},
  {d:"2025-12-31", parRate: 5.255042053267656, pricePer1Rate: 3.78692626953125},
  {d:"2026-01-02", parRate: 5.259776202539995, pricePer1Rate: 3.78692626953125},
  {d:"2026-01-06", parRate: 5.269042222922135, pricePer1Rate: 3.78692626953125},
]; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)

const PIECEWISE_SLOPES_FHA30 = {
  // medians across all qualifying FHA observations
  belowPar: { ptsPerRate: 4.589652302642206 },     // +1.0 to +3.0 pts
  abovePar: { ptsPerRate: 2.397948080870796 },     // <= -0.5 pts
}; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)


// --------------------
// VA 30Y
// --------------------
const WHOLESALE_CAL_VA30 = [
  {d:"2025-11-06", parRate: 5.327453551569343, pricePer1Rate: 3.19952392578125},
  {d:"2025-12-08", parRate: 5.307726650782308, pricePer1Rate: 3.203369140625},
  {d:"2025-12-18", parRate: 5.2673961672939855, pricePer1Rate: 3.19451904296875},
  {d:"2025-12-19", parRate: 5.312653790160868, pricePer1Rate: 3.13104248046875},
  {d:"2025-12-22", parRate: 5.312327915518674, pricePer1Rate: 3.13104248046875},
  {d:"2025-12-23", parRate: 5.331293105795171, pricePer1Rate: 3.13104248046875},
  {d:"2025-12-24", parRate: 5.305897331233852, pricePer1Rate: 3.1204833984375},
  {d:"2025-12-26", parRate: 5.260579167402695, pricePer1Rate: 3.10968017578125},
  {d:"2025-12-29", parRate: 5.268193589336716, pricePer1Rate: 3.0771484375},
  {d:"2025-12-30", parRate: 5.294652552008064, pricePer1Rate: 3.1248779296875},
  {d:"2025-12-31", parRate: 5.301606934948594, pricePer1Rate: 3.1248779296875},
  {d:"2026-01-02", parRate: 5.306635703933056, pricePer1Rate: 3.1248779296875},
  {d:"2026-01-06", parRate: 5.31413832094675, pricePer1Rate: 3.1248779296875},
]; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)

const PIECEWISE_SLOPES_VA30 = {
  belowPar: { ptsPerRate: 4.567121824383184 },
  abovePar: { ptsPerRate: 2.0820974719725958 },
}; // [1](https://netorgft13002274-my.sharepoint.com/personal/josh_myazm_com/_layouts/15/Doc.aspx?sourcedoc=%7B7DACC91E-0223-427A-A970-EDF7EA6AB605%7D&file=Rate_Sheet-Excel-Wholesale.xlsx&action=default&mobileredirect=true)

/** Notes:
 * 1) Below-par region represents buying points (+1.0 to +3.0), where price-to-rate slope is steeper.
 * 2) Above-par region represents lender credit (<= -0.5 points), typically a flatter slope.
 * 3) These constants are consumed by buildProduct_ (products_conv_fha_va.gs).
 * 4) You can later replace these with an automated extractor from your wholesale workbook.
 */


// --------------------
// DSCR 30Y (investor / NQM wholesale)
// --------------------
/**
 * Bootstrap: same observation dates as Conv, parRate shifted by +0.50 (legacy WS2 DSCR_PAR_SPREAD).
 * Replace with real DSCR wholesale rows from Rate_Sheet-PDF-Wholesale / Excel (see DSCR-WS1-anchor-and-curve.md).
 * Uses Conv FRED series as index until a DSCR-specific index exists.
 */
const WHOLESALE_CAL_DSCR30 = WHOLESALE_CAL_CONV30.map(function (row) {
  return {
    d: row.d,
    parRate: row.parRate + 0.5,
    pricePer1Rate: row.pricePer1Rate,
  };
});

/** Start with Conv piecewise; refine from DSCR rate ladder PDF when you have medians. */
const PIECEWISE_SLOPES_DSCR30 = {
  belowPar: { ptsPerRate: PIECEWISE_SLOPES_CONV30.belowPar.ptsPerRate },
  abovePar: { ptsPerRate: PIECEWISE_SLOPES_CONV30.abovePar.ptsPerRate },
};