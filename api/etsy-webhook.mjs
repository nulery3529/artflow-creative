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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'Etsy webhook receiver' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(501).json({ error: 'Webhook receiver setup is still being deployed' });
}
