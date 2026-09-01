import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const SCRAPER_ID = '21a016a2-7521-42f3-887d-95f9aec5ec31';
const PARSE_BASE = `https://api.parse.bot/scraper/${SCRAPER_ID}`;
const clean = (v = '') => String(v ?? '').trim();
const normalize = (v = '') => clean(v).toLowerCase();

async function getSession(req) { return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
async function profile(client, user) {
  const email = normalize(user?.email);
  const r = await client.query(`SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`, [user.id, email]);
  return r.rows[0] || null;
}
function businessEmails(row) {
  const d = row?.data || {};
  return [row?.primary_email, d.primary_email, ...(d.member_emails || []), ...(d.sales_emails || []), ...(d.expense_emails || [])].map(normalize).filter(Boolean);
}
async function businessForUser(client, p, user) {
  const active = p?.active_business_id || p?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const r = await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow = r.rows.find(x => active && x.base44_id === active) || null;
  const emailRows = r.rows.filter(x => email && businessEmails(x).includes(email));
  const placeholder = (row) => {
    if (!row) return false;
    const d = row.data || {};
    return businessEmails(row).length === 0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name || '').trim());
  };
  const canonical = emailRows.find(row => {
    const d = row.data || {};
    return Boolean(d.spreadsheet_id || d.spreadsheetId || (Array.isArray(d.tracked_marketplaces) && d.tracked_marketplaces.length));
  }) || emailRows[0] || null;
  return placeholder(activeRow) && canonical ? canonical : (activeRow || canonical || null);
}
async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}
function parseProfile(value = '') {
  const raw = clean(value);
  if (!raw) return { raw: '', username: '', profileUrl: '' };
  let username = raw.replace(/^@/, '');
  let profileUrl = '';
  try {
    const u = new URL(raw);
    profileUrl = u.toString();
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts.at(-1) || '';
    username = last.replace(/^\d+-/, '').replace(/^@/, '') || username;
    if (/^(member|members|user|users|profile)$/i.test(username) && parts.length > 1) username = parts.at(-2) || username;
  } catch {}
  username = username.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
  return { raw, username, profileUrl };
}
function num(...values) {
  for (const v of values) {
    if (v && typeof v === 'object') {
      const nested = num(v.amount, v.value, v.price, v.base_price, v.total, v.total_price);
      if (nested || nested === 0) return nested;
    }
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}
function firstImage(obj) {
  const seen = new Set();
  const walk = (v, depth = 0) => {
    if (depth > 5 || v == null) return '';
    if (typeof v === 'string') return /^https?:\/\//i.test(v) && /vinted|image|photo|cdn|jpg|jpeg|png|webp/i.test(v) ? v : '';
    if (typeof v !== 'object' || seen.has(v)) return '';
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) { const hit = walk(x, depth + 1); if (hit) return hit; }
      return '';
    }
    const priority = ['image_url', 'imageUrl', 'thumbnail', 'main_photo', 'mainPhoto', 'photo', 'photos', 'images', 'image'];
    for (const k of priority) if (k in v) { const hit = walk(v[k], depth + 1); if (hit) return hit; }
    for (const [k, x] of Object.entries(v)) if (/image|photo|thumb|picture/i.test(k)) { const hit = walk(x, depth + 1); if (hit) return hit; }
    return '';
  };
  return walk(obj);
}
function findListingArray(payload) {
  const seen = new Set();
  const walk = (v, depth = 0) => {
    if (depth > 6 || v == null || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.length && v.some(x => x && typeof x === 'object') ? v : null;
    const priority = ['listings', 'items', 'products', 'wardrobe', 'catalog_items', 'catalogItems', 'closet', 'active_listings', 'activeListings'];
    for (const k of priority) if (Array.isArray(v[k])) return v[k];
    for (const x of Object.values(v)) {
      const hit = walk(x, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(payload) || [];
}
function normalizeListing(item = {}) {
  const id = clean(item.id || item.item_id || item.itemId || item.listing_id || item.listingId || item.slug);
  const status = clean(item.status || item.state || item.availability);
  if (item.sold === true || /sold|inactive|deleted|reserved|unavailable/i.test(status)) return null;
  let listingUrl = clean(item.url || item.web_url || item.webUrl || item.item_url || item.itemUrl || item.listing_url || item.listingUrl || item.path);
  if (listingUrl && listingUrl.startsWith('/')) listingUrl = `https://www.vinted.com${listingUrl}`;
  if (!listingUrl && id) listingUrl = `https://www.vinted.com/items/${encodeURIComponent(id)}`;
  if (!listingUrl) return null;
  let title = clean(item.title || item.name || item.product_title || item.productTitle || item.description);
  if (!title) title = id ? `Vinted listing ${id}` : 'Vinted listing';
  const priceObj = item.price || item.pricing || item.base_price || item.total_price || {};
  const price = num(item.price_amount, item.amount, item.base_price, item.total_price, priceObj);
  const currency = clean(item.currency || priceObj?.currency || priceObj?.currency_code || priceObj?.currencyCode || 'USD') || 'USD';
  return { listingId: id || null, title: title.slice(0, 300), price, currency, imageUrl: firstImage(item), listingUrl, raw: item };
}
function endpointScore(endpoint = {}) {
  const text = `${endpoint.endpoint_name || endpoint.name || ''} ${endpoint.description || ''}`.toLowerCase();
  let score = 0;
  if (/seller.*list|list.*seller|user.*list|list.*user|wardrobe|closet|active.*list/.test(text)) score += 100;
  if (/profile/.test(text) && /list|item|wardrobe|closet/.test(text)) score += 80;
  if (/profile/.test(text)) score += 35;
  if (/listing|items|products/.test(text)) score += 20;
  if (/search/.test(text)) score -= 40;
  if (/sold|order|transaction|review/.test(text)) score -= 80;
  return score;
}
async function discoverSpec(key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch('https://api.parse.bot/dispatch/tasks?limit=100&status=completed', {
      headers: { Accept: 'application/json', 'X-API-Key': key },
      signal: controller.signal,
    });
    const text = await r.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!r.ok) {
      const e = new Error(clean(payload?.error?.message || payload?.error || payload?.message || text || `Parse API ${r.status}`).slice(0, 500));
      e.status = r.status;
      throw e;
    }
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    const task = tasks.find(t => t?.result_scraper_id === SCRAPER_ID || t?.generated_api?.scraper_id === SCRAPER_ID);
    const spec = task?.generated_api || null;
    if (!spec) throw new Error('Could not find this Vinted scraper in the Parse account connected to Art Flow.');
    const endpoints = Array.isArray(spec.endpoints) ? spec.endpoints.slice().sort((a, b) => endpointScore(b) - endpointScore(a)) : [];
    if (!endpoints.length) throw new Error('This Vinted Parse scraper does not have a usable endpoint yet.');
    return { spec, endpoint: endpoints[0] };
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Parse took too long while loading the Vinted scraper details.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function buildParams(endpoint, profileInput, page = 1) {
  const defs = endpoint?.input_params && typeof endpoint.input_params === 'object' ? endpoint.input_params : {};
  const params = {};
  const full = profileInput.profileUrl || profileInput.raw;
  for (const [name, def] of Object.entries(defs)) {
    const key = name.toLowerCase();
    if (/^(page|page_number|page_num)$/.test(key)) params[name] = page;
    else if (/per_page|page_size/.test(key)) params[name] = Math.min(Number(def?.maximum || def?.max || 96) || 96, 96);
    else if (/^limit$/.test(key)) params[name] = Math.min(Number(def?.maximum || def?.max || 100) || 100, 100);
    else if (/max_results|max_items/.test(key)) params[name] = Math.min(Number(def?.maximum || def?.max || 500) || 500, 500);
    else if (/url|profile|member|user_id_or_url|seller_id_or_url/.test(key)) params[name] = full || profileInput.username;
    else if (/username|user_name|seller_name|member_name|handle/.test(key)) params[name] = profileInput.username || full;
    else if (/^user$|^seller$|^member$/.test(key)) params[name] = profileInput.username || full;
  }
  if (!Object.keys(params).length) {
    params.username = profileInput.username || full;
  }
  return params;
}
async function callEndpoint(endpoint, params, key) {
  const method = clean(endpoint?.method || 'GET').toUpperCase();
  const name = clean(endpoint?.endpoint_name || endpoint?.name);
  if (!name) throw new Error('The Vinted Parse endpoint is missing its name.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers = { Accept: 'application/json', 'X-API-Key': key };
    let url = `${PARSE_BASE}/${encodeURIComponent(name)}`;
    const options = { method, headers, signal: controller.signal };
    if (method === 'GET') {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, String(v));
      url += `?${q.toString()}`;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(params);
    }
    const r = await fetch(url, options);
    const text = await r.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!r.ok || payload?.status === 'error') {
      const e = new Error(clean(payload?.error?.message || payload?.error?.detail || payload?.error || payload?.message || payload?.detail || text || `Parse API ${r.status}`).slice(0, 500));
      e.status = r.status;
      throw e;
    }
    return payload;
  } catch (e) {
    if (e?.name === 'AbortError') {
      const timeout = new Error('Parse took too long to read Vinted. Try Refresh again.');
      timeout.status = 504;
      throw timeout;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function paginationInfo(payload) {
  const candidates = [payload?.pagination, payload?.meta, payload?.data?.pagination, payload?.data?.meta, payload?.data, payload];
  for (const p of candidates) {
    if (!p || typeof p !== 'object') continue;
    const totalPages = Number(p.total_pages || p.totalPages || p.pages || 0);
    const currentPage = Number(p.current_page || p.currentPage || p.page || 1);
    const hasMore = p.has_more === true || p.hasMore === true || (totalPages > currentPage);
    if (totalPages || p.has_more !== undefined || p.hasMore !== undefined) return { totalPages, currentPage, hasMore };
  }
  return { totalPages: 0, currentPage: 1, hasMore: false };
}
async function batchUpsert(client, businessId, listings, profileInput) {
  const unique = [...new Map(listings.filter(Boolean).map(x => [x.listingUrl, x])).values()];
  if (!unique.length) return [];
  const rows = unique.map(listing => ({
    id: crypto.createHash('sha256').update(`${businessId}|Vinted|${listing.listingUrl}`).digest('hex'),
    listing_id: listing.listingId || null,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    image_url: listing.imageUrl || null,
    listing_url: listing.listingUrl,
    data: { source: 'parse.bot', seller: profileInput.username || null, profile_url: profileInput.profileUrl || null, scraper_id: SCRAPER_ID },
  }));
  await client.query(`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id text, listing_id text, title text, price numeric, currency text, image_url text, listing_url text, data jsonb
      )
    )
    INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
    SELECT id,$2,'Vinted',listing_id,title,price,currency,image_url,listing_url,'Active',now(),'parse_vinted_refresh',data FROM incoming
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
  return unique.map(x => x.listingUrl);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const client = await pool.connect();
  try {
    const p = await profile(client, session.user);
    const b = await businessForUser(client, p, session.user);
    if (!b) return res.status(404).json({ error: 'Business workspace not found' });
    const apiKey = clean(process.env.PARSE_API_KEY);
    const stored = clean(b?.data?.vinted_profile || b?.data?.vinted_username || '');
    const storedParsed = parseProfile(stored);
    if (req.method === 'GET') return res.status(200).json({ configured: Boolean(apiKey), profile: stored, username: storedParsed.username, needs_api_key: !apiKey, needs_profile: !stored });
    if (!apiKey) return res.status(503).json({ needs_api_key: true, error: 'Add PARSE_API_KEY to Vercel before refreshing Vinted listings.' });

    const body = parseBody(req);
    const input = clean(body.profile || body.username || stored);
    const profileInput = parseProfile(input);
    if (!profileInput.raw) return res.status(400).json({ needs_profile: true, error: 'Enter your Vinted profile URL or username once to enable one-tap refresh.' });
    if (input !== stored) {
      const next = { ...(b.data || {}), vinted_profile: input, vinted_username: profileInput.username };
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [b.base44_id, JSON.stringify(next)]);
      b.data = next;
    }

    await ensureTable(client);
    const { endpoint } = await discoverSpec(apiKey);
    const pageParam = Object.keys(endpoint?.input_params || {}).find(k => /^(page|page_number|page_num)$/i.test(k));
    const all = [];
    const firstPayload = await callEndpoint(endpoint, buildParams(endpoint, profileInput, 1), apiKey);
    for (const raw of findListingArray(firstPayload)) {
      const listing = normalizeListing(raw);
      if (listing) all.push(listing);
    }
    const info = paginationInfo(firstPayload);
    let complete = !info.hasMore;
    let pages = 1;
    if (pageParam && info.hasMore && info.totalPages > 1) {
      const lastPage = Math.min(info.totalPages, 5);
      for (let page = 2; page <= lastPage; page += 1) {
        const payload = await callEndpoint(endpoint, buildParams(endpoint, profileInput, page), apiKey);
        for (const raw of findListingArray(payload)) {
          const listing = normalizeListing(raw);
          if (listing) all.push(listing);
        }
        pages = page;
      }
      complete = info.totalPages <= 5;
    }

    const activeUrls = await batchUpsert(client, b.base44_id, all, profileInput);
    let deactivated = 0;
    if (complete) {
      if (activeUrls.length) {
        const r = await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='parse_vinted_snapshot' WHERE business_id=$1 AND platform='Vinted' AND status='Active' AND NOT (listing_url = ANY($2::text[]))`, [b.base44_id, activeUrls]);
        deactivated = Number(r.rowCount || 0);
      } else {
        const r = await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='parse_vinted_snapshot' WHERE business_id=$1 AND platform='Vinted' AND status='Active'`, [b.base44_id]);
        deactivated = Number(r.rowCount || 0);
      }
    }

    const saved = activeUrls.length;
    const partial = !complete ? ' More than 5 Vinted pages were found, so older Gallery entries were left active for safety.' : '';
    return res.status(200).json({
      ok: true,
      saved,
      deactivated,
      pages,
      endpoint: endpoint?.endpoint_name || endpoint?.name || '',
      profile: input,
      partial: !complete,
      message: `${saved} active Vinted listing${saved === 1 ? '' : 's'} refreshed${deactivated ? ` · ${deactivated} no longer active` : ''}.${partial}`,
    });
  } catch (e) {
    console.error('Parse Vinted refresh failed', e?.message || e);
    if (e?.status === 401 || e?.status === 403) return res.status(502).json({ error: 'Parse rejected the API key. Check PARSE_API_KEY in Vercel.' });
    if (e?.status === 429) return res.status(429).json({ error: 'Parse rate limit reached. Try Refresh again in a minute.' });
    if (e?.status === 504) return res.status(504).json({ error: clean(e?.message) || 'Parse timed out while reading Vinted.' });
    return res.status(500).json({ error: clean(e?.message || 'Vinted refresh failed') || 'Vinted refresh failed' });
  } finally {
    client.release();
  }
}
