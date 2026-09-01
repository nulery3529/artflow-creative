import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const HOST = 'https://partnerapi.depop.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const clean = (value = '') => String(value || '').trim();
const normalize = (value = '') => clean(value).toLowerCase();
const money = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function profile(client, user) {
  const email = normalize(user?.email);
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id=$1 OR lower(email)=$2
     ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END
     LIMIT 1`,
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
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,
    business_id text NOT NULL,
    platform text NOT NULL,
    listing_id text,
    title text NOT NULL,
    price numeric DEFAULT 0,
    currency text DEFAULT 'USD',
    image_url text,
    listing_url text NOT NULL,
    status text DEFAULT 'Active',
    last_seen_at timestamptz DEFAULT now(),
    sync_source text,
    data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}

async function depopGet(path, apiKey) {
  const response = await fetch(`${HOST}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(String(payload?.detail || payload?.error || payload?.message || text || `Depop API ${response.status}`).slice(0, 500));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function titleFromProduct(product = {}) {
  const description = clean(product.description);
  const firstLine = description.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/^#/.test(line));
  if (firstLine) return firstLine.slice(0, 300);
  const fallback = [product.brand_name || product.brand, product.product_type].map(clean).filter(Boolean).join(' ');
  return (fallback || `Depop listing ${product.product_id || ''}`).trim().slice(0, 300);
}

function normalizeProduct(product = {}) {
  const slug = clean(product.slug);
  if (!slug) return null;
  const listingId = clean(product.product_id || product.id || slug);
  const picture = Array.isArray(product.pictures) ? product.pictures.find((item) => clean(item?.url)) : null;
  return {
    listingId,
    title: titleFromProduct(product),
    price: money(product.current_price ?? product.discount_price ?? product.price_amount),
    currency: clean(product.price_currency || 'USD') || 'USD',
    imageUrl: clean(picture?.url || ''),
    listingUrl: `https://www.depop.com/products/${encodeURIComponent(slug)}`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = clean(process.env.DEPOP_PARTNER_API_KEY);
  const ownerEmail = normalize(process.env.DEPOP_PARTNER_OWNER_EMAIL);

  if (req.method === 'GET') {
    return res.status(200).json({ configured: Boolean(apiKey && ownerEmail), api_key_set: Boolean(apiKey), owner_set: Boolean(ownerEmail) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  if (!apiKey || !ownerEmail) {
    return res.status(503).json({
      needs_setup: true,
      error: 'Vercel Depop bulk sync is ready, but the Depop Partner API key and owner email still need to be added to Vercel environment variables.',
    });
  }
  if (normalize(session.user.email) !== ownerEmail) return res.status(403).json({ error: 'This Depop Partner connection belongs to a different Art Flow account.' });

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const p = await profile(client, session.user);
    const b = await businessForUser(client, p, session.user);
    if (!b) return res.status(404).json({ error: 'Business workspace not found' });

    const listings = [];
    const seenCursors = new Set();
    let cursor = '';
    let pages = 0;
    let hasMore = true;

    while (hasMore && pages < MAX_PAGES) {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), state: 'selling', sort_by: 'id_desc' });
      if (cursor) params.set('cursor', cursor);
      const payload = await depopGet(`/api/v1/products/?${params.toString()}`, apiKey);
      const products = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.products) ? payload.products : [];
      for (const product of products) {
        const normalized = normalizeProduct(product);
        if (normalized) listings.push(normalized);
      }
      pages += 1;
      const nextCursor = clean(payload?.meta?.cursor || payload?.meta?.next_cursor || payload?.next_cursor || '');
      hasMore = payload?.meta?.has_more === true || Boolean(nextCursor);
      if (!hasMore || !nextCursor || nextCursor === cursor || seenCursors.has(nextCursor)) {
        hasMore = false;
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    if (hasMore) return res.status(502).json({ error: `Depop catalog exceeded the ${MAX_PAGES * PAGE_LIMIT}-listing safety limit. No old listings were removed.` });

    const activeUrls = [];
    for (const listing of listings) {
      const id = crypto.createHash('sha256').update(`${b.base44_id}|Depop|${listing.listingUrl}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
         VALUES ($1,$2,'Depop',$3,$4,$5,$6,$7,$8,'Active',now(),'depop_partner_vercel','{}'::jsonb)
         ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
           listing_id=EXCLUDED.listing_id,
           title=EXCLUDED.title,
           price=EXCLUDED.price,
           currency=EXCLUDED.currency,
           image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
           status='Active',
           last_seen_at=now(),
           sync_source='depop_partner_vercel'`,
        [id, b.base44_id, listing.listingId || null, listing.title, listing.price, listing.currency, listing.imageUrl || null, listing.listingUrl]
      );
      activeUrls.push(listing.listingUrl);
    }

    let deactivated = 0;
    if (activeUrls.length) {
      const result = await client.query(
        `UPDATE artflow.marketplace_listings
         SET status='Inactive',last_seen_at=now(),sync_source='depop_partner_vercel_snapshot'
         WHERE business_id=$1 AND platform='Depop' AND status='Active' AND NOT (listing_url = ANY($2::text[]))`,
        [b.base44_id, activeUrls]
      );
      deactivated = Number(result.rowCount || 0);
    } else {
      const result = await client.query(
        `UPDATE artflow.marketplace_listings
         SET status='Inactive',last_seen_at=now(),sync_source='depop_partner_vercel_snapshot'
         WHERE business_id=$1 AND platform='Depop' AND status='Active'`,
        [b.base44_id]
      );
      deactivated = Number(result.rowCount || 0);
    }

    return res.status(200).json({
      ok: true,
      saved: listings.length,
      deactivated,
      pages,
      message: `${listings.length} active Depop listing${listings.length === 1 ? '' : 's'} synced to Gallery${deactivated ? ` · ${deactivated} old listing${deactivated === 1 ? '' : 's'} removed` : ''}.`,
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'Depop rejected the Partner credential or it does not have products_read access for this shop.' });
    }
    console.error('Depop bulk sync failed', error?.message || error);
    return res.status(500).json({ error: 'Depop bulk listing sync failed' });
  } finally {
    client.release();
  }
}
