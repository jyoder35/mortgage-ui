// ---- pmi_table_loader.gs (discrete band lookup + robust multipliers) ----

function pmiAnnualRate_(ctx){
  const src     = loadPmiSource_(); // { grid:{columns,ficoBands,table}, multipliers:{...} }
  const basePct = pmiPickDiscrete_(src.grid, Number(ctx.ltvPct), Number(ctx.fico));
  let finalPct  = basePct;

  if (ctx.dtiOver45        && src.multipliers && src.multipliers.dtiOver45)        finalPct *= src.multipliers.dtiOver45;
  if (ctx.twoPlusBorrowers && src.multipliers && src.multipliers.twoPlusBorrowers) finalPct *= src.multipliers.twoPlusBorrowers;

  return { annualPct: round3_(finalPct), basePct, dtiOver45: !!ctx.dtiOver45, twoPlusBorrowers: !!ctx.twoPlusBorrowers };
}

function loadPmiSource_(){
  const sh = SpreadsheetApp.openById(PRICING_SHEET_ID).getSheetByName(TAB_PMI);
  if (!sh) throw new Error('Missing PMI tab: ' + TAB_PMI);
  const values = sh.getDataRange().getValues();

  // Find "Annual PMI Rates" header row
  const hdrRowIdx = values.findIndex(r => r.some(c => String(c).toLowerCase().includes('annual pmi rates')));
  if (hdrRowIdx < 0) throw new Error('Could not find "Annual PMI Rates" row in ' + TAB_PMI);

  // LTV header row (right of column A labels)
  const ltvHdr = values[hdrRowIdx + 1].slice(1).map(v => String(v).trim());
  const columns = ltvHdr.map(parseLtvBand_);

  // FICO rows until we hit a modifier line (DTI / Borrowers)
  const rows = [];
  let i = hdrRowIdx + 2;
  for (; i < values.length; i++){
    const label = String(values[i][0] || '').trim();
    if (!label) break;
    if (/DTI/i.test(label) || /Borrowers/i.test(label)) break;
    const vals = values[i].slice(1).map(Number);
    rows.push({ label, band: parseFicoBandFlexible_(label), vals });
  }

  // Read multipliers (works for A13/B13 and for "PMI Rate*1.25" text)
  function parseMultiplierFromRow(row){
    const cB = row[1];
    if (typeof cB === 'number' && cB > 0 && cB <= 5) return Number(cB);
    if (typeof cB === 'string'){
      const m = cB.match(/PMI\s*Rate\s*\*\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (m) return Number(m[1]);
      const num = (cB.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number)
                    .find(n => n > 0 && n <= 5 && String(n).includes('.'));
      if (num) return num;
    }
    const joined = row.map(c => String(c)).join(' ');
    const t = joined.match(/PMI\s*Rate\s*\*\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (t) return Number(t[1]);
    const fallback = (joined.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number)
                      .find(n => n > 0 && n <= 5 && String(n).includes('.'));
    return fallback || null;
  }

  let dtiMult = 1, twoPlusMult = 1;
  const endScan = Math.min(values.length, i + 10);
  for (let r = i; r < endScan; r++){
    const labelA = String(values[r][0] || '').trim();
    if (!labelA) continue;
    if (/DTI/i.test(labelA)) {
      let f = parseMultiplierFromRow(values[r]);
      if (f == null && r+1 < values.length) f = parseMultiplierFromRow(values[r+1]);
      if (f != null) dtiMult = f;
    }
    if (/2\+\s*Borrowers/i.test(labelA)) {
      let f = parseMultiplierFromRow(values[r]);
      if (f == null && r+1 < values.length) f = parseMultiplierFromRow(values[r+1]);
      if (f != null) twoPlusMult = f;
    }
  }

  // Build discrete grid (order doesn’t matter for discrete pick)
  const ficoBands = rows.map(r => r.band);
  const table     = rows.map(r => r.vals);

  return { grid: { columns, ficoBands, table }, multipliers: { dtiOver45: dtiMult, twoPlusBorrowers: twoPlusMult } };
}

// ---- Discrete pick: choose the one cell that contains the inputs ----
function pmiPickDiscrete_(grid, ltv, fico){
  const j = pickColIndex_(grid.columns, ltv);
  const i = pickRowIndex_(grid.ficoBands, fico);
  const val = (grid.table[i] && grid.table[i][j]);
  return Number(val || 0);
}

function pickColIndex_(columns, ltv){
  // exact containment first
  for (let j=0;j<columns.length;j++){
    const b = columns[j];
    if (ltv >= b.lo && ltv <= b.hi) return j;
  }
  // fallback: nearest by distance to band center
  let best = 0, bestD = 1e9;
  for (let j=0;j<columns.length;j++){
    const b = columns[j], c = (b.lo + b.hi)/2, d = Math.abs(ltv - c);
    if (d < bestD){ bestD = d; best = j; }
  }
  return best;
}

function pickRowIndex_(bands, fico){
  for (let i=0;i<bands.length;i++){
    const b = bands[i];
    if (fico >= b.lo && fico <= b.hi) return i;
  }
  let best = 0, bestD = 1e9;
  for (let i=0;i<bands.length;i++){
    const b = bands[i], c = (b.lo + b.hi)/2, d = Math.abs(fico - c);
    if (d < bestD){ bestD = d; best = i; }
  }
  return best;
}