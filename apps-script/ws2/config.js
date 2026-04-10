// ---- config.gs ----
/** This Script - (Workspace‑2: Pricing API) Deployment URL: https://script.google.com/macros/s/AKfycbzM2epYNmWxxIP5Sp4Fnl1iz4tCcSf_lCVGb0Hm-0pQBaST8mb8EsQ-jVC6_5WIXZon/exec */
const PRICING_SHEET_ID = '1ZEtVSxpOD2iYxH348ynQgzBOTofiAFFxZ04Ax6cCXHw'; // <-- your ID
const TAB_LLPA = 'LLPA';
const TAB_PMI  = 'PMI Rates';

const RATES_API_URL = 'https://script.google.com/macros/s/AKfycbxFUmGP213ag2uV4cey3V2ox0diofarpDKNt0szGrSajVpO8CF_paFN7u_R9cPa4Y3FwA/exec';

const DEFAULT_LPC     = 2.25;
const DSCR_PAR_SPREAD = 0.50;
const ENGINE_MODEL    = { model: 'AZM_PRICING', version: '1.1.3' }; // PMI lookahead + band normalization + debug