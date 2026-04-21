// ---- utils_math.gs ----
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function toNum_(x, fallback){ const n = Number(x); return isFinite(n) ? n : fallback; }
function mean_(arr){ let s = 0; for (const v of arr) s += v; return s / arr.length; }
function median_(arr){
  const a = arr.slice().sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return (a.length % 2) ? a[m] : (a[m-1] + a[m]) / 2;
}
function clamp_(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function round3_(n){ return Math.round(n*1000)/1000; }
function round6_(n){ return Math.round(n*1000000)/1000000; }