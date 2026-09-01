import { getGoogleSheetsAccessToken } from './sheetsConnector.js';

const ORDER_SHEET_CANDIDATES = ['🛍️ Orders', 'Orders'];
const EXPENSE_SHEET_CANDIDATES = ['💸 Expenditures / Materials', 'Expenses'];

const normalize = (value = '') => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const money = (value) => Number(value || 0).toFixed(2);

async function sheetsRequest(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error?.message || text || `Google Sheets ${res.status}`);
  return data;
}

async function resolveSheet(spreadsheetId, candidates, accessToken) {
  for (const sheetName of candidates) {
    const range = `${sheetName}!A:Z`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) return { sheetName, rows: (await res.json())?.values || [] };
    if (![400, 404].includes(res.status)) throw new Error(`Could not read ${sheetName} spreadsheet tab: ${await res.text()}`);
  }
  throw new Error(`Could not find any of these spreadsheet tabs: ${candidates.join(', ')}`);
}

async function appendRows(spreadsheetId, sheetName, accessToken, rows) {
  if (!rows.length) return 0;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsRequest(accessToken, url, { method: 'POST', body: JSON.stringify({ values: rows }) });
  return rows.length;
}

async function updateRows(spreadsheetId, sheetName, startRow, endColumn, accessToken, rows) {
  if (!rows.length) return 0;
  const endRow = startRow + rows.length - 1;
  const range = `${sheetName}!A${startRow}:${endColumn}${endRow}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  await sheetsRequest(accessToken, url, { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values: rows }) });
  return rows.length;
}

const normalizeIsoDate = (value = '', dayFirst = false) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 20000 && serial < 100000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const useDayFirst = dayFirst || first > 12;
    const month = useDayFirst ? second : first;
    const day = useDayFirst ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${slash[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const isoToUsDate = (value = '') => {
  const iso = normalizeIsoDate(value, false);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
};

const orderFingerprint = (order = {}, dayFirst = false) => [
  normalize(order.platform),
  normalizeIsoDate(order.sale_date, dayFirst),
  money(order.sale_total),
  normalize(order.product_name),
].join('|');

const orderKey = (order = {}) => {
  const sourceEmailId = String(order.source_email_id || '').trim();
  if (sourceEmailId) return `email:${sourceEmailId}`;
  const orderId = String(order.order_id || '').trim();
  if (orderId) return `order:${normalize(order.platform)}:${orderId}:${normalize(order.product_name)}`;
  return `sale:${orderFingerprint(order)}`;
};

const expenseFingerprint = (expense = {}, dayFirst = false) => [
  normalizeIsoDate(expense.date, dayFirst),
  money(expense.amount),
  normalize(expense.description || expense.source),
].join('|');

const expenseKey = (expense = {}) => {
  const receiptId = String(expense.receipt_id || '').trim();
  if (receiptId) return `receipt:${receiptId}`;
  return `expense:${expenseFingerprint(expense)}`;
};

const headerIndex = (headers, names) => {
  for (const name of names) {
    const idx = headers.findIndex((header) => header === name);
    if (idx >= 0) return idx;
  }
  for (const name of names) {
    const idx = headers.findIndex((header) => header.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
};

export async function appendOrdersToMasterSheet(base44, workspace, orders = []) {
  const spreadsheetId = String(workspace?.spreadsheetId || '').trim();
  if (!spreadsheetId || !orders.length) return { available: !!spreadsheetId, appended: 0, skipped: 0 };

  const accessToken = await getGoogleSheetsAccessToken(base44);
  const { sheetName, rows } = await resolveSheet(spreadsheetId, ORDER_SHEET_CANDIDATES, accessToken);
  const headers = (rows[0] || []).map((value) => normalize(value));
  const exactStyle = sheetName === '🛍️ Orders' || (headers.includes('what sold') && headers.includes('gross sale price'));

  if (exactStyle) {
    const platformIdx = headerIndex(headers, ['site', 'platform']);
    const seqIdx = headerIndex(headers, ['#']);
    const productIdx = headerIndex(headers, ['what sold', 'product name', 'product']);
    const costIdx = headerIndex(headers, ['purchase price', 'cost']);
    const grossIdx = headerIndex(headers, ['gross sale price', 'sale total', 'total']);
    const feesIdx = headerIndex(headers, ['fees', 'fee']);
    const shippingIdx = headerIndex(headers, ['shipping cost', 'shipping']);
    const dateIdx = headerIndex(headers, ['sale date']);

    const existingCounts = new Map();
    let maxSequence = 0;
    let lastProductRow = 1;
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const product = String(productIdx >= 0 ? row[productIdx] || '' : '').trim();
      if (!product) continue;
      lastProductRow = i + 1;
      maxSequence = Math.max(maxSequence, Number(seqIdx >= 0 ? row[seqIdx] || 0 : 0) || 0);
      const fp = orderFingerprint({
        platform: platformIdx >= 0 ? row[platformIdx] : '',
        product_name: product,
        sale_total: grossIdx >= 0 ? row[grossIdx] : 0,
        sale_date: dateIdx >= 0 ? row[dateIdx] : '',
      }, true);
      existingCounts.set(fp, (existingCounts.get(fp) || 0) + 1);
    }

    const incomingSeen = new Map();
    const pending = [];
    let skipped = 0;
    for (const order of orders) {
      const fp = orderFingerprint(order, false);
      const occurrence = (incomingSeen.get(fp) || 0) + 1;
      incomingSeen.set(fp, occurrence);
      if (occurrence <= (existingCounts.get(fp) || 0)) {
        skipped += 1;
        continue;
      }
      pending.push(order);
    }

    const startRow = Math.max(2, lastProductRow + 1);
    const values = pending.map((order, index) => {
      const rowNum = startRow + index;
      const sequence = maxSequence + index + 1;
      const cost = Number(order.total_cost || 0);
      const fees = Number(order.marketplace_fees || order.fees || 0);
      const shipping = Number(order.shipping_cost || 0);
      return [
        order.platform || '',
        sequence,
        order.product_name || '',
        cost,
        '',
        true,
        true,
        Number(order.sale_total || 0),
        fees || '',
        shipping || '',
        `=IF(H${rowNum}="","",SUM(H${rowNum}-D${rowNum}-I${rowNum}-J${rowNum}))`,
        isoToUsDate(order.sale_date || ''),
      ];
    });

    const appended = await updateRows(spreadsheetId, sheetName, startRow, 'L', accessToken, values);
    return { available: true, appended, skipped, sheet_name: sheetName };
  }

  const existing = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    existing.add(orderKey({
      sale_date: row[0] || '',
      platform: row[1] || '',
      order_id: row[2] || '',
      product_name: row[3] || '',
      sale_total: row[7] || '',
      source_email_id: row[9] || '',
    }));
  }

  const pending = [];
  let skipped = 0;
  for (const order of orders) {
    const key = orderKey(order);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    pending.push([
      order.sale_date || '',
      order.platform || '',
      order.order_id || '',
      order.product_name || '',
      Number(order.quantity || 1),
      order.size || 'Unknown',
      Number(order.unit_price || 0),
      Number(order.sale_total || 0),
      order.buyer || '',
      order.source_email_id || '',
      Number(order.base_item_cost || 0),
      Number(order.paper_ink_cost || 0),
      Number(order.packaging_cost || 0),
      Number(order.total_cost || 0),
      Number(order.estimated_profit || 0),
      order.source_url || '',
    ]);
  }

  const appended = await appendRows(spreadsheetId, sheetName, accessToken, pending);
  return { available: true, appended, skipped, sheet_name: sheetName };
}

export async function appendExpensesToMasterSheet(base44, workspace, expenses = []) {
  const spreadsheetId = String(workspace?.spreadsheetId || '').trim();
  if (!spreadsheetId || !expenses.length) return { available: !!spreadsheetId, appended: 0, skipped: 0 };

  const accessToken = await getGoogleSheetsAccessToken(base44);
  const { sheetName, rows } = await resolveSheet(spreadsheetId, EXPENSE_SHEET_CANDIDATES, accessToken);
  const exactStyle = sheetName === '💸 Expenditures / Materials';

  if (exactStyle) {
    const headerRowIndex = rows.findIndex((row) => (row || []).some((cell) => /item description/i.test(String(cell || ''))));
    const headerRow = headerRowIndex >= 0 ? headerRowIndex : 2;
    const existingCounts = new Map();
    let lastDescriptionRow = headerRow + 1;
    for (let i = headerRow + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const description = String(row[1] || '').trim();
      if (!description) continue;
      lastDescriptionRow = i + 1;
      const fp = expenseFingerprint({ description, amount: row[2] || 0, date: row[3] || '' }, true);
      existingCounts.set(fp, (existingCounts.get(fp) || 0) + 1);
    }

    const incomingSeen = new Map();
    const pending = [];
    let skipped = 0;
    for (const expense of expenses) {
      const fp = expenseFingerprint(expense, false);
      const occurrence = (incomingSeen.get(fp) || 0) + 1;
      incomingSeen.set(fp, occurrence);
      if (occurrence <= (existingCounts.get(fp) || 0)) {
        skipped += 1;
        continue;
      }
      pending.push(expense);
    }

    const startRow = Math.max(headerRow + 2, lastDescriptionRow + 1);
    const values = pending.map((expense) => [
      '',
      expense.description || expense.source || '',
      Number(expense.amount || 0),
      isoToUsDate(expense.date || ''),
      expense.notes || expense.category || '',
    ]);
    const appended = await updateRows(spreadsheetId, sheetName, startRow, 'E', accessToken, values);
    return { available: true, appended, skipped, sheet_name: sheetName };
  }

  const existing = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    existing.add(expenseKey({
      date: row[0] || '',
      description: row[2] || '',
      amount: row[3] || '',
      source: row[6] || '',
      receipt_id: row[8] || '',
    }));
  }

  const pending = [];
  let skipped = 0;
  for (const expense of expenses) {
    const key = expenseKey(expense);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    pending.push([
      expense.date || '',
      expense.category || 'Other Business Expense',
      expense.description || '',
      Number(expense.amount || 0),
      Number(expense.deductible_percent ?? 100),
      Number(expense.deductible_amount ?? expense.amount ?? 0),
      expense.source || '',
      expense.notes || '',
      expense.receipt_id || '',
    ]);
  }

  const appended = await appendRows(spreadsheetId, sheetName, accessToken, pending);
  return { available: true, appended, skipped, sheet_name: sheetName };
}
