import pg from 'pg';
import tls from 'node:tls';
import { pooledDatabaseUrl } from './_db.mjs';
import {
  clean, normalize, session, profile, businessForUser, encrypt, decrypt, parseBody, insertOrders,
} from './_official-sync-shared.mjs';
import { parseSaleEmail } from './_gmail-sales-core.mjs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const YAHOO_HOST = 'imap.mail.yahoo.com';
const YAHOO_PORT = 993;
const MAX_MESSAGES_PER_RUN = 300;

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
      ? 'Yahoo rejected the connection. Use a Yahoo app password, not your normal Yahoo password.'
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

async function yahooMessages(email, appPassword, afterUid=0) {
  const imap = await openImap(email, appPassword);
  try {
    const criteria = afterUid > 0
      ? `UID ${afterUid + 1}:* HEADER FROM "ebay"`
      : 'SINCE 01-Jan-2026 HEADER FROM "ebay"';
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
          email,
          connected:true,
          app_password_enc: encrypt(appPassword),
          connected_at: new Date().toISOString(),
          last_uid: 0,
          last_sync_at: null,
          last_error:'',
        },
      };
      await client.query(
        `UPDATE artflow.businesses SET data=$2::jsonb, updated_date=now() WHERE base44_id=$1`,
        [business.base44_id, JSON.stringify(next)]
      );
      business.data = next;

      const result = await syncYahooMailbox(client, business);
      return res.status(200).json({
        ok:true,
        ...result,
        email,
        message: result.saved > 0
          ? `Yahoo connected. Imported ${result.saved} eBay sale${result.saved === 1 ? '' : 's'}.`
          : 'Yahoo connected. The inbox is now being checked directly for eBay sales.',
      });
    }

    if (action === 'sync') {
      try {
        const result = await syncYahooMailbox(client, business);
        return res.status(200).json({
          ok:true,
          ...result,
          message: result.saved > 0
            ? `Imported ${result.saved} new eBay sale${result.saved === 1 ? '' : 's'} from Yahoo.`
            : result.remaining > 0
              ? 'Yahoo sync is catching up on older eBay messages.'
              : 'Yahoo eBay sales are up to date.',
        });
      } catch (error) {
        await saveYahooConfig(client, business, { last_error: clean(error?.message || 'Yahoo sync failed') }).catch(() => {});
        return res.status(409).json({ error: clean(error?.message || 'Yahoo sync failed'), code:'YAHOO_RECONNECT' });
      }
    }

    if (action === 'disconnect') {
      const next = { ...(business.data || {}) };
      delete next.yahoo_mail;
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
