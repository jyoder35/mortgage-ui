/**
 * Shared tables + helpers for afford + live flows (simple.html / affordweb; no LLPA; tax/ins from state).
 * Exposes window.AZMShared
 */
(function () {
  const STATE_TAX_RATE_2023_PCT = {
    AL: 0.375, AK: 0.875, AZ: 0.5, AR: 0.5, CA: 0.75, CO: 0.5, CT: 1.5, DE: 0.5,
    FL: 0.75, GA: 0.75, HI: 0.375, ID: 0.5, IL: 1.875, IN: 0.75, IA: 1.25, KS: 1.25,
    KY: 0.75, LA: 0.5, ME: 1.0, MD: 0.875, MA: 1.0, MI: 1.125, MN: 1.0, MS: 0.625,
    MO: 0.875, MT: 0.625, NE: 1.375, NV: 0.5, NH: 1.375, NJ: 1.75, NM: 0.625, NY: 1.25,
    NC: 0.625, ND: 1.0, OH: 1.25, OK: 0.75, OR: 0.75, PA: 1.25, RI: 1.0, SC: 0.5,
    SD: 1.0, TN: 0.5, TX: 1.375, UT: 0.5, VT: 1.375, VA: 0.75, WA: 0.75, WV: 0.5,
    WI: 1.25, WY: 0.5, DC: 0.625
  };

  const HOI_2022 = {
    Alabama: 1748, Alaska: 1129, Arizona: 1018, Arkansas: 1740, California: 1492, Colorado: 2079,
    Connecticut: 1814, Delaware: 1103, "District of Columbia": 1384, Florida: 2677, Georgia: 1655,
    Hawaii: 1431, Idaho: 1002, Illinois: 1343, Indiana: 1191, Iowa: 1268, Kansas: 1583, Kentucky: 1359,
    Louisiana: 2603, Maine: 1077, Maryland: 1392, Massachusetts: 1871, Michigan: 1056, Minnesota: 1774,
    Mississippi: 1907, Missouri: 1668, Montana: 1639, Nebraska: 1869, Nevada: 948, "New Hampshire": 1188,
    "New Jersey": 1417, "New Mexico": 1322, "New York": 1628, "North Carolina": 1621, "North Dakota": 1325, Ohio: 995,
    Oklahoma: 2268, Oregon: 893, Pennsylvania: 1120, "Rhode Island": 2074, "South Carolina": 1571,
    "South Dakota": 1756, Tennessee: 1492, Texas: 2397, Utah: 937, Vermont: 1109, Virginia: 1332,
    Washington: 1151, "West Virginia": 1113, Wisconsin: 957, Wyoming: 1596
  };

  const HOI_BASE_COVERAGE = 300000;

  const ABBR_TO_NAME = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
    ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  function stateNameFromAbbr(abbr) {
    return ABBR_TO_NAME[String(abbr || "").toUpperCase()] || "Arizona";
  }

  function estimateAnnualTaxes(value, stateAbbr) {
    const pct = STATE_TAX_RATE_2023_PCT[String(stateAbbr || "").toUpperCase()] ?? STATE_TAX_RATE_2023_PCT.AZ;
    const x = Number(value);
    if (!isFinite(x) || x <= 0 || !isFinite(pct) || pct <= 0) return 0;
    return x * (pct / 100);
  }

  function estimateAnnualHoi(value, stateAbbr) {
    const stateName = stateNameFromAbbr(stateAbbr);
    const base = HOI_2022[stateName] ?? HOI_2022.Arizona ?? 0;
    const scaled = base * (Number(value || 0) / HOI_BASE_COVERAGE);
    return Math.round((scaled || 0) / 25) * 25;
  }

  /**
   * Effective HOI as % of home value for $50k-bucketed affordability (matches AZ: 0.34% in examples).
   * Other states: derived from 2022 table scaled to $500k.
   */
  function effectiveHoiRatePctForAfford(stateAbbr) {
    const ab = String(stateAbbr || "").toUpperCase();
    if (ab === "AZ") return 0.34;
    const at500k = estimateAnnualHoi(500000, ab);
    if (!isFinite(at500k) || at500k <= 0) return 0.34;
    return (at500k / 500000) * 100;
  }

  function estimateAnnualHoiByAffordRate(homeValue, stateAbbr) {
    const v = Number(homeValue);
    const r = effectiveHoiRatePctForAfford(stateAbbr);
    if (!isFinite(v) || v <= 0) return 0;
    return Math.round(v * (r / 100));
  }

  /** Level monthly payment (principal & interest), fixed rate. */
  function monthlyPI(loan, annualRatePct, months) {
    const principal = Number(loan);
    const n = Math.max(1, Math.round(Number(months) || 360));
    if (!isFinite(principal) || principal <= 0) return 0;
    const r = Number(annualRatePct) / 1200;
    if (!isFinite(r) || r <= 0) return principal / n;
    const f = Math.pow(1 + r, n);
    return (principal * r * f) / (f - 1);
  }

  const US_STATES = Object.keys(ABBR_TO_NAME)
    .map((abbr) => ({ abbr, name: ABBR_TO_NAME[abbr] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /** Representative ZIP per state for pricing/logging when user only picked a state (not a full address). */
  const DEFAULT_ZIP_BY_STATE = {
    AL: "36104", AK: "99501", AZ: "85001", AR: "72201", CA: "95814", CO: "80202", CT: "06103", DE: "19901",
    DC: "20001", FL: "32301", GA: "30303", HI: "96813", ID: "83702", IL: "62701", IN: "46204", IA: "50309",
    KS: "66603", KY: "40601", LA: "70802", ME: "04330", MD: "21401", MA: "02201", MI: "48933", MN: "55102",
    MS: "39205", MO: "65101", MT: "59623", NE: "68508", NV: "89501", NH: "03303", NJ: "08608", NM: "87501",
    NY: "12207", NC: "27601", ND: "58501", OH: "43215", OK: "73102", OR: "97301", PA: "17101", RI: "02903",
    SC: "29217", SD: "57501", TN: "37219", TX: "78701", UT: "84111", VT: "05602", VA: "23219", WA: "98501",
    WV: "25301", WI: "53703", WY: "82001"
  };

  function defaultZipForState(abbr) {
    return DEFAULT_ZIP_BY_STATE[String(abbr || "").toUpperCase()] || "85001";
  }

  window.AZMShared = {
    STATE_TAX_RATE_2023_PCT,
    HOI_2022,
    HOI_BASE_COVERAGE,
    ABBR_TO_NAME,
    US_STATES,
    DEFAULT_ZIP_BY_STATE,
    defaultZipForState,
    stateNameFromAbbr,
    estimateAnnualTaxes,
    estimateAnnualHoi,
    effectiveHoiRatePctForAfford,
    estimateAnnualHoiByAffordRate,
    monthlyPI
  };
})();
