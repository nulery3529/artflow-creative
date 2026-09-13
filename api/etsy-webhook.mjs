import pg from 'pg';
import crypto from 'node:crypto';
import { pooledDatabaseUrl } from './_db.mjs';
import { clean, decrypt, encrypt, businessForUser, insertOrders, sizeFromTitle } from './_official-sync-shared.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });
export const config = { api: { bodyParser: false } };
const API_BASE = 'https://openapi.etsy.com/v3/application';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function ensureTables(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.app_settings (
    key text PRIMARY KEY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.etsy_webhook_events (
    webhook_id text PRIMARY KEY,
    shop_id text NOT NULL,
    auth_user_id text,
    event_type text NOT NULL,
    resource_url text,
    webhook_timestamp bigint,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processing_status text NOT NULL DEFAULT 'received',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS etsy_webhook_events_shop_idx ON artflow.etsy_webhook_events (shop_id, received_at DESC)`);
}

async function webhookSecret(client) {
  const r = await client.query(`SELECT data FROM artflow.app_settings WHERE key='etsy_webhook_signing_secret' LIMIT 1`);
  const stored = r.rows[0]?.data || {};
  try {
    if (stored.secret_enc) return clean(decrypt(stored.secret_enc));
  } catch {}
  return clean(process.env.ETSY_WEBHOOK_SIGNING_SECRET || process.env.ETSY_WEBHOOK_SECRET);
}

function signatureCandidates(header = '') {
  const out = new Set();
  for (const token of clean(header).split(/\s+/).filter(Boolean)) {
    out.add(token);
    const parts = token.split(',').map((v) => v.trim()).filter(Boolean);
    if (parts.length > 1) out.add(parts[parts.length - 1]);
  }
  return [...out];
}

function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifySignature(raw, webhookId, timestamp, signatureHeader, secret) {
  if (!raw?.length || !webhookId || !timestamp || !signatureHeader || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const encoded = clean(secret).startsWith('whsec_') ? clean(secret).slice(6) : clean(secret);
  let key;
  try { key = Buffer.from(encoded, 'base64'); } catch { return false; }
  if (!key.length) return false;
  const signed = Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`, 'utf8'), raw]);
  const expected = crypto.createHmac('sha256', key).update(signed).digest('base64');
  return signatureCandidates(signatureHeader).some((candidate) => safeEqualText(candidate, expected));
}

async function etsyCredentials(client) {
  const r = await client.query(`SELECT data FROM artflow.app_settings WHERE key='etsy_credentials' LIMIT 1`);
  const stored = r.rows[0]?.data || {};
  const storedKey = clean(stored.keystring || stored.key);
  let storedSecret = '';
  try { if (stored.shared_secret_enc) storedSecret = clean(decrypt(stored.shared_secret_enc)); } catch {}
  if (storedKey && storedSecret) return { key: storedKey, secret: storedSecret };
  return {
    key: clean(process.env.ETSY_API_KEY || process.env.ETSY_KEYSTRING),
    secret: clean(process.env.ETSY_SHARED_SECRET || process.env.ETSY_CLIENT_SECRET),
  };
}

async function etsyToken(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const text = await r.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(clean(data?.error || data?.error_description || text || `Etsy token request failed (${r.status})`));
  return data;
}

async function saveUserOAuth(client, p, patch) {
  const oauth = { ...(p.data?.etsy_oauth || {}), ...patch, updated_at: new Date().toISOString() };
  const next = { ...(p.data || {}), etsy_oauth: oauth };
  await client.query(`UPDATE artflow.legacy_users SET data=$2::jsonb,updated_date=now() WHERE base44_id=$1`, [p.base44_id, JSON.stringify(next)]);
  p.data = next;
}

async function validAccessToken(client, p, creds) {
  const oauth = p.data?.etsy_oauth || {};
  if (!oauth.refresh_token_enc) throw new Error('Etsy user connection is missing a refresh token');
  const expiresAt = oauth.expires_at ? new Date(oauth.expires_at).getTime() : 0;
  if (oauth.access_token_enc && expiresAt > Date.now() + 60_000) return decrypt(oauth.access_token_enc);
  const refreshed = await etsyToken({ grant_type: 'refresh_token', client_id: creds.key, refresh_token: decrypt(oauth.refresh_token_enc) });
  const expiresAtIso = new Date(Date.now() + (Number(refreshed.expires_in) || 3600) * 1000).toISOString();
  await saveUserOAuth(client, p, {
    access_token_enc: refreshed.access_token ? encrypt(refreshed.access_token) : oauth.access_token_enc,
    refresh_token_enc: refreshed.refresh_token ? encrypt(refreshed.refresh_token) : oauth.refresh_token_enc,
    expires_at: expiresAtIso,
  });
  return refreshed.access_token;
}

async function fetchResource(resourceUrl, accessToken, creds, shopId) {
  const u = new URL(resourceUrl);
  if (u.protocol !== 'https:' || !['api.etsy.com', 'openapi.etsy.com'].includes(u.hostname)) throw new Error('Invalid Etsy webhook resource URL');
  const expectedPrefix = `/v3/application/shops/${String(shopId)}/receipts/`;
  if (!u.pathname.startsWith(expectedPrefix)) throw new Error('Etsy webhook resource does not match the connected shop');
  const apiPath = `${u.pathname.replace(/^\/v3\/application/, '')}${u.search}`;
  const r = await fetch(`${API_BASE}${apiPath}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': `${creds.key}:${creds.secret}`, Accept: 'application/json' },
  });
  const text = await r.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(clean(data?.error || data?.error_description || text || `Etsy API ${r.status}`));
  return data;
}

function moneyValue(value) {
  if (value && typeof value === 'object') {
    const amount = Number(value.amount || 0);
    const divisor = Number(value.divisor || 100) || 100;
    return Number((amount / divisor).toFixed(2));
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function transactionIds(receipt = {}) {
  const values = (Array.isArray(receipt?.transactions) ? receipt.transactions : []).map((t) => clean(t?.transaction_id)).filter(Boolean);
  const receiptId = clean(receipt?.receipt_id);
  if (receiptId) values.push(receiptId);
  return [...new Set(values)];
}

function rowsFromReceipt(receipt = {}) {
  const fallbackTitle = `Etsy order ${clean(receipt?.receipt_id)}`;
  const transactions = Array.isArray(receipt?.transactions) && receipt.transactions.length
    ? receipt.transactions
    : [{ title: fallbackTitle, transaction_id: receipt?.receipt_id, quantity: 1, price: receipt?.grandtotal }];
  const saleDate = Number(receipt?.create_timestamp || receipt?.creation_tsz) * 1000 || new Date().toISOString();
  const rows = [];
  for (const t of transactions) {
    const qty = Math.max(1, Number(t?.quantity) || 1);
    const unitPrice = moneyValue(t?.price);
    const total = Number((unitPrice * qty).toFixed(2));
    if (!(total > 0)) continue;
    const title = clean(t?.title) || fallbackTitle;
    rows.push({ platform: 'Etsy', product_name: title, quantity: qty, size: sizeFromTitle(title), unit_price: unitPrice, sale_total: total, buyer: clean(receipt?.name || receipt?.buyer_user_id), order_id: clean(t?.transaction_id || receipt?.receipt_id), sale_date: saleDate });
  }
  return rows;
}

async function updateOrderState(client, businessId, receipt, eventType) {
  if (!businessId) return 0;
  const ids = transactionIds(receipt);
  if (!ids.length) return 0;
  const state = eventType.split('.')[1] || eventType;
  if (eventType === 'order.canceled') {
    const r = await client.query(`UPDATE artflow.orders SET archived=true,updated_date=now(),sync_source='etsy_webhook_canceled',data=COALESCE(data,'{}'::jsonb)||$3::jsonb WHERE business_id=$1 AND platform='Etsy' AND order_id=ANY($2::text[])`, [businessId, ids, JSON.stringify({ etsy_order_status: state, etsy_webhook: true })]);
    return Number(r.rowCount || 0);
  }
  const r = await client.query(`UPDATE artflow.orders SET updated_date=now(),sync_source=$3,data=COALESCE(data,'{}'::jsonb)||$4::jsonb WHERE business_id=$1 AND platform='Etsy' AND order_id=ANY($2::text[])`, [businessId, ids, `etsy_webhook_${state}`, JSON.stringify({ etsy_order_status: state, etsy_webhook: true })]);
  return Number(r.rowCount || 0);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'Etsy webhook receiver' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(501).json({ error: 'Webhook receiver setup is still being deployed' });
}
