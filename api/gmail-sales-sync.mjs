import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const clean = (value = '') => String(value ?? '').replace(/\r/g, '').trim();
const normalize = (value = '') => clean(value).toLowerCase();

function addressOnly(value = '') {
  const text = normalize(value);
  const angle = text.match(/<([^>]+)>/);
  return clean(angle?.[1] || text).replace(/^mailto:/, '');
}

function isAllowedMarketplaceSender(value = '') {
  const email = addressOnly(value);
  return [
    '@vinted.com',
    '@poshmark.com',
    '@alerts.depop.com',
    '@ohhey.depop.com',
  ].some((suffix) => email.endsWith(suffix));
}

function htmlToText(value = '') {
  return clean(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function localDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Indiana/Indianapolis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function sizeFromTitle(title = '') {
  const match = clean(title).match(/\b(\d{1,2}(?:\.\d+)?)\s*[x×]\s*(\d{1,2}(?:\.\d+)?)\b/i);
  return match ? `${match[1]}x${match[2]}` : 'Other';
}

function costsFor(title = '', quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  if (/\bbundle\b/i.test(title) || qty > 1) {
    const total = Number((qty * 1.59 + 0.40).toFixed(2));
    return { base_item_cost: total, paper_ink_cost: 0, packaging_cost: 0, total_cost: total };
  }

  const size = sizeFromTitle(title);
  const baseBySize = {
    '4x4': 1.00,
    '4x6': 1.25,
    '5x7': 1.50,
    '8x8': 2.00,
    '8x10': 2.00,
    '11x14': 3.00,
  };
  const base = baseBySize[size] ?? 0;
  if (!base) return { base_item_cost: 0, paper_ink_cost: 0, packaging_cost: 0, total_cost: 0 };
  const paper = 0.09;
  const packaging = size === '11x14' ? 2.00 : 0.40;
  return {
    base_item_cost: base,
    paper_ink_cost: paper,
    packaging_cost: packaging,
    total_cost: Number((base + paper + packaging).toFixed(2)),
  };
}

function vintedRows(subject, text) {
  if (!/you sold an item on vinted/i.test(subject)) return [];
  const match = text.match(/Hello\s+[^,\n]+,\s*([\w.-]+)\s+has bought\s+([\s\S]*?)\s+\$([\d,.]+)/i);
  if (!match) return [];
  let rawTitle = clean(match[2]).replace(/\s+/g, ' ');
  const price = Number(match[3].replace(/,/g, '')) || 0;
  let quantity = 1;
  const bundle = rawTitle.match(/^(\d+)\s+Bundle\s+(\d+)\s+items?/i) || rawTitle.match(/^Bundle\s+(\d+)\s+items?/i);
  if (bundle) {
    quantity = Number(bundle[1] || bundle[2]) || 1;
    rawTitle = `Bundle of ${quantity} items`;
  }
  return [{
    platform: 'Vinted',
    product_name: rawTitle,
    quantity,
    size: bundle ? 'Other' : sizeFromTitle(rawTitle),
    sale_total: price,
    unit_price: quantity > 1 ? Number((price / quantity).toFixed(2)) : price,
    buyer: clean(match[1]),
    order_id: null,
  }];
}

function poshmarkRows(subject, text) {
  const normalizedSubject = clean(subject).replace(/^(?:(?:fwd?|fw):\s*)+/i, '');
  const subjectMatch = normalizedSubject.match(/^"([\s\S]+?)"\s+just sold to\s+@([^\s!]+)\s+on Poshmark!/i);
  if (!subjectMatch) return [];
  const title = clean(subjectMatch[1]);
  const buyer = clean(subjectMatch[2]);
  const orderId = clean(text.match(/Order ID\s*\n\s*([a-z0-9]+)/i)?.[1] || '');
  const itemBlock = text.match(/Item\s*\n\s*Price\s*\n([\s\S]*?)(?:Your Earnings|Sales tax|Packaging Reminder)/i)?.[1] || '';
  const price = Number((itemBlock.match(/\$([\d,.]+)/)?.[1] || '').replace(/,/g, '')) || 0;
  return [{
    platform: 'Poshmark',
    product_name: title,
    quantity: 1,
    size: sizeFromTitle(title),
    sale_total: price,
    unit_price: price,
    buyer,
    order_id: orderId || null,
  }];
}

function depopRows(subject, text) {
  if (!/sale confirmation for\s+@/i.test(subject) || !/you've made a sale!/i.test(text)) return [];
  const buyer = clean(subject.match(/sale confirmation for\s+@([^\.\s]+)/i)?.[1] || '');
  const block = text.match(/Order details\s*\n([\s\S]*?)\n\s*Ship to\b/i)?.[1] || '';
  if (!block) return [];
  const lines = block.split('\n').map(clean).filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (/^\$[\d,.]+$/.test(lines[i + 1]) && !/^\$/.test(lines[i])) {
      const title = lines[i];
      const price = Number(lines[i + 1].slice(1).replace(/,/g, '')) || 0;
      if (!title || !price) continue;
      rows.push({
        platform: 'Depop',
        product_name: title,
        quantity: 1,
        size: sizeFromTitle(title),
        sale_total: price,
        unit_price: price,
        buyer,
        order_id: null,
      });
      i += 1;
    }
  }
  return rows;
}

export function parseSaleEmail(from, subject, text) {
  const email = addressOnly(from);
  if (email.endsWith('@vinted.com')) return vintedRows(subject, text);
  if (email.endsWith('@poshmark.com')) return poshmarkRows(subject, text);
  if (email.endsWith('@alerts.depop.com') || email.endsWith('@ohhey.depop.com')) return depopRows(subject, text);
  return [];
}

function decodeBase64Url(value = '') {
  if (!value) return '';
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function bodyTextFromPayload(payload = {}) {
  const plain = [];
  const html = [];
  const walk = (part) => {
    if (!part || typeof part !== 'object') return;
    const mime = String(part.mimeType || '').toLowerCase();
    const data = part?.body?.data;
    if (data && mime === 'text/plain') plain.push(decodeBase64Url(data));
    else if (data && mime === 'text/html') html.push(decodeBase64Url(data));
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  if (plain.length) return clean(plain.join('\n'));
  if (html.length) return htmlToText(html.join('\n'));
  const fallback = decodeBase64Url(payload?.body?.data || '');
  return payload?.mimeType === 'text/html' ? htmlToText(fallback) : clean(fallback);
}

function headerValue(message, name) {
  const headers = message?.payload?.headers || [];
  return clean(headers.find((header) => String(header?.name || '').toLowerCase() === name.toLowerCase())?.value || '');
}

async function getLegacyProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
       WHERE auth_user_id = $1 OR lower(email) = $2
       ORDER BY CASE WHEN active_business_id IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END, created_date NULLS LAST
       LIMIT 1`,
    [user.id, email]
  );
  return result.rows[0] || null;
}

async function getBusiness(client, profile, user) {
  const email = normalize(user?.email);
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const accessible = result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    const data = row.data || {};
    const emails = [
      row.primary_email,
      data.primary_email,
      ...(Array.isArray(data.member_emails) ? data.member_emails : []),
      ...(Array.isArray(data.sales_emails) ? data.sales_emails : []),
    ].map(normalize).filter(Boolean);
    return email && emails.includes(email);
  });
  return accessible.find((row) => row.base44_id === active) || accessible[0] || null;
}

function approvedSalesEmails(business = {}) {
  const data = business?.data || {};
  return new Set([
    business.primary_email,
    data.primary_email,
    ...(Array.isArray(data.sales_emails) ? data.sales_emails : []),
  ].map(normalize).filter(Boolean));
}

async function googleJson(accessToken, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Google Gmail request failed (${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function accessTokenForAccount(req, accountId) {
  const headers = fromNodeHeaders(req.headers);
  const token = await auth.api.getAccessToken({ headers, body: { accountId } });
  if (!token?.accessToken) {
    const error = new Error('Reconnect Google in Account to resume Gmail sales sync.');
    error.code = 'GMAIL_RECONNECT';
    throw error;
  }
  return token.accessToken;
}

const GMAIL_QUERIES = [
  'newer_than:7d from:no-reply@vinted.com subject:"You sold an item on Vinted"',
  'newer_than:7d from:orders@poshmark.com "just sold to" "on Poshmark"',
  'newer_than:7d {from:alerts.depop.com from:ohhey.depop.com} subject:"Sale confirmation for"',
];

async function listMessageIds(accessToken) {
  const ids = new Set();
  for (const query of GMAIL_QUERIES) {
    let pageToken = '';
    for (let page = 0; page < 5; page += 1) {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await googleJson(accessToken, url);
      for (const message of data?.messages || []) if (message?.id) ids.add(message.id);
      pageToken = clean(data?.nextPageToken || '');
      if (!pageToken) break;
    }
  }
  return [...ids];
}

async function readMessage(accessToken, messageId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set('format', 'full');
  return googleJson(accessToken, url);
}

async function insertRows(client, businessId, messageId, receivedAt, rows) {
  const createdBy = (await client.query(
    `SELECT created_by_id FROM artflow.orders WHERE business_id=$1 AND created_by_id IS NOT NULL ORDER BY created_date DESC LIMIT 1`,
    [businessId]
  )).rows[0]?.created_by_id || null;

  const inserted = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const sourceEmailId = rows.length > 1 ? `${messageId}:${index + 1}` : messageId;
    const costs = costsFor(row.product_name, row.quantity);
    const profit = Number((Number(row.sale_total || 0) - Number(costs.total_cost || 0)).toFixed(2));
    const result = await client.query(`
      INSERT INTO artflow.orders (
        base44_id,business_id,sale_date,platform,archived,order_id,source_email_id,created_by_id,created_date,updated_date,data,
        product_name,quantity,size,unit_price,sale_total,buyer,base_item_cost,paper_ink_cost,packaging_cost,total_cost,estimated_profit,sync_source
      )
      SELECT gen_random_uuid()::text,$1,$2,$3,false,$4,$5,$6,now(),now(),$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'gmail_direct_sales'
      WHERE NOT EXISTS (
        SELECT 1 FROM artflow.orders
        WHERE business_id=$1 AND (
          source_email_id=$5 OR
          ($4 IS NOT NULL AND $4<>'' AND order_id=$4 AND platform=$3) OR
          (platform=$3 AND lower(product_name)=lower($8) AND sale_date=$2 AND abs(COALESCE(sale_total,0)-$12)<0.01)
        )
      )
      RETURNING base44_id,product_name,platform,sale_total
    `, [
      businessId,
      localDate(receivedAt),
      row.platform,
      row.order_id,
      sourceEmailId,
      createdBy,
      JSON.stringify({ source: 'gmail_direct_sales', gmail_message_id: messageId }),
      row.product_name,
      row.quantity,
      row.size,
      row.unit_price,
      row.sale_total,
      row.buyer,
      costs.base_item_cost,
      costs.paper_ink_cost,
      costs.packaging_cost,
      costs.total_cost,
      profit,
    ]);
    if (result.rows[0]) inserted.push(result.rows[0]);
  }
  return inserted;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const profile = await getLegacyProfile(client, session.user);
    const business = await getBusiness(client, profile, session.user);
    if (!business?.base44_id) return res.status(400).json({ error: 'No Art Flow business workspace was found.' });

    const accounts = await auth.api.listUserAccounts({ headers: fromNodeHeaders(req.headers) });
    const googleAccounts = (accounts || []).filter((account) => account.providerId === 'google' && account.id);
    if (!googleAccounts.length) {
      return res.status(409).json({ error: 'Connect Google in Account to turn on automatic Gmail sales sync.', code: 'GMAIL_NOT_LINKED' });
    }

    const allowedEmails = approvedSalesEmails(business);
    let matchedAccounts = 0;
    let permissionErrors = 0;
    let scanned = 0;
    let parsed = 0;
    let imported = 0;

    for (const account of googleAccounts) {
      let accessToken;
      try {
        accessToken = await accessTokenForAccount(req, account.id);
        const profileData = await googleJson(accessToken, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
        const gmailAddress = normalize(profileData?.emailAddress || '');
        if (!gmailAddress || !allowedEmails.has(gmailAddress)) continue;
        matchedAccounts += 1;

        const messageIds = await listMessageIds(accessToken);
        scanned += messageIds.length;
        for (const messageId of messageIds) {
          const message = await readMessage(accessToken, messageId);
          const from = headerValue(message, 'From');
          if (!isAllowedMarketplaceSender(from)) continue;
          const subject = headerValue(message, 'Subject');
          const text = bodyTextFromPayload(message?.payload || {});
          const rows = parseSaleEmail(from, subject, text);
          if (!rows.length) continue;
          parsed += rows.length;
          const receivedAt = Number(message?.internalDate)
            ? new Date(Number(message.internalDate)).toISOString()
            : headerValue(message, 'Date') || new Date().toISOString();
          const saved = await insertRows(client, business.base44_id, messageId, receivedAt, rows);
          imported += saved.length;
        }
      } catch (error) {
        if (error?.status === 401 || error?.status === 403 || error?.code === 'GMAIL_RECONNECT') {
          permissionErrors += 1;
          continue;
        }
        console.warn('Gmail sales sync account failed', error?.message || error);
      }
    }

    if (!matchedAccounts && permissionErrors) {
      return res.status(409).json({
        error: 'Reconnect Google in Account so Art Flow can read marketplace sale emails.',
        code: 'GMAIL_RECONNECT',
      });
    }
    if (!matchedAccounts) {
      return res.status(409).json({
        error: 'The connected Google account is not listed as a sales email for this business.',
        code: 'GMAIL_NOT_APPROVED',
      });
    }

    return res.status(200).json({
      ok: true,
      accounts: matchedAccounts,
      scanned,
      parsed,
      imported,
      message: imported > 0
        ? `Imported ${imported} new sale${imported === 1 ? '' : 's'} from Gmail.`
        : 'Gmail sales are up to date.',
    });
  } catch (error) {
    console.error('gmail sales sync error', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Could not sync Gmail sales.', code: 'GMAIL_SYNC_ERROR' });
  } finally {
    client.release();
  }
}
