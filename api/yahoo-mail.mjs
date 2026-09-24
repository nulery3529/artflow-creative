import pg from 'pg';
import tls from 'node:tls';
import { pooledDatabaseUrl } from './_db.mjs';
import {
  clean, normalize, session, profile, businessForUser, encrypt, decrypt, parseBody, insertOrders,
} from './_official-sync-shared.mjs';
import { parseSaleEmail } from './_gmail-sales-core.mjs';
import {
  categoryFor,
  extractTotal,
  isNonExpenseNotice,
  localDate as expenseLocalDate,
  originalSubject,
  sourceName,
} from './gmail-expense-sync.mjs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const YAHOO_HOST = 'imap.mail.yahoo.com';
const YAHOO_PORT = 993;
const MAX_MESSAGES_PER_RUN = 300;
const YAHOO_EXPENSE_PARSER_VERSION = 6;

function imapQuote(value='') {
  return `"${String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
}

function decodeQuotedPrintable(value='') {
  return String(value)
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeHeaderWords(value='') {
  return String(value).replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, mode, data) => {
    try {
      if (mode.toLowerCase() === 'b') return Buffer.from(data, 'base64').toString('utf8');
      const bytes = decodeQuotedPrintable(data.replace(/_/g, ' '));
      return Buffer.from(bytes, 'binary').toString('utf8');
    } catch {
      return data;
    }
  });
}

function parseHeaders(text='') {
  const unfolded = String(text).replace(/\r?\n[ \t]+/g, ' ');
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = decodeHeaderWords(m[2].trim());
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  return headers;
}

function headerParam(value='', name='') {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]+)"|([^;\\s]+))`, 'i');
  const m = String(value).match(re);
  return clean(m?.[1] || m?.[2] || '');
}

function decodeTransfer(body='', encoding='') {
  const mode = normalize(encoding);
  if (mode === 'base64') {
    try { return Buffer.from(String(body).replace(/\s+/g,''), 'base64').toString('utf8'); } catch { return body; }
  }
  if (mode === 'quoted-printable') return decodeQuotedPrintable(body);
  return String(body);
}

function htmlToText(value='') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mimeText(raw='') {
  const split = String(raw).search(/\r?\n\r?\n/);
  const headerText = split >= 0 ? raw.slice(0, split) : '';
  const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : raw;
  const headers = parseHeaders(headerText);
  const type = normalize(headers['content-type'] || 'text/plain');
  const boundary = headerParam(headers['content-type'] || '', 'boundary');

  if (type.startsWith('multipart/') && boundary) {
    return body
      .split(`--${boundary}`)
      .filter((part) => part && !/^--\s*$/.test(part.trim()))
      .map((part) => mimeText(part.replace(/^\r?\n/, '').replace(/\r?\n$/, '')))
      .filter(Boolean)
      .join('\n');
  }

  if (type.startsWith('message/rfc822')) return mimeText(body);

  const decoded = decodeTransfer(body, headers['content-transfer-encoding'] || '');
  if (type.startsWith('text/html')) return htmlToText(decoded);
  if (type.startsWith('text/plain') || !type) return String(decoded).trim();
  return '';
}

function parseRawMessage(raw='') {
  const split = String(raw).search(/\r?\n\r?\n/);
  const headerText = split >= 0 ? raw.slice(0, split) : raw;
  const headers = parseHeaders(headerText);
  return {
    from: clean(headers.from || ''),
    subject: clean(headers.subject || ''),
    date: clean(headers.date || ''),
    messageId: clean(headers['message-id'] || ''),
    text: mimeText(raw),
  };
}

async function openImap(email, appPassword) {
  const socket = tls.connect({
    host: YAHOO_HOST,
    port: YAHOO_PORT,
    servername: YAHOO_HOST,
    rejectUnauthorized: true,
  });

  let buffer = Buffer.alloc(0);
  let endedError = null;
  const waiters = new Set();

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (const wake of [...waiters]) wake();
  });
  socket.on('error', (error) => {
    endedError = error;
    for (const wake of [...waiters]) wake();
  });
  socket.on('close', () => {
    if (!endedError) endedError = new Error('Yahoo IMAP connection closed');
    for (const wake of [...waiters]) wake();
  });

  const waitForData = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(wake);
      reject(new Error('Yahoo IMAP timed out'));
    }, 20000);
    const wake = () => {
      clearTimeout(timer);
      waiters.delete(wake);
      resolve();
    };
    waiters.add(wake);
  });

  const readLine = async () => {
    while (true) {
      const idx = buffer.indexOf(Buffer.from('\r\n'));
      if (idx >= 0) {
        const line = buffer.subarray(0, idx).toString('utf8');
        buffer = buffer.subarray(idx + 2);
        return line;
      }
      if (endedError) throw endedError;
      await waitForData();
    }
  };

  const readTagged = async (tag) => {
    while (true) {
      const latin = buffer.toString('latin1');
      let idx = latin.indexOf(`\r\n${tag} `);
      let prefix = 2;
      if (idx < 0 && latin.startsWith(`${tag} `)) {
        idx = 0;
        prefix = 0;
      }
      if (idx >= 0) {
        const end = latin.indexOf('\r\n', idx + prefix + tag.length + 1);
        if (end >= 0) {
          const response = buffer.subarray(0, end + 2);
          buffer = buffer.subarray(end + 2);
          const text = response.toString('latin1');
          const status = text.match(new RegExp(`(?:^|\\r\\n)${tag}\\s+(OK|NO|BAD)\\b`, 'i'))?.[1]?.toUpperCase() || '';
          if (status !== 'OK') {
            const tail = text.slice(Math.max(0, text.lastIndexOf(tag))).replace(/[\r\n]+/g, ' ').trim();
            throw new Error(tail || 'Yahoo IMAP command failed');
          }
          return response;
        }
      }
      if (endedError) throw endedError;
      await waitForData();
    }
  };

  await new Promise((resolve, reject) => {
    if (socket.authorized) return resolve();
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
    setTimeout(() => reject(new Error('Yahoo IMAP connection timed out')), 20000);
  });

  const greeting = await readLine();
  if (!/^\*\s+OK/i.test(greeting)) {
    socket.destroy();
    throw new Error('Yahoo IMAP did not accept the connection');
  }

  let counter = 1;
  const command = async (value) => {
    const tag = `A${String(counter++).padStart(4, '0')}`;
    socket.write(`${tag} ${value}\r\n`);
    return readTagged(tag);
  };

  try {
    await command(`LOGIN ${imapQuote(email)} ${imapQuote(appPassword)}`);
    await command('SELECT INBOX');
  } catch (error) {
    socket.destroy();
    const message = /AUTHENTICATIONFAILED|LOGIN failed|invalid credentials/i.test(error?.message || '')
      ? 'Yahoo rejected this credential. Create a new Yahoo app password in Yahoo Account Security under External connections, then paste that generated password here. Do not use your normal Yahoo sign-in password.'
      : error?.message || 'Could not connect to Yahoo Mail';
    throw new Error(message);
  }

  return {
    command,
    close: async () => {
      try { await command('LOGOUT'); } catch {}
      socket.destroy();
    },
  };
}

function literalMessages(response) {
  const result = [];
  const latin = response.toString('latin1');
  const re = /\{(\d+)\}\r\n/g;
  let match;
  let last = 0;
  while ((match = re.exec(latin))) {
    const length = Number(match[1]);
    const start = match.index + match[0].length;
    const prefix = latin.slice(last, match.index);
    const uidMatches = [...prefix.matchAll(/\bUID\s+(\d+)\b/gi)];
    const uid = Number(uidMatches.at(-1)?.[1] || 0);
    const raw = response.subarray(start, start + length).toString('utf8');
    if (uid && raw) result.push({ uid, raw });
    last = start + length;
    re.lastIndex = last;
  }
  return result;
}

function looksLikeYahooExpense(parsed={}) {
  const subject = normalize(parsed.subject || '');
  const text = normalize(parsed.text || '');
  const from = normalize(parsed.from || '');
  const haystack = `${subject}\n${text}`;

  // eBay buyer receipts/order confirmations and seller-cost notices.
  if (/ebay/.test(from)) {
    return /\b(order (?:confirmed|confirmation|details|summary|receipt)|your order|thanks for your (?:order|purchase)|thank you for your (?:order|purchase)|purchase (?:confirmation|receipt)|payment (?:confirmation|receipt|sent)|you paid|amount paid|total paid|seller fee|selling fee|transaction fee|promoted listing|ad fee|service fee|shipping label|postage|shipping charge)\b/i.test(haystack);
  }

  // Other Yahoo-received business receipts still use the broader receipt terms.
  return /\b(receipt|invoice|order confirmation|purchase confirmation|payment receipt|subscription renewal|shipping label|postage|service fee)\b/i.test(haystack);
}

const YAHOO_EXPENSE_TERMS = [
  'artflow expense',
  'receipt',
  'invoice',
  'order',
  'purchase',
  'order confirmation',
  'order confirmed',
  'order details',
  'order summary',
  'your order',
  'we received your order',
  'thanks for your purchase',
  'thank you for your purchase',
  'thank you for your order',
  'order receipt',
  'purchase confirmation',
  'purchase receipt',
  'payment confirmation',
  'payment receipt',
  'thanks for your order',
  'subscription renewal',
  'shipping label',
  'postage',
  'shipping charge',
  'seller fee',
  'selling fee',
  'transaction fee',
  'promoted listing',
  'ad fee',
  'service fee',
];

async function yahooExpenseMessages(email, appPassword, afterUid=0) {
  const imap = await openImap(email, appPassword);
  try {
    const found = new Set();
    const yearStart = `01-Jan-${new Date().getFullYear()}`;
    for (const term of YAHOO_EXPENSE_TERMS) {
      const uidRange = afterUid > 0 ? `UID ${afterUid + 1}:* ` : '';
      const response = await imap.command(
        `UID SEARCH ${uidRange}SINCE ${yearStart} HEADER SUBJECT ${imapQuote(term)}`
      );
      const text = response.toString('utf8');
      const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
      for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
        found.add(uid);
      }
    }

    // eBay buyer order emails use many different subjects. Scan every eBay
    // message from this year, then apply a content-level purchase/fee guard.
    {
      const uidRange = afterUid > 0 ? `UID ${afterUid + 1}:* ` : '';
      const response = await imap.command(
        `UID SEARCH ${uidRange}SINCE ${yearStart} HEADER FROM "ebay"`
      );
      const text = response.toString('utf8');
      const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
      for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
        found.add(uid);
      }
    }

    const allUids = [...found].sort((a,b)=>a-b);
    const uids = allUids.slice(0, MAX_MESSAGES_PER_RUN);
    const messages = [];
    for (let i = 0; i < uids.length; i += 20) {
      const batch = uids.slice(i, i + 20);
      const response = await imap.command(`UID FETCH ${batch.join(',')} (UID BODY.PEEK[])`);
      messages.push(...literalMessages(response));
    }
    return {
      messages,
      remaining: Math.max(0, allUids.length - uids.length),
      maxUid: uids.length ? Math.max(...uids) : afterUid,
    };
  } finally {
    await imap.close();
  }
}

async function recordYahooExpenseImport(client, business, email, uid, status, details) {
  const messageId = `yahoo:${email}:${uid}`;
  await client.query(`
    INSERT INTO artflow.email_import_messages (
      base44_id,business_id,message_id,import_type,status,platform,created_by_id,created_date,updated_date,data
    )
    SELECT gen_random_uuid()::text,$1,$2,'expense',$3,'Yahoo',$4,now(),now(),$5::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM artflow.email_import_messages
      WHERE business_id=$1 AND message_id=$2 AND import_type='expense'
    )
  `,[
    business.base44_id,
    messageId,
    status,
    business.created_by_id || null,
    JSON.stringify({ source:'yahoo_expense_sync', details, parser_version:1 }),
  ]);
}

async function insertYahooExpense(client, business, email, uid, parsed) {
  const messageKey = `yahoo:${email}:${uid}`;
  const saleRows = parseSaleEmail(parsed.from, parsed.subject, parsed.text, /ebay/i.test(parsed.from));
  if (saleRows.length) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Marketplace sale message was not counted as an expense');
    return { imported:0, skipped:1 };
  }

  if (isNonExpenseNotice(parsed.subject)) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Credit, refund, or failed-payment notice was not counted as a positive expense');
    return { imported:0, skipped:1 };
  }

  if (!looksLikeYahooExpense(parsed)) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Yahoo/eBay message was not a purchase or business-fee receipt');
    return { imported:0, skipped:1 };
  }

  const amount = extractTotal(`${parsed.subject}\n${parsed.text}`);
  if (!amount) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Yahoo receipt did not contain a recognizable purchase total');
    return { imported:0, skipped:1 };
  }

  const receiptId = `yahoo-expense:${email}:${uid}`;
  const existing = await client.query(`
    SELECT 1 FROM artflow.expenses
    WHERE business_id=$1
      AND (receipt_id=$2 OR data->>'yahoo_message_key'=$3)
    LIMIT 1
  `,[business.base44_id,receiptId,messageKey]);

  if (existing.rowCount) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Duplicate Yahoo expense email');
    return { imported:0, skipped:1 };
  }

  const description = originalSubject(parsed.subject, parsed.text).slice(0,240) || 'Yahoo email receipt';
  const category = categoryFor(parsed.subject, parsed.text);
  const source = sourceName(parsed.subject, parsed.text, parsed.from).slice(0,120);
  const accessEmails = Array.from(new Set([
    business.primary_email,
    business.data?.primary_email,
    ...(Array.isArray(business.data?.member_emails) ? business.data.member_emails : []),
    ...(Array.isArray(business.data?.expense_emails) ? business.data.expense_emails : []),
    email,
  ].map(normalize).filter(Boolean)));

  const result = await client.query(`
    INSERT INTO artflow.expenses (
      base44_id,business_id,expense_date,category,amount,archived,source,receipt_id,created_by_id,created_date,updated_date,data
    ) VALUES (
      gen_random_uuid()::text,$1,$2,$3,$4,false,$5,$6,$7,now(),now(),$8::jsonb
    )
    RETURNING base44_id
  `,[
    business.base44_id,
    expenseLocalDate(parsed.date || new Date().toISOString()),
    category,
    amount,
    source,
    receiptId,
    business.created_by_id || null,
    JSON.stringify({
      source:'yahoo_expense_sync',
      sync_source:'yahoo_expense_sync',
      source_email:email,
      yahoo_uid:uid,
      yahoo_message_key:messageKey,
      yahoo_message_id:parsed.messageId || '',
      description,
      deductible_percent:100,
      deductible_amount:amount,
      status:'pending',
      access_emails:accessEmails,
    }),
  ]);

  await recordYahooExpenseImport(
    client,
    business,
    email,
    uid,
    result.rows[0] ? 'imported' : 'skipped',
    result.rows[0] ? `Imported Yahoo expense: ${description}` : 'Duplicate Yahoo expense email'
  );
  return { imported:result.rows[0] ? 1 : 0, skipped:result.rows[0] ? 0 : 1 };
}

async function yahooMessages(email, appPassword, afterUid=0) {
  const imap = await openImap(email, appPassword);
  try {
    const yearStart = `01-Jan-${new Date().getFullYear()}`;
    const criteria = afterUid > 0
      ? `UID ${afterUid + 1}:* HEADER FROM "ebay"`
      : `SINCE ${yearStart} HEADER FROM "ebay"`;
    const searchResponse = await imap.command(`UID SEARCH ${criteria}`);
    const text = searchResponse.toString('utf8');
    const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
    const allUids = searchLine.split(/\s+/).map(Number).filter(Number.isFinite).filter((n) => n > 0).sort((a,b)=>a-b);
    const uids = allUids.slice(0, MAX_MESSAGES_PER_RUN);
    const messages = [];

    for (let i = 0; i < uids.length; i += 20) {
      const batch = uids.slice(i, i + 20);
      const response = await imap.command(`UID FETCH ${batch.join(',')} (UID BODY.PEEK[])`);
      messages.push(...literalMessages(response));
    }

    return {
      messages,
      remaining: Math.max(0, allUids.length - uids.length),
      maxUid: uids.length ? Math.max(...uids) : afterUid,
    };
  } finally {
    await imap.close();
  }
}

function yahooConfig(business={}) {
  return business?.data?.yahoo_mail || {};
}

async function saveYahooConfig(client, business, patch) {
  const current = yahooConfig(business);
  const yahooMail = { ...current, ...patch, updated_at: new Date().toISOString() };
  const next = { ...(business.data || {}), yahoo_mail: yahooMail };
  await client.query(
    `UPDATE artflow.businesses SET data=$2::jsonb, updated_date=now() WHERE base44_id=$1`,
    [business.base44_id, JSON.stringify(next)]
  );
  business.data = next;
  return yahooMail;
}

export async function syncYahooExpenses(client, business) {
  const config = yahooConfig(business);
  const email = normalize(config.email);
  if (!config.connected || !email || !config.app_password_enc) {
    return { connected:false, checked:0, imported:0, skipped:0, remaining:0 };
  }

  const password = decrypt(config.app_password_enc);
  const savedParserVersion = Number(config.expense_parser_version || 0);
  // Re-scan this year's Yahoo receipts whenever the parser changes. This is
  // intentionally safe because insertYahooExpense deduplicates by Yahoo UID.
  const expenseAfterUid = savedParserVersion >= YAHOO_EXPENSE_PARSER_VERSION
    ? Number(config.last_expense_uid || 0)
    : 0;
  const { messages, remaining, maxUid } = await yahooExpenseMessages(
    email,
    password,
    expenseAfterUid
  );

  let imported = 0;
  let skipped = 0;
  for (const item of messages) {
    const parsed = parseRawMessage(item.raw);
    const result = await insertYahooExpense(client, business, email, item.uid, parsed);
    imported += result.imported;
    skipped += result.skipped;
  }

  await saveYahooConfig(client, business, {
    last_expense_uid:maxUid,
    expense_parser_version:YAHOO_EXPENSE_PARSER_VERSION,
    last_expense_sync_at:new Date().toISOString(),
    last_expense_checked:messages.length,
    last_expense_imported:imported,
    last_expense_skipped:skipped,
    last_expense_error:'',
  });

  console.log('Yahoo expense sync summary', JSON.stringify({
    checked: messages.length,
    imported,
    skipped,
    remaining,
    parser_version: YAHOO_EXPENSE_PARSER_VERSION,
  }));

  return { connected:true, checked:messages.length, imported, skipped, remaining };
}

export async function syncYahooMailbox(client, business) {
  const config = yahooConfig(business);
  const email = normalize(config.email);
  if (!config.connected || !email || !config.app_password_enc) {
    return { connected:false, checked:0, saved:0, remaining:0 };
  }

  const password = decrypt(config.app_password_enc);
  const { messages, remaining, maxUid } = await yahooMessages(email, password, Number(config.last_uid || 0));
  const rows = [];

  for (const item of messages) {
    const parsed = parseRawMessage(item.raw);
    const trustedEbay = /ebay/i.test(parsed.from);
    const saleRows = parseSaleEmail(parsed.from, parsed.subject, parsed.text, trustedEbay);
    for (const row of saleRows) {
      rows.push({
        ...row,
        sale_date: parsed.date || new Date().toISOString(),
      });
    }
  }

  const saved = await insertOrders(client, business.base44_id, rows, 'yahoo_direct_sales');
  await saveYahooConfig(client, business, {
    last_uid: maxUid,
    last_sync_at: new Date().toISOString(),
    last_checked: messages.length,
    last_saved: saved,
    last_error: '',
  });

  return { connected:true, checked:messages.length, saved, remaining };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const client = await pool.connect();
  try {
    const s = await session(req).catch(() => null);
    if (!s?.user) return res.status(401).json({ error:'Unauthorized' });
    const p = await profile(client, s.user);
    const business = await businessForUser(client, p, s.user);
    if (!business) return res.status(404).json({ error:'Business workspace not found' });

    const config = yahooConfig(business);
    const savedYahoo = (business.data?.sales_emails || []).map(normalize).find((value) => /@(?:yahoo|ymail|rocketmail)\./i.test(value)) || '';

    if (req.method === 'GET') {
      return res.status(200).json({
        connected: Boolean(config.connected && config.email && config.app_password_enc),
        email: normalize(config.email || savedYahoo),
        last_sync_at: config.last_sync_at || null,
        last_checked: Number(config.last_checked || 0),
        last_saved: Number(config.last_saved || 0),
        last_error: clean(config.last_error || ''),
        last_expense_sync_at: config.last_expense_sync_at || null,
        last_expense_checked: Number(config.last_expense_checked || 0),
        last_expense_imported: Number(config.last_expense_imported || 0),
        last_expense_skipped: Number(config.last_expense_skipped || 0),
        last_expense_error: clean(config.last_expense_error || ''),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
    const body = parseBody(req);
    const action = clean(body.action);

    if (action === 'connect') {
      const email = normalize(body.email || savedYahoo);
      const appPassword = clean(body.app_password).replace(/\s+/g, '');
      if (!email || !/@(?:yahoo|ymail|rocketmail)\./i.test(email)) {
        return res.status(400).json({ error:'Enter the Yahoo email address you use for eBay.' });
      }
      if (!appPassword) return res.status(400).json({ error:'Enter a Yahoo app password.' });

      const test = await openImap(email, appPassword);
      await test.close();

      const salesEmails = Array.from(new Set([...(business.data?.sales_emails || []), email].map(normalize).filter(Boolean)));
      const next = {
        ...(business.data || {}),
        sales_emails: salesEmails,
        yahoo_mail: {
          ...config,
          email,
          connected:true,
          app_password_enc: encrypt(appPassword),
          connected_at: new Date().toISOString(),
          last_uid: Number(config.last_uid || config.sales_floor_uid || 0),
          last_expense_uid: Number(config.last_expense_uid || 0),
          last_sync_at: config.last_sync_at || null,
          last_expense_sync_at: config.last_expense_sync_at || null,
          last_error:'',
          last_expense_error:'',
        },
      };
      await client.query(
        `UPDATE artflow.businesses SET data=$2::jsonb, updated_date=now() WHERE base44_id=$1`,
        [business.base44_id, JSON.stringify(next)]
      );
      business.data = next;

      const salesResult = await syncYahooMailbox(client, business);
      const expenseResult = await syncYahooExpenses(client, business);
      return res.status(200).json({
        ok:true,
        ...salesResult,
        expenses:expenseResult,
        email,
        message: expenseResult.imported > 0
          ? `Yahoo connected. Added ${expenseResult.imported} expense receipt${expenseResult.imported === 1 ? '' : 's'} to review.`
          : 'Yahoo connected. Sales and expense receipts are now checked directly.',
      });
    }

    if (action === 'sync') {
      try {
        const result = await syncYahooMailbox(client, business);
        const expenses = await syncYahooExpenses(client, business);
        console.log('Yahoo sync summary', JSON.stringify({
          sales_checked: Number(result.checked || 0),
          sales_saved: Number(result.saved || 0),
          expense_checked: Number(expenses.checked || 0),
          expense_imported: Number(expenses.imported || 0),
          expense_skipped: Number(expenses.skipped || 0),
          expense_remaining: Number(expenses.remaining || 0),
        }));
        return res.status(200).json({
          ok:true,
          ...result,
          expenses,
          message: [
            result.saved > 0 ? `${result.saved} new eBay sale${result.saved === 1 ? '' : 's'}` : '',
            expenses.imported > 0 ? `${expenses.imported} Yahoo expense receipt${expenses.imported === 1 ? '' : 's'} added to review` : '',
          ].filter(Boolean).join(' and ') || 'Yahoo sales and expenses are up to date.',
        });
      } catch (error) {
        await saveYahooConfig(client, business, { last_error: clean(error?.message || 'Yahoo sync failed') }).catch(() => {});
        return res.status(409).json({ error: clean(error?.message || 'Yahoo sync failed'), code:'YAHOO_RECONNECT' });
      }
    }

    if (action === 'disconnect') {
      const next = {
        ...(business.data || {}),
        yahoo_mail: {
          ...config,
          connected:false,
          app_password_enc:'',
          disconnected_at:new Date().toISOString(),
          last_error:'',
          last_expense_error:'',
        },
      };
      await client.query(
        `UPDATE artflow.businesses SET data=$2::jsonb, updated_date=now() WHERE base44_id=$1`,
        [business.base44_id, JSON.stringify(next)]
      );
      return res.status(200).json({ ok:true });
    }

    return res.status(400).json({ error:'Unknown action' });
  } catch (error) {
    console.error('Yahoo inbox error', error?.message || error);
    return res.status(500).json({ error: clean(error?.message || 'Yahoo inbox failed') || 'Yahoo inbox failed' });
  } finally {
    client.release();
  }
}
