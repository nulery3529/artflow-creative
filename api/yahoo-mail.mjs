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
const MAX_EXPENSE_MESSAGES_PER_RUN = 120;
const YAHOO_EXPENSE_PARSER_VERSION = 16;

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
    .replace(/&#36;|&#x24;|&dollar;/gi, '$')
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return ' '; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try { return String.fromCodePoint(parseInt(code, 16)); } catch { return ' '; }
    })
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

function mimeHtml(raw='') {
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
      .map((part) => mimeHtml(part.replace(/^\r?\n/, '').replace(/\r?\n$/, '')))
      .filter(Boolean)
      .join('\n');
  }

  if (type.startsWith('message/rfc822')) return mimeHtml(body);
  if (!type.startsWith('text/html')) return '';

  return decodeTransfer(body, headers['content-transfer-encoding'] || '');
}

function decodeHtmlAttribute(value='') {
  return clean(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, '/');
}

function ebayListingUrl(html='', raw='') {
  const values = [];
  const source = `${html || ''}\n${raw || ''}`;

  for (const match of source.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) values.push(match[1]);
  for (const match of source.matchAll(/https?:\/\/[^"'<>\s]+/gi)) values.push(match[0]);

  const candidates = [];
  for (let value of values) {
    value = decodeHtmlAttribute(value).replace(/=3D/gi, '=');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch { break; }
    }
    const embedded = value.match(/https?:\/\/[^"'<>\s]+/gi) || [];
    for (const candidate of [value, ...embedded]) {
      try {
        const url = new URL(candidate);
        const host = url.hostname.toLowerCase();
        if (host !== 'ebay.com' && !host.endsWith('.ebay.com')) continue;
        if (!/\/itm\//i.test(url.pathname)) continue;
        url.hash = '';
        let score = 10;
        if (/\/itm\/(?:[^/]+\/)?\d{8,}/i.test(url.pathname)) score += 20;
        if (/viewitem|item/i.test(url.pathname + url.search)) score += 5;
        candidates.push({ url:url.toString(), score });
      } catch {}
    }
  }

  candidates.sort((a,b) => b.score - a.score);
  if (candidates[0]?.url) return candidates[0].url;

  const itemId =
    source.match(/(?:item\s*(?:number|no\.?|id)|ebay\s*item\s*(?:number|id))\s*[:#-]?\s*(\d{9,14})/i)?.[1]
    || source.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,14})(?:[/?#]|$)/i)?.[1]
    || '';
  return itemId ? `https://www.ebay.com/itm/${itemId}` : '';
}

function ebayImageUrl(html='', title='', raw='') {
  const key = (value='') => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const titleKey = key(title);
  const candidates = [];
  const addCandidate = (srcRaw='', alt='', bonus=0) => {
    let src = decodeHtmlAttribute(srcRaw).replace(/=3D/gi, '=').replace(/=\r?\n/g, '');
    if (!src) return;
    if (src.startsWith('//')) src = `https:${src}`;
    if (!/^https:\/\//i.test(src)) return;

    let host = '';
    try { host = new URL(src).hostname.toLowerCase(); } catch { return; }
    if (host !== 'i.ebayimg.com' && !host.endsWith('.ebayimg.com')) return;

    if (/app[ _-]?store|google[ _-]?play|download(?: the)? app|mobile app|ebay app|logo|icon/i.test(`${alt}\n${src}`)) return;

    let score = 30 + bonus;
    const altKey = key(alt);
    if (titleKey && altKey) {
      if (altKey === titleKey) score += 80;
      else if (altKey.includes(titleKey) || titleKey.includes(altKey)) score += 55;
      else {
        const words = clean(title).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
        const hits = words.filter((word) => alt.toLowerCase().includes(word)).length;
        score += Math.min(36, hits * 6);
      }
    }
    if (/\/images\/g\//i.test(src)) score += 25;
    if (/s-l(?:1600|1200|800|500|400|300|225)/i.test(src)) score += 12;
    candidates.push({ src, score });
  };

  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const alt = decodeHtmlAttribute(tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || '');
    const attrs = [
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1],
      tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1],
      tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1],
    ].filter(Boolean);
    for (const attr of attrs) {
      for (const piece of String(attr).split(',').map((v) => v.trim().split(/\s+/)[0]).filter(Boolean)) {
        addCandidate(piece, alt, 20);
      }
    }
  }

  const source = `${html || ''}\n${raw || ''}`;
  for (const match of source.matchAll(/https?:\/\/[^"'<>\s=]+/gi)) addCandidate(match[0], '', 0);
  for (const match of source.matchAll(/https?:=3D\/\/[^"'<>\s]+/gi)) {
    addCandidate(match[0].replace(/=3D/gi, '='), '', 0);
  }

  candidates.sort((a,b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 30 ? best.src : '';
}

function parseRawMessage(raw='') {
  const split = String(raw).search(/\r?\n\r?\n/);
  const headerText = split >= 0 ? raw.slice(0, split) : raw;
  const headers = parseHeaders(headerText);
  const html = mimeHtml(raw);
  const plainText = mimeText(raw);
  const htmlText = html ? htmlToText(html) : '';
  const text = htmlText && normalize(htmlText) !== normalize(plainText)
    ? `${plainText}\n${htmlText}`
    : plainText;
  return {
    from: clean(headers.from || ''),
    subject: clean(headers.subject || ''),
    date: clean(headers.date || ''),
    messageId: clean(headers['message-id'] || ''),
    text,
    html,
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
    select: async (mailbox = 'INBOX') => command(`SELECT ${imapQuote(mailbox)}`),
    listMailboxes: async () => {
      const response = await command('LIST "" "*"');
      const text = response.toString('utf8');
      const names = [];
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\*\s+LIST\s+\([^)]*\)\s+(?:"[^"]*"|NIL)\s+(.+)$/i);
        if (!match) continue;
        let name = clean(match[1] || '');
        if (name.startsWith('"') && name.endsWith('"')) {
          name = name.slice(1, -1).replace(/\\(["\\])/g, '$1');
        }
        if (name && !names.includes(name)) names.push(name);
      }
      return names;
    },
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

  const explicitBuyerReceiptSubject =
    /\b(?:order confirmed|your order is confirmed|order confirmation|order receipt|purchase confirmation|purchase receipt|payment confirmation|payment receipt)\b/i.test(subject);

  const listingNoise =
    !explicitBuyerReceiptSubject &&
    /\b(?:your listing|listing (?:created|live|active|ended|renewed|updated|published|removed)|item listed|listed item|watcher|watching|listing views?|listing activity|listing performance|offer received|send offer|price drop|sell similar|relist|draft listing|promote your listing)\b/i.test(haystack);
  if (listingNoise) return false;

  // Messages sent through eBay's member-to-member relay are conversations.
  if (/@members\.ebay\.[a-z.]+\b/i.test(from)) return false;

  if (/ebay/.test(from)) {
    const buyerReceipt =
      /\b(?:order confirmed|your order is confirmed|order confirmation|order receipt|purchase confirmation|purchase receipt|payment confirmation|payment receipt|you paid|amount paid|total paid|thanks for your order|thank you for your purchase|thank you for your order)\b/i.test(haystack);
    const businessCharge =
      /\b(?:seller fee|selling fee|transaction fee|service fee|ad fee|promoted listing fee|shipping label|postage|shipping charge)\b/i.test(haystack);
    return buyerReceipt || businessCharge;
  }

  const amazonReceipt =
    /amazon/i.test(from)
    && (
      /\b(?:your amazon(?:\.com)? order|amazon(?:\.com)? order|order confirmed|order confirmation)\b/i.test(haystack)
      || /\bordered\s+\d+\s+items?\b/i.test(subject)
    );
  if (amazonReceipt) return true;

  return /\b(?:receipt|invoice|order confirmation|purchase confirmation|payment receipt|subscription renewal|shipping label|postage|service fee)\b/i.test(haystack);
}

const YAHOO_EXPENSE_TERMS = [
  'artflow expense',
  'your amazon.com order',
  'your amazon order',
  'amazon.com order',
  'ordered',
  'receipt',
  'invoice',
  'order confirmation',
  'order confirmed',
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
  'promoted listing fee',
  'ad fee',
  'service fee',
];

async function yahooExpenseMessages(email, appPassword, afterUid=0) {
  const imap = await openImap(email, appPassword);
  try {
    const found = new Set();
    const yearStart = `01-Jan-${new Date().getFullYear()}`;
    const collectUids = (response) => {
      const text = response.toString('utf8');
      const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
      for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
        found.add(uid);
      }
    };

    if (afterUid > 0) {
      // Once the current-year backfill has started, inspect every new Yahoo
      // message in bounded UID order. The receipt parser below decides what is
      // actually an expense, so vendor-specific subject wording cannot make a
      // real purchase disappear from Art Flow.
      const response = await imap.command(
        `UID SEARCH UID ${afterUid + 1}:* SINCE ${yearStart}`
      );
      collectUids(response);
    } else {
      // First pass for a parser version: find likely current-year receipts
      // without downloading the user's entire Yahoo inbox.
      for (const term of YAHOO_EXPENSE_TERMS) {
        const response = await imap.command(
          `UID SEARCH SINCE ${yearStart} HEADER SUBJECT ${imapQuote(term)}`
        );
        collectUids(response);
      }
    }

    // Process oldest candidates first so the saved UID is a true checkpoint.
    // This prevents a large inbox from skipping older receipts when a run is
    // intentionally capped for Vercel's function time limit.
    const allUids = [...found].sort((a,b)=>a-b);
    const uids = allUids.slice(0, MAX_EXPENSE_MESSAGES_PER_RUN);
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

  const explicitBuyerReceiptSubject =
    /\b(?:order confirmed|your order is confirmed|order confirmation|order receipt|purchase confirmation|purchase receipt|payment confirmation|payment receipt)\b/i.test(parsed.subject || '');
  const listingNoise =
    !explicitBuyerReceiptSubject &&
    /\b(?:your listing|listing (?:created|live|active|ended|renewed|updated|published|removed)|item listed|listed item|watcher|watching|listing views?|listing activity|listing performance|offer received|send offer|price drop|sell similar|relist|draft listing|promote your listing)\b/i.test(`${parsed.subject || ''}\n${parsed.text || ''}`);
  if (listingNoise) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'Marketplace listing/activity message was not counted as an expense');
    return { imported:0, skipped:1 };
  }

  if (/@members\.ebay\.[a-z.]+\b/i.test(String(parsed.from || ''))) {
    await recordYahooExpenseImport(client, business, email, uid, 'skipped', 'eBay member message was not counted as an expense');
    return { imported:0, skipped:1 };
  }

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

  const receiptText = `${parsed.subject}\n${parsed.text}`;
  let amount = extractTotal(receiptText);
  if (!amount && /ebay/i.test(parsed.from)) {
    const labelledAmount =
      receiptText.match(/order\s*total[\s\S]{0,120}?(?:US\s*)?\$\s*([\d,]+\.\d{2})/i)?.[1]
      || receiptText.match(/(?:total\s*paid|amount\s*paid|you\s*paid|payment\s*total)[\s\S]{0,120}?(?:US\s*)?\$\s*([\d,]+\.\d{2})/i)?.[1]
      || receiptText.match(/(?:order\s*total|total\s*paid|amount\s*paid|you\s*paid|payment\s*total)[\s\S]{0,120}?\bUSD\s*([\d,]+\.\d{2})/i)?.[1]
      || '';
    amount = Number(String(labelledAmount).replace(/,/g, '')) || 0;
  }
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
    // eBay mail can be routed by Yahoo rules into Archive or a custom folder.
    // Search every non-trash mailbox instead of only INBOX, and re-scan a
    // recent window so a moved message cannot be permanently missed.
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const recentStart = `${String(since.getDate()).padStart(2,'0')}-${months[since.getMonth()]}-${since.getFullYear()}`;
    const yearStart = `01-Jan-${new Date().getFullYear()}`;

    let mailboxes = ['INBOX'];
    try {
      const listed = await imap.listMailboxes();
      mailboxes = Array.from(new Set(['INBOX', ...listed])).filter((name) => {
        const normalized = normalize(name);
        return normalized &&
          !/(?:^|[\/._ -])(trash|deleted|sent|draft|junk|spam|bulk)(?:$|[\/._ -])/i.test(normalized);
      });
    } catch {}

    const messages = [];
    let candidateCount = 0;
    const fetchedKeys = new Set();

    // First pass: search every mailbox for the exact seller-side eBay sale
    // subjects before any broad scan can consume the message cap.
    for (const mailbox of mailboxes) {
      try {
        await imap.select(mailbox);
      } catch {
        continue;
      }

      const exactFound = new Set();
      const exactSearches = [
        `SINCE ${yearStart} HEADER SUBJECT "You made the sale for"`,
        `SINCE ${yearStart} HEADER SUBJECT "You made a sale"`,
      ];

      for (const criteria of exactSearches) {
        try {
          const searchResponse = await imap.command(`UID SEARCH ${criteria}`);
          const text = searchResponse.toString('utf8');
          const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
          for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
            exactFound.add(uid);
          }
        } catch {}
      }

      const exactUids = [...exactFound].sort((a, b) => a - b);
      candidateCount += exactUids.length;
      for (let i = 0; i < exactUids.length; i += 20) {
        const batch = exactUids.slice(i, i + 20);
        const response = await imap.command(`UID FETCH ${batch.join(',')} (UID BODY.PEEK[])`);
        for (const item of literalMessages(response)) {
          const key = `${mailbox}:${item.uid}`;
          if (fetchedKeys.has(key)) continue;
          fetchedKeys.add(key);
          messages.push({ ...item, mailbox });
        }
      }
    }

    for (const mailbox of mailboxes) {
      if (messages.length >= MAX_MESSAGES_PER_RUN) break;

      try {
        await imap.select(mailbox);
      } catch {
        continue;
      }

      const priorityFound = new Set();
      const broadFound = new Set();
      // Backfill seller-style sale subjects for the current year so older eBay
      // orders are not missed. Keep the broad eBay sender scan on the recent
      // window below so listing confirmations cannot crowd out actual sales.
      const prioritySearches = [
        `SINCE ${yearStart} HEADER SUBJECT "You made the sale for"`,
        `SINCE ${yearStart} HEADER SUBJECT "sale"`,
        `SINCE ${yearStart} HEADER SUBJECT "sold"`,
        `SINCE ${yearStart} HEADER SUBJECT "payment"`,
        `SINCE ${yearStart} HEADER SUBJECT "paid"`,
        `SINCE ${yearStart} HEADER SUBJECT "ship"`,
        `SINCE ${yearStart} HEADER SUBJECT "buyer"`,
        `SINCE ${yearStart} HEADER SUBJECT "order"`,
      ];

      for (const criteria of prioritySearches) {
        try {
          const searchResponse = await imap.command(`UID SEARCH ${criteria}`);
          const text = searchResponse.toString('utf8');
          const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
          for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
            priorityFound.add(uid);
          }
        } catch {}
      }

      // Also scan eBay sender traffic, but do not let high-volume listing and
      // promotional mail crowd seller-order subjects out of the 300-message cap.
      try {
        const searchResponse = await imap.command(`UID SEARCH SINCE ${recentStart} HEADER FROM "ebay"`);
        const text = searchResponse.toString('utf8');
        const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
        for (const uid of searchLine.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
          broadFound.add(uid);
        }
      } catch {}

      // Yahoo's SUBJECT index can miss messages that are clearly visible in the
      // mailbox. Inspect headers from all recent eBay messages locally before
      // applying the 300-message full-body cap, then promote exact sale emails.
      const headerPromoted = new Set();
      const recentEbayUids = [...broadFound].sort((a, b) => b - a).slice(0, 2000);
      for (let i = 0; i < recentEbayUids.length; i += 100) {
        const batch = recentEbayUids.slice(i, i + 100);
        try {
          const response = await imap.command(
            `UID FETCH ${batch.join(',')} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])`
          );
          for (const item of literalMessages(response)) {
            const parsedHeader = parseRawMessage(item.raw);
            if (/\byou made (?:a|the) sale(?: for)?\b/i.test(parsedHeader.subject || '')) {
              headerPromoted.add(item.uid);
            }
          }
        } catch {}
      }
      for (const uid of headerPromoted) priorityFound.add(uid);

      let promotedFetched = 0;
      if (headerPromoted.size) {
        const promotedUids = [...headerPromoted].sort((a, b) => a - b);
        candidateCount += promotedUids.length;
        for (let i = 0; i < promotedUids.length; i += 20) {
          const batch = promotedUids.slice(i, i + 20);
          try {
            const response = await imap.command(`UID FETCH ${batch.join(',')} (UID BODY.PEEK[])`);
            for (const item of literalMessages(response)) {
              const key = `${mailbox}:${item.uid}`;
              if (fetchedKeys.has(key)) continue;
              fetchedKeys.add(key);
              messages.push({ ...item, mailbox });
              promotedFetched += 1;
            }
          } catch {}
        }

        console.log('Yahoo promoted eBay sale headers', JSON.stringify({
          mailbox,
          promoted: headerPromoted.size,
          promoted_fetched: promotedFetched,
          recent_ebay_headers_checked: recentEbayUids.length,
        }));
      }

      // If Yahoo's indexed searches return nothing, scan recent mail in this
      // folder. parseSaleEmail() still requires seller-side eBay wording.
      if (!priorityFound.size && !broadFound.size) {
        try {
          const response = await imap.command(`UID SEARCH SINCE ${recentStart}`);
          const text = response.toString('utf8');
          const searchLine = text.match(/^\* SEARCH(?:\s+([0-9 ]+))?/mi)?.[1] || '';
          const recent = searchLine
            .split(/\s+/)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .slice(-75);
          recent.forEach((uid) => broadFound.add(uid));
        } catch {}
      }

      const capacity = Math.max(0, MAX_MESSAGES_PER_RUN - messages.length);
      const priorityUids = [...priorityFound].sort((a, b) => b - a);
      const broadUids = [...broadFound]
        .filter((uid) => !priorityFound.has(uid))
        .sort((a, b) => b - a);
      const uids = [...priorityUids, ...broadUids]
        .slice(0, capacity)
        .sort((a, b) => a - b);

      candidateCount += uids.length;

      for (let i = 0; i < uids.length; i += 20) {
        const batch = uids.slice(i, i + 20);
        const response = await imap.command(`UID FETCH ${batch.join(',')} (UID BODY.PEEK[])`);
        for (const item of literalMessages(response)) {
          const key = `${mailbox}:${item.uid}`;
          if (fetchedKeys.has(key)) continue;
          fetchedKeys.add(key);
          messages.push({ ...item, mailbox });
        }
      }
    }

    try { await imap.select('INBOX'); } catch {}

    return {
      messages,
      remaining: Math.max(0, candidateCount - messages.length),
      maxUid: afterUid,
      foldersChecked: mailboxes.length,
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
  // Remove old Yahoo false positives that were listing/activity notifications,
  // not actual business expenses. Keep fee-related records intact.
  await client.query(`
    DELETE FROM artflow.expenses
    WHERE business_id=$1
      AND COALESCE(data->>'source','')='yahoo_expense_sync'
      AND COALESCE(data->>'status','pending')='pending'
      AND COALESCE(data->>'description','') !~* '\\b(fee|fees|postage|shipping label|service charge|transaction charge)\\b'
      AND COALESCE(data->>'description','') ~* '\\b(your listing|listing (created|live|active|ended|renewed|updated|published|removed)|item listed|watcher|listing views?|listing activity|listing performance|offer received|send offer|price drop|sell similar|relist|draft listing|promote your listing)\\b'
  `, [business.base44_id]).catch(() => {});

  const config = yahooConfig(business);
  const email = normalize(config.email);
  if (!config.connected || !email || !config.app_password_enc) {
    return {
      connected:false,
      checked:0,
      imported:0,
      skipped:0,
      remaining:0,
      code:'YAHOO_RECONNECT',
    };
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

function normalizedOrderTitle(value='') {
  return clean(value)
    .toLowerCase()
    .replace(/^\s*[0-9]+(?:\.[0-9]+)?\s*x\s*[0-9]+(?:\.[0-9]+)?\s*[-–—|:]?\s*/i, '')
    .replace(/\b(?:of|the|a|an)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '');
}

function titleMatchScore(a='', b='') {
  const left=normalizedOrderTitle(a);
  const right=normalizedOrderTitle(b);
  if(!left || !right) return 0;
  if(left===right) return 100;
  if(left.includes(right) || right.includes(left)) {
    const shorter=Math.min(left.length,right.length);
    const longer=Math.max(left.length,right.length);
    return Math.round(80 * (shorter / Math.max(1,longer)));
  }
  const chunks=(text)=>new Set(String(text).match(/[a-z]+|\d+/g) || []);
  const aa=chunks(String(a).toLowerCase());
  const bb=chunks(String(b).toLowerCase());
  let shared=0;
  for(const token of aa) if(bb.has(token)) shared+=1;
  return Math.round((shared / Math.max(1,Math.min(aa.size,bb.size))) * 60);
}

async function repairExistingEbayImages(client, businessId, rows = []) {
  const candidates = (rows || []).filter((row) =>
    String(row?.platform || '').toLowerCase() === 'ebay'
    && clean(row?.image_url)
    && clean(row?.product_name)
  );
  if (!candidates.length) return 0;

  const recent = await client.query(`
    SELECT base44_id, order_id, product_name, sale_date, data
    FROM artflow.orders
    WHERE business_id=$1
      AND lower(COALESCE(platform,''))='ebay'
      AND archived IS NOT TRUE
      AND sale_date >= current_date - interval '90 days'
    ORDER BY sale_date DESC NULLS LAST, updated_date DESC NULLS LAST
    LIMIT 500
  `, [businessId]);

  const alreadyUsed = new Set();
  let repaired = 0;

  for (const row of candidates) {
    const candidateDate = row.sale_date ? new Date(row.sale_date) : null;
    const orderId = clean(row.order_id);
    let best = null;
    let bestScore = -1;

    for (const order of recent.rows || []) {
      if (alreadyUsed.has(order.base44_id)) continue;
      if (orderId && clean(order.order_id) === orderId) {
        best = order;
        bestScore = 1000;
        break;
      }

      let score = titleMatchScore(row.product_name, order.product_name);
      if (score < 45) continue;

      if (candidateDate && order.sale_date) {
        const orderDate = new Date(order.sale_date);
        const dayDiff = Math.abs(candidateDate.getTime() - orderDate.getTime()) / 86400000;
        if (Number.isFinite(dayDiff)) {
          if (dayDiff > 7) continue;
          score += Math.max(0, 20 - Math.round(dayDiff * 3));
        }
      }

      if (score > bestScore) {
        best = order;
        bestScore = score;
      }
    }

    if (!best || bestScore < 45) continue;

    const currentImage = clean(best?.data?.image_url || '');
    if (currentImage && Number(best?.data?.source_image_parser_version || 0) >= 6) continue;

    const result = await client.query(`
      UPDATE artflow.orders
         SET data = COALESCE(data,'{}'::jsonb)
           || jsonb_build_object(
                'image_url',$2,
                'source_image_parser_version',6,
                'source_image_repaired_at',now()
              ),
             updated_date=now()
       WHERE base44_id=$1
         AND business_id=$3
      RETURNING base44_id
    `, [best.base44_id, clean(row.image_url), businessId]);

    if (result.rowCount) {
      repaired += 1;
      alreadyUsed.add(best.base44_id);
    }
  }

  return repaired;
}

export async function syncYahooMailbox(client, business) {
  await client.query(`
    DELETE FROM artflow.orders
    WHERE business_id=$1
      AND sync_source='yahoo_direct_sales'
      AND created_date >= date_trunc('day', now())
      AND COALESCE(order_id,'')=''
      AND COALESCE(buyer,'')=''
  `, [business.base44_id]).catch(() => {});

  const config = yahooConfig(business);
  const email = normalize(config.email);
  if (!config.connected || !email || !config.app_password_enc) {
    const diagnostics = {
      connected_flag: Boolean(config.connected),
      email_present: Boolean(email),
      credential_present: Boolean(config.app_password_enc),
    };
    console.warn('Yahoo sales connection unavailable', JSON.stringify(diagnostics));
    return {
      connected:false,
      checked:0,
      saved:0,
      remaining:0,
      code:'YAHOO_RECONNECT',
      diagnostics,
    };
  }

  const password = decrypt(config.app_password_enc);
  const { messages, remaining, maxUid, foldersChecked = 1 } = await yahooMessages(email, password, Number(config.last_uid || 0));
  const rows = [];
  const unmatchedEbay = [];

  for (const item of messages) {
    const parsed = parseRawMessage(item.raw);
    const trustedEbay = /ebay/i.test(parsed.from);
    const saleRows = parseSaleEmail(parsed.from, parsed.subject, parsed.text, trustedEbay);
    if (!saleRows.length && trustedEbay && unmatchedEbay.length < 12) {
      unmatchedEbay.push({
        from: clean(parsed.from).slice(0, 160),
        subject: clean(parsed.subject).slice(0, 220),
        mailbox: clean(item.mailbox || '').slice(0, 80),
      });
    }
    for (const row of saleRows) {
      const imageUrl =
        row.platform === 'eBay'
          ? ebayImageUrl(parsed.html, row.product_name, item.raw)
          : '';
      const listingUrl =
        row.platform === 'eBay'
          ? ebayListingUrl(parsed.html, item.raw)
          : '';
      rows.push({
        ...row,
        ...(imageUrl ? { image_url:imageUrl } : {}),
        ...(listingUrl ? { source_url:listingUrl } : {}),
        order_id: row.order_id || (row.amount_pending
          ? `yahoo-ebay-${clean(parsed.messageId || String(item.uid)).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120)}`
          : row.order_id),
        sale_date: parsed.date || new Date().toISOString(),
      });
    }
  }

  if (unmatchedEbay.length) {
    console.log('Yahoo unmatched eBay subjects', JSON.stringify(unmatchedEbay));
  }

  const imageRows = rows.filter((row) => row.image_url).length;
  const listingRows = rows.filter((row) => row.source_url && /ebay\.com\/.*\/itm\//i.test(row.source_url)).length;
  const pendingRows = rows.filter((row) => Number(row.sale_total || 0) <= 0).length;
  console.log('Yahoo eBay sale enrichment', JSON.stringify({
    parsed_rows: rows.length,
    image_rows: imageRows,
    listing_rows: listingRows,
    pending_amount_rows: pendingRows,
  }));

  const imageRepaired = await repairExistingEbayImages(client, business.base44_id, rows);
  if (imageRepaired > 0) {
    console.log('Yahoo eBay image repair', JSON.stringify({ repaired: imageRepaired }));
  }
  const saved = await insertOrders(client, business.base44_id, rows, 'yahoo_direct_sales');
  await saveYahooConfig(client, business, {
    last_uid: maxUid,
    last_sync_at: new Date().toISOString(),
    last_checked: messages.length,
    last_saved: saved,
    last_error: '',
  });

  console.log('Yahoo sales mailbox scan', JSON.stringify({
    checked: messages.length,
    saved,
    remaining,
    folders_checked: foldersChecked,
    image_repaired: imageRepaired,
  }));
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
        credential_ready: Boolean(config.connected && config.email && config.app_password_enc),
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

    if (action === 'sync_expenses') {
      try {
        const expenses = await syncYahooExpenses(client, business);
        if (!expenses.connected) {
          return res.status(409).json({
            error:'Yahoo is not currently connected to this Art Flow business. Open Account → Yahoo Inbox and reconnect it with a Yahoo app password, then refresh expenses again.',
            code:'YAHOO_RECONNECT',
          });
        }
        return res.status(200).json({
          ok:true,
          expenses,
          message: expenses.imported > 0
            ? `${expenses.imported} Yahoo expense receipt${expenses.imported === 1 ? '' : 's'} added to review.`
            : expenses.remaining > 0
              ? `Yahoo checked ${expenses.checked} expense message${expenses.checked === 1 ? '' : 's'}. More receipts will continue importing automatically.`
              : 'Yahoo expenses are up to date.',
        });
      } catch (error) {
        await saveYahooConfig(client, business, {
          last_expense_error: clean(error?.message || 'Yahoo expense sync failed'),
        }).catch(() => {});
        return res.status(409).json({
          error: clean(error?.message || 'Yahoo expense sync failed'),
          code:'YAHOO_EXPENSE_SYNC_FAILED',
        });
      }
    }

    if (action === 'sync') {
      try {
        const result = await syncYahooMailbox(client, business);
        const expenses = await syncYahooExpenses(client, business);
        console.log('Yahoo sync summary', JSON.stringify({
          yahoo_connected: Boolean(result.connected),
          sales_checked: Number(result.checked || 0),
          sales_saved: Number(result.saved || 0),
          expense_checked: Number(expenses.checked || 0),
          expense_imported: Number(expenses.imported || 0),
          expense_skipped: Number(expenses.skipped || 0),
          expense_remaining: Number(expenses.remaining || 0),
        }));

        if (!result.connected) {
          return res.status(409).json({
            error:'Yahoo is not currently connected to this Art Flow business. Open Account → Yahoo Inbox and reconnect it with a Yahoo app password, then tap Check Yahoo Now.',
            code:'YAHOO_RECONNECT',
            diagnostics: result.diagnostics || null,
          });
        }

        return res.status(200).json({
          ok:true,
          ...result,
          expenses,
          message: [
            result.saved > 0 ? `${result.saved} new eBay sale${result.saved === 1 ? '' : 's'}` : '',
            result.checked > 0 && result.saved === 0 ? `${result.checked} Yahoo message${result.checked === 1 ? '' : 's'} checked; no new eBay sale matched` : '',
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
