import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const SCRAPER_ID = 'b3450aa3-6a34-4cb8-8534-1b7a4d240553';
const PARSE_URL = `https://api.parse.bot/scraper/${SCRAPER_ID}/get_user_profile`;
const PER_PAGE = 96;
const MAX_LISTINGS = 500;
const MAX_PAGES = Math.ceil(MAX_LISTINGS / PER_PAGE);
const clean = (v = '') => String(v ?? '').trim();
const normalize = (v = '') => clean(v).toLowerCase();

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function profile(client, user) {
  const email = normalize(user?.email);
  const r = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id=$1 OR lower(email)=$2
     ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [user.id, email],
  );
  return r.rows[0] || null;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [
    row?.primary_email,
    d.primary_email,
    ...(d.member_emails || []),
    ...(d.sales_emails || []),
    ...(d.expense_emails || []),
  ].map(normalize).filter(Boolean);
}

async function businessForUser(client, p, user) {
  const active = p?.active_business_id || p?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const r = await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow = r.rows.find((x) => active && x.base44_id === active) || null;
  const emailRows = r.rows.filter((x) => email && businessEmails(x).includes(email));
  const placeholder = (row) => {
    if (!row) return false;
    const d = row.data || {};
    return businessEmails(row).length === 0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name || '').trim());
  };
  const canonical = emailRows.find((row) => {
    const d = row.data || {};
    return Boolean(d.spreadsheet_id || d.spreadsheetId || (Array.isArray(d.tracked_marketplaces) && d.tracked_marketplaces.length));
  }) || emailRows[0] || null;
  return placeholder(activeRow) && canonical ? canonical : (activeRow || canonical || null);
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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}

function parseProfile(value = '') {
  const raw = clean(value);
  if (!raw) return { raw: '', user: '' };
  if (!/^https?:\/\//i.test(raw)) return { raw, user: raw.replace(/^@/, '').trim() };
  try {
    const u = new URL(raw);
    if (!/vinted\.com$/i.test(u.hostname.replace(/^www\./, ''))) return { raw, user: raw };
    return { raw, user: u.toString() };
  } catch {
    return { raw, user: raw };
  }
}

function num(value) {
  if (value && typeof value === 'object') {
    return num(value.amount ?? value.value ?? value.price ?? value.total ?? 0);
  }
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeListing(item = {}) {
  if (!item || typeof item !== 'object') return null;
  if (item.is_closed === true || item.closed === true || item.sold === true) return null;
  const id = clean(item.id || item.item_id || item.itemId || item.listing_id || item.listingId);
  let listingUrl = clean(item.url || item.web_url || item.webUrl || item.item_url || item.itemUrl || item.listing_url || item.listingUrl);
  if (listingUrl && listingUrl.startsWith('/')) listingUrl = `https://www.vinted.com${listingUrl}`;
  if (!listingUrl && id) listingUrl = `https://www.vinted.com/items/${encodeURIComponent(id)}`;
  if (!listingUrl) return null;
  const title = clean(item.title || item.name || item.product_title || item.productTitle || `Vinted listing ${id || ''}`) || 'Vinted listing';
  const imageUrl = clean(item.image_url || item.imageUrl || item.thumbnail_url || item.thumbnailUrl || item.photo_url || item.photoUrl);
  const price = num(item.price ?? item.price_amount ?? item.amount ?? 0);
  const currency = clean(item.currency || item.currency_code || item.currencyCode || 'USD') || 'USD';
  return {
    listingId: id || null,
    title: title.slice(0, 300),
    price,
    currency,
    imageUrl,
    listingUrl,
    raw: item,
  };
}

async function fetchPage(user, page, apiKey) {
  const q = new URLSearchParams({ user, page: String(page), per_page: String(PER_PAGE) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${PARSE_URL}?${q.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok || payload?.status === 'error') {
      const detail = clean(payload?.error?.message || payload?.error || payload?.message || payload?.detail || text || `Parse API ${response.status}`);
      const error = new Error(detail.slice(0, 500));
      error.status = response.status;
      throw error;
    }
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    return {
      profile: data?.profile || {},
      listings: Array.isArray(data?.listings) ? data.listings : [],
      pagination: data?.pagination || {},
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('Parse took too long to read Vinted. Try Refresh again.');
      timeout.status = 504;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function batchUpsert(client, businessId, listings, seller) {
  const unique = [...new Map(listings.filter(Boolean).map((x) => [x.listingUrl, x])).values()];
  if (!unique.length) return [];
  const rows = unique.map((listing) => ({
    id: crypto.createHash('sha256').update(`${businessId}|Vinted|${listing.listingUrl}`).digest('hex'),
    listing_id: listing.listingId || null,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    image_url: listing.imageUrl || null,
    listing_url: listing.listingUrl,
    data: { source: 'parse.bot', seller, scraper_id: SCRAPER_ID, raw: listing.raw },
  }));
  await client.query(`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id text, listing_id text, title text, price numeric, currency text, image_url text, listing_url text, data jsonb
      )
    )
    INSERT INTO artflow.marketplace_listings
      (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
    SELECT id,$2,'Vinted',listing_id,title,price,currency,image_url,listing_url,'Active',now(),'parse_vinted_refresh',data
    FROM incoming
    ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
      listing_id=EXCLUDED.listing_id,
      title=EXCLUDED.title,
      price=EXCLUDED.price,
      currency=EXCLUDED.currency,
      image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
      status='Active',
      last_seen_at=now(),
      sync_source='parse_vinted_refresh',
      data=EXCLUDED.data
  `, [JSON.stringify(rows), businessId]);
  return unique.map((x) => x.listingUrl);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const p = await profile(client, session.user);
    const business = await businessForUser(client, p, session.user);
    if (!business) return res.status(404).json({ error: 'Business workspace not found' });

    const apiKey = clean(process.env.PARSE_API_KEY);
    const stored = clean(business?.data?.vinted_profile || business?.data?.vinted_username || '');
    if (req.method === 'GET') {
      return res.status(200).json({
        configured: Boolean(apiKey),
        profile: stored,
        needs_api_key: !apiKey,
        needs_profile: !stored,
      });
    }
    if (!apiKey) return res.status(503).json({ needs_api_key: true, error: 'Add PARSE_API_KEY to Vercel before refreshing Vinted listings.' });

    const body = parseBody(req);
    const input = clean(body.profile || body.username || stored);
    const parsed = parseProfile(input);
    if (!parsed.user) return res.status(400).json({ needs_profile: true, error: 'Enter your Vinted profile URL or username once to enable one-tap refresh.' });

    if (input !== stored) {
      const next = { ...(business.data || {}), vinted_profile: input };
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [business.base44_id, JSON.stringify(next)]);
      business.data = next;
    }

    await ensureTable(client);

    const first = await fetchPage(parsed.user, 1, apiKey);
    const totalPagesRaw = Number(first.pagination?.total_pages || first.pagination?.totalPages || 1);
    const totalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? Math.ceil(totalPagesRaw) : 1;
    const pagesToFetch = Math.min(totalPages, MAX_PAGES);
    const results = [first];
    const remainingPages = Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) => index + 2);
    if (remainingPages.length) {
      results.push(...await Promise.all(remainingPages.map((page) => fetchPage(parsed.user, page, apiKey))));
    }

    const normalizedListings = [];
    for (const result of results) {
      for (const raw of result.listings) {
        const listing = normalizeListing(raw);
        if (listing) normalizedListings.push(listing);
      }
    }

    const uniqueListings = [...new Map(normalizedListings.map((listing) => [listing.listingUrl, listing])).values()];
    const cappedListings = uniqueListings.slice(0, MAX_LISTINGS);
    const seller = clean(first.profile?.username || parsed.user);
    const activeUrls = await batchUpsert(client, business.base44_id, cappedListings, seller);
    const complete = totalPages <= MAX_PAGES && uniqueListings.length <= MAX_LISTINGS;
    let deactivated = 0;

    if (complete) {
      if (activeUrls.length) {
        const r = await client.query(
          `UPDATE artflow.marketplace_listings
           SET status='Inactive',last_seen_at=now(),sync_source='parse_vinted_snapshot'
           WHERE business_id=$1 AND platform='Vinted' AND status='Active'
             AND NOT (listing_url = ANY($2::text[]))`,
          [business.base44_id, activeUrls],
        );
        deactivated = Number(r.rowCount || 0);
      } else {
        const r = await client.query(
          `UPDATE artflow.marketplace_listings
           SET status='Inactive',last_seen_at=now(),sync_source='parse_vinted_snapshot'
           WHERE business_id=$1 AND platform='Vinted' AND status='Active'`,
          [business.base44_id],
        );
        deactivated = Number(r.rowCount || 0);
      }
    }

    const saved = activeUrls.length;
    const partialNote = complete ? '' : ` Up to ${MAX_LISTINGS} active Vinted listings were refreshed. Any additional listings were left untouched for safety.`;
    return res.status(200).json({
      ok: true,
      saved,
      deactivated,
      pages: results.length,
      total_pages: totalPages,
      max_listings: MAX_LISTINGS,
      profile: input,
      username: seller,
      partial: !complete,
      message: `${saved} active Vinted listing${saved === 1 ? '' : 's'} refreshed${deactivated ? ` · ${deactivated} no longer active` : ''}.${partialNote}`,
    });
  } catch (error) {
    console.error('Parse Vinted refresh failed', error?.message || error);
    if (error?.status === 401 || error?.status === 403) return res.status(502).json({ error: 'Parse rejected the API key. Check PARSE_API_KEY in Vercel.' });
    if (error?.status === 404) return res.status(404).json({ error: 'Vinted could not find that seller profile. Check the Vinted username or profile URL.' });
    if (error?.status === 429) return res.status(429).json({ error: 'Parse rate limit reached. Try Refresh again in a minute.' });
    if (error?.status === 504) return res.status(504).json({ error: clean(error?.message) || 'Parse timed out while reading Vinted.' });
    return res.status(500).json({ error: clean(error?.message || 'Vinted refresh failed') || 'Vinted refresh failed' });
  } finally {
    client.release();
  }
}
