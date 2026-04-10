/**
 * Web App for logging calculator runs.
 * This Script - (Workspace 4: Calculator Log) Deployment URL: https://script.google.com/macros/s/AKfycbx146CZOaBxUg2fKGZKyGiTGKQbpcM7CgFtCU01boTLgh6JhaksMgZKSYx4oeeujrS7pA/exec

 * Sheet ID (Run Log): 1jwMWT-2fJtXcAZo4ArGr886vs0pplYjuAu4R5rci71g
 * Tabs:
 *  - "Quotes": append ALL runs (heavy)
 *  - "Leads": upsert latest run PER leadToken (clean)
 *
 * Actions:
 *  - action=logQuote       -> append to Quotes + upsert into Leads
 *  - action=upsertLeadRun  -> upsert into Leads only
 *  - action=sendQuote      -> send HTML quote email via MailApp
 *
 * Response: JSON { ok:true, quoteId, leadsRow, quotesRow } or { ok:false, error }
 */

const RUN_SHEET_ID = '1jwMWT-2fJtXcAZo4ArGr886vs0pplYjuAu4R5rci71g';
const TAB_QUOTES   = 'Quotes';
const TAB_LEADS    = 'Leads';

// ---- Expected headers (exact order) ----
const QUOTES_HEADERS = [
  'QuoteId','LeadToken','Timestamp','Program','Txn','ZIP','Value','BaseLoan','FICO','BorrowerPts',
  'AnnualTaxes','AnnualIns','MonthlyHOA','ShowMI','InputsJSON','ResultsJSON','ModelVersion',
  'NoteRate','TotalLoan','TotalPayment','MI_Monthly','QuotedAt',
  // trailing convenience fields you listed (often mirrored from payload/result)
  'program','txn','term','noteRate','parRate','totalLoan','piMonthly','miMonthly','totalPayment',
  'llpaPoints','borrowerPoints','netPoints','slopeRegion','dscrPar','dscrPoints','convWholesalePar','convConsumerPar'
];

// Must match Leads row 1 left-to-right (sheet column order)
const LEADS_HEADERS = [
  'LastQuotedAt', 'First Name', 'Last Name', 'Email', 'Phone', 'zip',
  'program', 'txn', 'value', 'loan', 'fico', 'taxes', 'ins', 'hoa',
  'LastQuotedRate', 'LastQuotedTotalPayment', 'LastQuotedTotalLoan', 'LastQuotedPI', 'LastQuotedMI',
  'bPts', 'LeadToken', 'term', 'LastQuoteId'
];

// ---- Entry point ----
function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : null;
    if (!body) return respond({ ok:false, error:'Missing body' }, 400);
    const parsed = JSON.parse(body);
    const action = (parsed.action || parsed.payload?.action || '').toString();

    if (action === 'logQuote') {
      return respond(logQuote_(parsed.payload || {}));
    } else if (action === 'upsertLeadRun') {
      return respond(upsertLeadRun_(parsed.payload || {}));
    } else if (action === 'sendQuote') {
      return respond(sendQuote_(parsed.payload || parsed));
    } else {
      return respond({ ok:false, error:'Unknown action' }, 400);
    }
  } catch (err) {
    return respond({ ok:false, error: String(err && err.message || err) }, 500);
  }
}

// ---- Core: log to Quotes + upsert to Leads ----
function logQuote_(payload) {
  // Payload contract: { leadToken, inputs, quote, parQuote?, leadMeta? }
  // - inputs: your currentInputs() result (plus leadToken)
  // - quote: the "selected price" quote (with borrowerPts applied)
  // - parQuote (optional): the 0-pt quote to populate optional columns (parRate, etc.)
  // - leadMeta (optional): { first, last, email, phone } from localStorage or ws3 if available
  const ss   = SpreadsheetApp.openById(RUN_SHEET_ID);
  const shQ  = ss.getSheetByName(TAB_QUOTES);
  const shL  = ss.getSheetByName(TAB_LEADS);
  if (!shQ || !shL) throw new Error('Quotes or Leads tab not found in run log sheet.');

  ensureHeaders_(shQ, QUOTES_HEADERS);
  ensureHeaders_(shL, LEADS_HEADERS);

  const now = new Date();
  const tsDisplay = formatQuotedWallTime_(now);
  const quoteId = Utilities.getUuid();

  const leadToken   = (payload.leadToken || payload.inputs?.leadToken || '').toString();
  const programUI   = payload.inputs?.programUI || '';
  const txn         = payload.inputs?.txn || '';
  const zip         = normalizeZip_((payload.subjectZip || payload.inputs?.subjectZip) || '');
  const value = toNumber_(payload.value ?? payload.inputs?.value);
  const baseLoan    = toNumber_(payload.inputs?.loan);
  const ficoEnt     = toNumber_(payload.inputs?.ficoEntered ?? payload.inputs?.fico);
  const borrowerPts = toNumber_(payload.inputs?.borrowerPts);
  const taxes       = toNumber_(payload.inputs?.taxes);
  const ins         = toNumber_(payload.inputs?.ins);
  const hoa         = toNumber_(payload.inputs?.hoa);
  const showMI      = !!payload.inputs?.pmiToggle;

  const selected = payload.quote || {};
  const par      = payload.parQuote || null;

  const resultsJSON = JSON.stringify({ selected, par });
  const inputsJSON  = JSON.stringify(payload.inputs || {});

  // Prefer selected fields; fall back to par when relevant
  const noteRate   = numOr_(selected.noteRate, null);
  const totalLoan  = numOr_(payload.inputs?.loanCalc, null);  // financed loan (UI computed)
  const piMonthly  = numOr_(selected.piMonthly, null);
  const miMonthly  = numOr_(selected.miMonthly, null);
  const totalPay   = (isFinite(piMonthly) && isFinite(miMonthly)) ? Math.round(piMonthly + miMonthly) : null;

  // Optional convenience tails (from selected/par if you have them)
  const parRate    = par && isFinite(par.noteRate) ? par.noteRate : null;
  const term       = payload.inputs?.term || 360;

  const qRow = headersToRow_(QUOTES_HEADERS, {
    QuoteId: quoteId,
    LeadToken: leadToken,
    Timestamp: tsDisplay,
    Program: programUI,
    Txn: txn,
    ZIP: zip,
    Value: value,
    BaseLoan: baseLoan,
    FICO: ficoEnt,
    BorrowerPts: borrowerPts,
    AnnualTaxes: taxes,
    AnnualIns: ins,
    MonthlyHOA: hoa,
    ShowMI: showMI,
    InputsJSON: inputsJSON,
    ResultsJSON: resultsJSON,
    ModelVersion: 'UI-W4-r1',
    NoteRate: noteRate,
    TotalLoan: totalLoan,
    TotalPayment: totalPay,
    MI_Monthly: miMonthly,
    QuotedAt: tsDisplay,

    program: programUI,
    txn: txn,
    term: term,
    noteRate: noteRate,
    parRate: parRate,
    totalLoan: totalLoan,
    piMonthly: piMonthly,
    miMonthly: miMonthly,
    totalPayment: totalPay,
    llpaPoints: numOr_(selected.llpaPoints, null),
    borrowerPoints: numOr_(payload.inputs?.borrowerPts, null),
    netPoints: numOr_(selected.netPoints, null),
    slopeRegion: strOr_(selected.slopeRegion, null),
    dscrPar: numOr_(selected.dscrPar, null),
    dscrPoints: numOr_(selected.dscrPoints, null),
    convWholesalePar: numOr_(selected.convWholesalePar, null),
    convConsumerPar: numOr_(selected.convConsumerPar, null),
  });

  // Append to Quotes
  shQ.appendRow(qRow);

  // Upsert into Leads (keys must match LEADS_HEADERS labels)
  const leadValues = {
    'LastQuotedAt': tsDisplay,
    'First Name': payload.leadMeta?.first || '',
    'Last Name': payload.leadMeta?.last || '',
    'Email': payload.leadMeta?.email || '',
    'Phone': payload.leadMeta?.phone || '',
    'zip': zip,
    'program': programUI,
    'txn': txn,
    'value': value,
    'loan': baseLoan,
    'fico': ficoEnt,
    'taxes': taxes,
    'ins': ins,
    'hoa': hoa,
    'LastQuotedRate': noteRate,
    'LastQuotedTotalPayment': totalPay,
    'LastQuotedTotalLoan': totalLoan,
    'LastQuotedPI': piMonthly,
    'LastQuotedMI': miMonthly,
    'bPts': borrowerPts,
    'LeadToken': leadToken,
    'term': term,
    'LastQuoteId': quoteId
  };
  const leadsRowIndex = upsertByKey_(shL, LEADS_HEADERS, 'LeadToken', leadToken, leadValues);

  return { ok:true, quoteId, quotesRow: shQ.getLastRow(), leadsRow: leadsRowIndex };
}

function upsertLeadRun_(payload) {
  const ss  = SpreadsheetApp.openById(RUN_SHEET_ID);
  const shL = ss.getSheetByName(TAB_LEADS);
  if (!shL) throw new Error('Leads tab not found.');

  ensureHeaders_(shL, LEADS_HEADERS);

  const now = new Date();
  const tsDisplay = formatQuotedWallTime_(now);

  const leadToken = (payload.leadToken || payload.inputs?.leadToken || '').toString();
  const values = Object.assign({}, payload.values || {});
  values['LeadToken'] = leadToken;
  if (!values['LastQuotedAt']) values['LastQuotedAt'] = tsDisplay;

  const rowIndex = upsertByKey_(shL, LEADS_HEADERS, 'LeadToken', leadToken, values);
  return { ok:true, leadsRow: rowIndex };
}

// ---- Email Quote ----
const EMAIL_SENDER_NAME = 'NICE Mortgage Calculator';

function sendQuote_(payload) {
  try {
    const email = (payload.email || '').toString().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: 'Invalid email address' };
    }

    const quote = payload.quote || {};
    const card = payload.card || {};
    const inputs = payload.inputs || {};
    const leadMeta = payload.leadMeta || {};

    const programUI = inputs.programUI || '';
    const txn = (inputs.txn || '').toString();
    const value = inputs.value;
    const loan = inputs.loan;
    const equity = inputs.equity;
    const zip = (payload.subjectZip || inputs.subjectZip || '').toString().replace(/\D/g, '').slice(0, 5);
    const fico = inputs.ficoEntered ?? inputs.fico;

    const isPurchase = (txn === 'PURCHASE');
    const valueLabel = isPurchase ? 'Purchase Price ($)' : 'Property Value ($)';
    const equityLabel = isPurchase ? 'Down Payment ($)' : 'Equity ($)';

    const fmtUSD = function(n) { return (typeof n === 'number' && isFinite(n)) ? '$' + Math.round(n).toLocaleString() : '—'; };
    const fmtRate = function(r) { return (typeof r === 'number' && isFinite(r)) ? (r).toFixed(3).replace(/\.?0+$/, '') + '%' : '—'; };

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:520px;margin:0 auto;padding:24px;}' +
      'h1{font-size:20px;margin:0 0 8px;color:#0b1220;}' +
      '.sub{font-size:14px;color:#64748b;margin-bottom:20px;}' +
      'table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;}' +
      'th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #e2e8f0;}' +
      'th{background:#f8fafc;font-size:13px;color:#475569;}' +
      'td:last-child{font-weight:700;color:#0b1220;}' +
      'tr:last-child td{border-bottom:none;}' +
      '.footer{font-size:12px;color:#94a3b8;margin-top:20px;}' +
      '</style></head><body>' +
      '<h1>Your Mortgage Quote</h1>' +
      '<p class="sub">' + (leadMeta.first || leadMeta.last ? (leadMeta.first + ' ' + leadMeta.last).trim() + ', ' : '') + 'here is the quote you requested.</p>' +
      '<table>' +
      '<tr><th>Program</th><td>' + (programUI || '—') + ' • ' + (txn || '—') + '</td></tr>' +
      '<tr><th>Property ZIP</th><td>' + (zip || '—') + '</td></tr>' +
      '<tr><th>' + valueLabel + '</th><td>' + fmtUSD(value) + '</td></tr>' +
      '<tr><th>' + equityLabel + '</th><td>' + fmtUSD(equity) + '</td></tr>' +
      '<tr><th>Loan Amount</th><td>' + fmtUSD(loan) + '</td></tr>' +
      '<tr><th>FICO</th><td>' + (fico !== undefined ? fico : '—') + '</td></tr>' +
      '<tr><th>Interest Rate</th><td>' + fmtRate(quote.noteRate) + '</td></tr>' +
      '<tr><th>Financed Loan</th><td>' + fmtUSD(card.loanCalc) + '</td></tr>' +
      '<tr><th>P&I</th><td>' + fmtUSD(card.pi) + '/mo</td></tr>' +
      '<tr><th>PMI / MIP</th><td>' + fmtUSD(card.mi) + '/mo</td></tr>' +
      '<tr><th>Taxes</th><td>' + fmtUSD(card.taxesM) + '/mo</td></tr>' +
      '<tr><th>Insurance</th><td>' + fmtUSD(card.insM) + '/mo</td></tr>' +
      '<tr><th>HOA</th><td>' + fmtUSD(card.hoaM) + '/mo</td></tr>' +
      '<tr><th>Total Housing Payment</th><td>' + fmtUSD((Number(card.pi)||0)+(Number(card.mi)||0)+(Number(card.taxesM)||0)+(Number(card.insM)||0)+(Number(card.hoaM)||0)) + '/mo</td></tr>' +
      '</table>' +
      '<p class="footer">This quote was generated by the NICE Mortgage Calculator. Rates and terms are subject to change.</p>' +
      '</body></html>';

    MailApp.sendEmail({
      to: email,
      subject: 'Your Mortgage Quote – NICE Mortgage',
      htmlBody: html,
      name: EMAIL_SENDER_NAME
    });

    return { ok: true, sent: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

// ---- Helpers ----
/** Script timezone (Project Settings); fallback Arizona. No ISO / offset suffix. */
function getLogTimeZone_() {
  return Session.getScriptTimeZone() || 'America/Phoenix';
}

/** Leads LastQuotedAt, Quotes Timestamp / QuotedAt — wall time e.g. 03-13-26 13:21:00 */
function formatQuotedWallTime_(date) {
  const d = date instanceof Date ? date : new Date();
  return Utilities.formatDate(d, getLogTimeZone_(), 'MM-dd-yy HH:mm:ss');
}

function ensureHeaders_(sh, headers) {
  const first = sh.getRange(1,1,1,sh.getMaxColumns()).getValues()[0];
  const trimmed = first.filter(h => h !== '');
  if (trimmed.length === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    return;
  }
  // If headers exist but length/order differ, we do NOT rewrite to avoid damaging existing data.
}

function headersToRow_(headers, obj) {
  return headers.map(h => (h in obj ? obj[h] : ''));
}

function upsertByKey_(sh, headers, keyHeader, keyValue, valuesObj) {
  if (!keyValue) throw new Error('Missing key for upsert: ' + keyHeader);
  const dataRange = sh.getDataRange();
  const values = dataRange.getValues();
  const head = values.shift();
  const keyIdx = head.indexOf(keyHeader);
  if (keyIdx < 0) throw new Error('Key header not found: ' + keyHeader);

  let targetRow = -1;
  for (let r = 0; r < values.length; r++) {
    if (String(values[r][keyIdx]) === String(keyValue)) {
      targetRow = r + 2; // 1-based with header
      break;
    }
  }

  const rowValues = headersToRow_(headers, valuesObj);
  if (targetRow === -1) {
    sh.appendRow(rowValues);
    return sh.getLastRow();
  } else {
    sh.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    return targetRow;
  }
}

function toNumber_(v) {
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function numOr_(v, dflt) {
  const n = Number(v);
  return isFinite(n) ? n : dflt;
}

function strOr_(v, dflt) {
  if (v == null) return dflt;
  return String(v);
}

function normalizeZip_(z) {
  const d = String(z || '').replace(/\D/g, '');
  return d.length >= 5 ? d.slice(0,5) : '';
}

function respond(obj, code) {
  const payload = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  if (code && payload.setStatusCode) payload.setStatusCode(code);
  return payload;
}