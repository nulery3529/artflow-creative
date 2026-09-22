import pg from 'pg';
import crypto from 'node:crypto';
import { pooledDatabaseUrl } from './_db.mjs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const ENDPOINT = 'https://artflowcreative.com/api/ebay-account-deletion';
const clean = (value = '') => String(value || '').trim();

async function complianceSettings(client) {
  const result = await client.query(
    `SELECT data
       FROM artflow.app_settings
      WHERE key='ebay_account_deletion_compliance'
      LIMIT 1`
  );
  const data = result.rows[0]?.data || {};
  return {
    verificationToken: clean(data.verification_token),
    endpoint: clean(data.endpoint || ENDPOINT) || ENDPOINT,
  };
}

async function ebayApplicationToken() {
  const clientId = clean(process.env.EBAY_CLIENT_ID);
  const clientSecret = clean(process.env.EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error('eBay production credentials are not configured');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(clean(data?.error_description || data?.error || `eBay token request failed (${response.status})`));
  }
  return data.access_token;
}

function signatureHeader(value = '') {
  try {
    return JSON.parse(Buffer.from(clean(value), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function pemKey(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  if (/-----BEGIN PUBLIC KEY-----/.test(raw)) {
    return raw
      .replace(/-----BEGIN PUBLIC KEY-----\s*/i, '-----BEGIN PUBLIC KEY-----\n')
      .replace(/\s*-----END PUBLIC KEY-----/i, '\n-----END PUBLIC KEY-----');
  }
  return raw;
}

async function verifyEbaySignature(message, encodedSignature) {
  const header = signatureHeader(encodedSignature);
  const keyId = clean(header?.kid);
  const signature = clean(header?.signature);
  if (!keyId || !signature) return false;

  const accessToken = await ebayApplicationToken();
  const response = await fetch(
    `https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.key) return false;

  const body = JSON.stringify(message);
  const publicKey = pemKey(payload.key);
  for (const algorithm of ['SHA256', 'sha1', 'ssl3-sha1']) {
    try {
      const verifier = crypto.createVerify(algorithm);
      verifier.update(body);
      verifier.end();
      if (verifier.verify(publicKey, signature, 'base64')) return true;
    } catch {}
  }
  return false;
}

async function ensureAuditTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.ebay_account_deletion_audit (
    notification_id text PRIMARY KEY,
    event_date timestamptz,
    received_at timestamptz DEFAULT now(),
    subject_hash text,
    matched_orders integer DEFAULT 0,
    signature_verified boolean DEFAULT false
  )`);
}

async function anonymizeEbayUser(client, message) {
  const data = message?.notification?.data || {};
  const username = clean(data.username);
  const userId = clean(data.userId);
  const eiasToken = clean(data.eiasToken);
  const identifiers = [username, userId, eiasToken].filter(Boolean);
  if (!identifiers.length) return 0;

  const lowered = identifiers.map((value) => value.toLowerCase());
  const result = await client.query(
    `UPDATE artflow.orders
        SET buyer=NULL,
            data=COALESCE(data,'{}'::jsonb)
              - 'buyer'
              - 'buyer_username'
              - 'buyer_email'
              - 'shipping_address'
              - 'shipping_name'
              - 'recipient'
              - 'username'
              - 'userId'
              - 'eiasToken',
            updated_date=now()
      WHERE lower(COALESCE(platform,''))='ebay'
        AND (
          lower(COALESCE(buyer,'')) = ANY($1::text[])
          OR lower(COALESCE(data->>'buyer','')) = ANY($1::text[])
          OR lower(COALESCE(data->>'buyer_username','')) = ANY($1::text[])
          OR lower(COALESCE(data->>'username','')) = ANY($1::text[])
          OR lower(COALESCE(data->>'userId','')) = ANY($1::text[])
          OR lower(COALESCE(data->>'eiasToken','')) = ANY($1::text[])
        )`,
    [lowered]
  );
  return Number(result.rowCount || 0);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const client = await pool.connect();

  try {
    const settings = await complianceSettings(client);
    if (!settings.verificationToken) {
      return res.status(503).json({ error: 'eBay compliance verification token is not configured' });
    }

    if (req.method === 'GET') {
      const challengeCode = clean(req.query?.challenge_code);
      if (!challengeCode) return res.status(400).json({ error: 'challenge_code is required' });

      const challengeResponse = crypto
        .createHash('sha256')
        .update(challengeCode)
        .update(settings.verificationToken)
        .update(settings.endpoint)
        .digest('hex');

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ challengeResponse });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const message = req.body && typeof req.body === 'object' ? req.body : {};
    if (message?.metadata?.topic !== 'MARKETPLACE_ACCOUNT_DELETION' || !message?.notification?.notificationId) {
      return res.status(400).json({ error: 'Unsupported eBay notification' });
    }

    const signature = clean(req.headers['x-ebay-signature']);
    if (!signature) return res.status(412).end();

    let verified = false;
    try {
      verified = await verifyEbaySignature(message, signature);
    } catch (error) {
      console.warn('eBay deletion signature verification unavailable', error?.message || error);
      return res.status(503).end();
    }
    if (!verified) return res.status(412).end();

    await ensureAuditTable(client);
    const matchedOrders = await anonymizeEbayUser(client, message);
    const data = message.notification.data || {};
    const subjectHash = crypto
      .createHash('sha256')
      .update([clean(data.username), clean(data.userId), clean(data.eiasToken)].join('|'))
      .digest('hex');

    await client.query(
      `INSERT INTO artflow.ebay_account_deletion_audit
         (notification_id,event_date,received_at,subject_hash,matched_orders,signature_verified)
       VALUES ($1,$2,now(),$3,$4,true)
       ON CONFLICT (notification_id) DO UPDATE SET
         received_at=now(),
         matched_orders=EXCLUDED.matched_orders,
         signature_verified=true`,
      [
        clean(message.notification.notificationId),
        clean(message.notification.eventDate) || null,
        subjectHash,
        matchedOrders,
      ]
    );

    return res.status(204).end();
  } catch (error) {
    console.error('eBay account deletion endpoint failed', error?.message || error);
    return res.status(500).json({ error: 'eBay account deletion endpoint failed' });
  } finally {
    client.release();
  }
}
