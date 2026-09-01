import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const HOST = 'https://partnerapi.depop.com';
const WEBHOOK_URL = 'https://artflowcreative.com/api/depop-webhook';
const EVENT_TYPES = ['v1:order.*', 'v1:product.update'];

const clean = (value = '') => String(value ?? '').trim();
const normalize = (value = '') => clean(value).toLowerCase();

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function profile(client, user) {
  const email = normalize(user?.email);
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`,
    [user.id, email]
  );
  return result.rows[0] || null;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [row?.primary_email, d.primary_email, ...(d.member_emails || []), ...(d.sales_emails || []), ...(d.expense_emails || [])]
    .map(normalize)
    .filter(Boolean);
}

async function businessForUser(client, p, user) {
  const active = p?.active_business_id || p?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const result = await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow = result.rows.find((row) => active && row.base44_id === active) || null;
  const emailRows = result.rows.filter((row) => email && businessEmails(row).includes(email));
  const isPlaceholder = (row) => {
    if (!row) return false;
    const d = row.data || {};
    return businessEmails(row).length === 0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name || '').trim());
  };
  const canonical = emailRows.find((row) => {
    const d = row.data || {};
    return Boolean(d.spreadsheet_id || d.spreadsheetId || (Array.isArray(d.tracked_marketplaces) && d.tracked_marketplaces.length));
  }) || emailRows[0] || null;
  return isPlaceholder(activeRow) && canonical ? canonical : (activeRow || canonical || null);
}

async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.depop_webhook_configs (
    business_id text PRIMARY KEY,
    webhook_id text NOT NULL,
    secret text NOT NULL,
    url text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    event_types jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function depopRequest(path, apiKey, { method = 'GET', body } = {}) {
  const response = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(clean(data?.detail || data?.error || data?.message || text || `Depop API ${response.status}`).slice(0, 500));
    error.status = response.status;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = clean(process.env.DEPOP_PARTNER_API_KEY);
  const ownerEmail = normalize(process.env.DEPOP_PARTNER_OWNER_EMAIL);
  if (!apiKey || !ownerEmail) {
    return res.status(503).json({
      connected: false,
      needs_setup: true,
      api_key_set: Boolean(apiKey),
      owner_set: Boolean(ownerEmail),
      error: 'Depop webhooks are built on Vercel, but Depop still needs to issue the Partner API credential before Art Flow can register the webhook.',
    });
  }
  if (normalize(session.user.email) !== ownerEmail) return res.status(403).json({ error: 'This Depop Partner connection belongs to a different Art Flow account.' });

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const p = await profile(client, session.user);
    const business = await businessForUser(client, p, session.user);
    if (!business) return res.status(404).json({ error: 'Business workspace not found' });

    const local = await client.query(`SELECT business_id,webhook_id,url,enabled,event_types FROM artflow.depop_webhook_configs WHERE business_id=$1 LIMIT 1`, [business.base44_id]);
    if (req.method === 'GET') {
      return res.status(200).json({
        connected: Boolean(local.rows[0]?.enabled),
        webhook_id: local.rows[0]?.webhook_id || null,
        url: local.rows[0]?.url || WEBHOOK_URL,
        event_types: local.rows[0]?.event_types || EVENT_TYPES,
      });
    }

    const remote = await depopRequest('/api/v1/webhooks/', apiKey);
    const remoteEntries = Object.entries(remote || {}).map(([id, value]) => ({ id, ...(value || {}) }));
    let currentRemote = remoteEntries.find((item) => clean(item.url).replace(/\/$/, '') === WEBHOOK_URL.replace(/\/$/, '')) || null;
    const stored = local.rows[0] || null;

    // If Depop already has this URL but Art Flow does not have the one-time secret,
    // recreate only this configuration so we can securely verify signatures.
    if (currentRemote && (!stored || stored.webhook_id !== currentRemote.id)) {
      await depopRequest(`/api/v1/webhooks/${encodeURIComponent(currentRemote.id)}/`, apiKey, { method: 'DELETE' });
      currentRemote = null;
    }

    if (currentRemote && stored) {
      await depopRequest(`/api/v1/webhooks/${encodeURIComponent(currentRemote.id)}/`, apiKey, {
        method: 'PATCH',
        body: { enabled: true, event_types: EVENT_TYPES },
      });
      await client.query(`UPDATE artflow.depop_webhook_configs SET enabled=true,event_types=$2::jsonb,url=$3,updated_at=now() WHERE business_id=$1`, [business.base44_id, JSON.stringify(EVENT_TYPES), WEBHOOK_URL]);
      return res.status(200).json({ connected: true, webhook_id: currentRemote.id, url: WEBHOOK_URL, event_types: EVENT_TYPES, message: 'Depop webhooks are connected and listening for listing, sale, refund, and order updates.' });
    }

    const created = await depopRequest('/api/v1/webhooks/', apiKey, {
      method: 'POST',
      body: { url: WEBHOOK_URL, enabled: true, event_types: EVENT_TYPES },
    });
    const webhookId = clean(created?.webhook_id);
    const secret = clean(created?.secret);
    if (!webhookId || !secret) throw new Error('Depop did not return a webhook ID and signing secret.');

    await client.query(
      `INSERT INTO artflow.depop_webhook_configs (business_id,webhook_id,secret,url,enabled,event_types,updated_at)
       VALUES ($1,$2,$3,$4,true,$5::jsonb,now())
       ON CONFLICT (business_id) DO UPDATE SET webhook_id=EXCLUDED.webhook_id,secret=EXCLUDED.secret,url=EXCLUDED.url,enabled=true,event_types=EXCLUDED.event_types,updated_at=now()`,
      [business.base44_id, webhookId, secret, WEBHOOK_URL, JSON.stringify(EVENT_TYPES)]
    );

    return res.status(200).json({ connected: true, webhook_id: webhookId, url: WEBHOOK_URL, event_types: EVENT_TYPES, message: 'Depop webhooks are connected and listening for listing, sale, refund, and order updates.' });
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401 || status === 403) return res.status(502).json({ error: 'Depop rejected the Partner API credential or webhook access is not enabled for this account.' });
    console.error('Depop webhook setup failed', error?.message || error);
    return res.status(500).json({ error: clean(error?.message || 'Depop webhook setup failed') });
  } finally {
    client.release();
  }
}
