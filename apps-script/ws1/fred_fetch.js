// ---- fred_fetch.gs ----
const DEFAULT_LPC = 2.25;
const CACHE_TTL_HOURS = 12; // cache TTL
const BACKFILL_DAYS   = 8;  // look back this many days for on-or-before match

// OBMMI series (unchanged)
const SERIES_CONV30 = "OBMMIC30YF";
const SERIES_FHA30  = "OBMMIFHA30YF";
const SERIES_VA30   = "OBMMIVA30YF";

function getSeriesMap_(seriesId){
  const props = PropertiesService.getScriptProperties();
  const cacheKey = "SERIESCSV_" + seriesId;
  const cached = props.getProperty(cacheKey);
  const cachedAt = Number(props.getProperty(cacheKey + "_AT") || 0);

  if (cached && cachedAt){
    const ageHrs = (Date.now() - cachedAt) / (1000*60*60);
    if (ageHrs < CACHE_TTL_HOURS) return JSON.parse(cached);
  }
  const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + encodeURIComponent(seriesId);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
  if (resp.getResponseCode() !== 200) return JSON.parse(cached || "{}"); // graceful stale fallback
  const lines = resp.getContentText().trim().split(/\r?\n/);
  const map = {};
  for (let i=1; i<lines.length; i++){
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const d = parts[0].trim();
    const v = toNum_(parts[1].trim(), null);
    if (d && v !== null) map[d] = v;
  }
  props.setProperty(cacheKey, JSON.stringify(map));
  props.setProperty(cacheKey + "_AT", String(Date.now()));
  return map;
}

function getLatestSeriesValue_(map){
  const dates = Object.keys(map||{}).sort();
  for (let i = dates.length-1; i>=0; i--){
    const d = dates[i];
    const v = map[d];
    if (isFinite(v)) return { date: d, value: v };
  }
  return null;
}

function getObsOnOrBefore_(map, dateStr){
  let dt = new Date(dateStr + "T00:00:00Z");
  for (let i=0; i<BACKFILL_DAYS; i++){
    const d = Utilities.formatDate(dt, "UTC", "yyyy-MM-dd");
    if (map[d] !== undefined && isFinite(map[d])) return { date:d, value: map[d] };
    dt = new Date(dt.getTime() - 24*60*60*1000);
  }
  return null;
}