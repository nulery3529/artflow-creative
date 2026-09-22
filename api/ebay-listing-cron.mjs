import pg from 'pg';
import crypto from 'node:crypto';
import { pooledDatabaseUrl } from './_db.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });
const clean = (value = '') => String(value || '').trim();

function normalizeUrl(raw = '') {
  try {
    const url = new URL(clean(raw));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function ebayUsername(raw = '') {
  const value = clean(raw).replace(/^@+/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) {
    return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(value) ? value : '';
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== 'ebay.com' && !host.endsWith('.ebay.com')) return '';
    const queryUser = clean(url.searchParams.get('_ssn')).replace(/^@+/, '');
    if (queryUser) return queryUser;
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((part) => ['usr','str'].includes(part.toLowerCase()));
    const username = idx >= 0 ? clean(parts[idx + 1]).replace(/^@+/, '') : '';
    return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(username) ? username : '';
  } catch { return ''; }
}

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripMarkup(value = '') {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function priceFromText(value = '') {
  const match = String(value || '').match(/(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const price = Number((match?.[1] || '').replace(/,/g, ''));
  return Number.isFinite(price) ? price : 0;
}

function ebayItemFromMarkup(markup = '') {
  const html = decodeEntities(String(markup || ''));
  const href = html.match(/href=["']([^"']*\/itm\/[^"']+)["']/i)?.[1] || '';
  let url = '';
  try { url = normalizeUrl(new URL(href, 'https://www.ebay.com').toString()); } catch {}
  const itemId = url.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || '';
  if (!itemId) return null;
  const imageUrl = clean(html.match(/https?:\/\/[^"'\s<>]*ebayimg\.com\/[^"'\s<>]+/i)?.[0] || '').replace(/&amp;/g, '&');
  const alt = html.match(/\balt=["']([^"']{2,500})["']/i)?.[1] || '';
  const text = stripMarkup(html);
  const title = clean(alt || text.split(/\$\s*[0-9]/)[0] || `eBay listing ${itemId}`)
    .replace(/^opens in a new window or tab\s*/i, '')
    .slice(0, 300);
  return { item_id: itemId, url, title: title || `eBay listing ${itemId}`, image_url: imageUrl, price: priceFromText(text), currency: 'USD' };
}

async function collectEbayMicrolinkListings(username) {
  const listings = [];
  const seen = new Set();
  let complete = false;

  for (let page = 1; page <= 25 && listings.length < 5000; page += 1) {
    const sellerPage = new URL('https://www.ebay.com/sch/i.html');
    sellerPage.searchParams.set('_ssn', username);
    sellerPage.searchParams.set('_ipg', '240');
    sellerPage.searchParams.set('_pgn', String(page));
    sellerPage.searchParams.set('_sop', '10');

    const endpoint = new URL('https://api.microlink.io/');
    endpoint.searchParams.set('url', sellerPage.toString());
    endpoint.searchParams.set('meta', 'false');
    endpoint.searchParams.set('prerender', 'true');
    endpoint.searchParams.set('data.cards.selectorAll', 'li.s-item');
    endpoint.searchParams.set('data.cards.attr', 'outerHTML');
    endpoint.searchParams.set('data.links.selectorAll', 'a[href*="/itm/"]');
    endpoint.searchParams.set('data.links.attr', 'outerHTML');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    let response;
    try {
      response = await fetch(endpoint, { signal: controller.signal, headers: { accept: 'application/json' } });
    } finally {
      clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.status === 'error') {
      throw new Error(clean(payload?.message || payload?.data?.url || `Browser catalog returned ${response.status}`));
    }

    const cards = Array.isArray(payload?.data?.cards) ? payload.data.cards : [];
    const links = Array.isArray(payload?.data?.links) ? payload.data.links : [];
    const fragments = cards.length ? cards : links;
    let added = 0;
    for (const fragment of fragments) {
      const item = ebayItemFromMarkup(fragment);
      if (!item || seen.has(item.item_id)) continue;
      seen.add(item.item_id);
      listings.push(item);
      added += 1;
    }
    if (!fragments.length || added === 0) {
      complete = true;
      break;
    }
  }
  return { listings, total: listings.length, complete };
}

async function collectEbayListings(username) {
  const apiKey = clean(process.env.SCRAPEBADGER_API_KEY);
  if (!apiKey) return collectEbayMicrolinkListings(username);

  const listings = [];
  const seen = new Set();
  let total = null;
  let complete = false;

  for (let page = 1; page <= 100 && listings.length < 20000; page += 1) {
    const endpoint = new URL(`https://scrapebadger.com/v1/ebay/sellers/${encodeURIComponent(username)}/items`);
    endpoint.searchParams.set('domain', 'com');
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('per_page', '240');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(endpoint, { signal: controller.signal, headers: { 'x-api-key': apiKey, accept: 'application/json' } });
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(payload?.detail || payload?.error || payload?.message || `eBay catalog returned ${response.status}`));

    const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.items) ? payload.items : [];
    const pagination = payload?.pagination || {};
    const reportedTotal = Number(pagination?.total_results);
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) total = reportedTotal;

    for (const item of rows) {
      const itemId = clean(item?.item_id || item?.legacy_item_id || item?.itemId || item?.legacyItemId || '');
      const url = normalizeUrl(item?.url || (itemId ? `https://www.ebay.com/itm/${itemId}` : ''));
      if (!itemId || !url || seen.has(itemId)) continue;
      seen.add(itemId);
      const priceValue = item?.price && typeof item.price === 'object' ? item.price.value : item?.price;
      const price = Number(priceValue);
      listings.push({
        item_id: itemId,
        url,
        title: clean(item?.title || `eBay listing ${itemId}`).slice(0, 300),
        image_url: clean(item?.image || ''),
        price: Number.isFinite(price) ? price : 0,
        currency: clean(item?.price?.currency || item?.currency || 'USD').toUpperCase() || 'USD',
      });
    }

    const totalPages = Number(pagination?.total_pages);
    const currentPage = Number(pagination?.current_page || page);
    const hasMore = pagination?.has_more;
    if (
      rows.length === 0 ||
      hasMore === false ||
      (Number.isFinite(totalPages) && totalPages > 0 && currentPage >= totalPages) ||
      (total !== null && listings.length >= total)
    ) {
      complete = true;
      break;
    }
    if (rows.length < 240 && hasMore !== true && !Number.isFinite(totalPages)) {
      complete = true;
      break;
    }
  }
  return { listings, total: total ?? listings.length, complete };
}

async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,
    price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',
    last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx
    ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}

async function targetScopeForBusiness(client, businessId) {
  const userResult = await client.query(
    `SELECT auth_user_id FROM artflow.legacy_users
      WHERE active_business_id=$1 AND auth_user_id IS NOT NULL
      ORDER BY updated_date DESC NULLS LAST, created_date DESC NULLS LAST LIMIT 1`,
    [businessId]
  );
  const userScope = userResult.rows[0]?.auth_user_id ? `user:${userResult.rows[0].auth_user_id}` : '';
  const scopes = [businessId, userScope].filter(Boolean);
  if (scopes.length === 1) return scopes[0];

  const counts = await client.query(
    `SELECT business_id,count(*)::int AS rows FROM artflow.marketplace_listings
      WHERE platform='eBay' AND business_id=ANY($1::text[])
      GROUP BY business_id ORDER BY rows DESC LIMIT 1`,
    [scopes]
  );
  return counts.rows[0]?.business_id || userScope || businessId;
}

async function syncBusiness(client, business) {
  const data = business.data || {};
  const rawProfile = clean(
    data?.marketplace_links?.eBay || data?.marketplace_links?.ebay ||
    data?.mobile_shop_urls?.eBay || data?.mobile_shop_urls?.ebay || ''
  );
  const username = ebayUsername(rawProfile);
  if (!username) return { skipped: 1, saved: 0, deactivated: 0, total: 0 };

  const profile = await collectEbayListings(username);
  if (!profile.listings.length) return { skipped: 1, saved: 0, deactivated: 0, total: profile.total || 0 };

  const targetScope = await targetScopeForBusiness(client, business.base44_id);
  const activeIds = [];
  const activeUrls = [];
  let saved = 0;

  for (const item of profile.listings) {
    const itemId = clean(item.item_id);
    const url = clean(item.url);
    if (!itemId || !url) continue;
    activeIds.push(itemId);
    activeUrls.push(url);

    const existing = await client.query(
      `SELECT id FROM artflow.marketplace_listings
        WHERE business_id=$1 AND platform='eBay' AND (listing_id=$2 OR listing_url=$3)
        ORDER BY CASE WHEN listing_id=$2 THEN 0 ELSE 1 END LIMIT 1`,
      [targetScope, itemId, url]
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `UPDATE artflow.marketplace_listings SET
          listing_id=$2,title=$3,price=CASE WHEN $4::numeric>0 THEN $4::numeric ELSE price END,
          currency=$5,image_url=COALESCE(NULLIF($6,''),image_url),listing_url=$7,status='Active',
          last_seen_at=now(),sync_source='ebay_profile_cron',
          data=COALESCE(data,'{}'::jsonb) || jsonb_build_object('profile_cron',true,'profile_username',$8::text)
          WHERE id=$1`,
        [existing.rows[0].id, itemId, item.title, item.price || 0, item.currency || 'USD', item.image_url || '', url, username]
      );
    } else {
      const id = crypto.createHash('sha256').update(`${targetScope}|eBay|${itemId}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings
          (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
          VALUES ($1,$2,'eBay',$3,$4,$5,$6,$7,$8,'Active',now(),'ebay_profile_cron',
            jsonb_build_object('profile_cron',true,'profile_username',$9::text))
          ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
            listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,
            price=CASE WHEN EXCLUDED.price>0 THEN EXCLUDED.price ELSE artflow.marketplace_listings.price END,
            currency=EXCLUDED.currency,image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
            status='Active',last_seen_at=now(),sync_source='ebay_profile_cron',
            data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb) || EXCLUDED.data`,
        [id, targetScope, itemId, item.title, item.price || 0, item.currency || 'USD', item.image_url || null, url, username]
      );
    }
    saved += 1;
  }

  let deactivated = 0;
  if (profile.complete && activeIds.length) {
    const result = await client.query(
      `UPDATE artflow.marketplace_listings
        SET status='Inactive',last_seen_at=now(),sync_source='ebay_profile_cron'
        WHERE business_id=$1 AND platform='eBay' AND status='Active'
          AND NOT (listing_id = ANY($2::text[]) OR listing_url = ANY($3::text[]))`,
      [targetScope, activeIds, activeUrls]
    );
    deactivated = Number(result.rowCount || 0);
  }
  return { skipped: 0, saved, deactivated, total: profile.total || saved };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url, 'http://localhost');
    const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  const summary = { businesses: 0, synced: 0, saved: 0, deactivated: 0, skipped: 0, failed: 0, reported_total: 0 };

  try {
    await ensureTable(client);
    const businesses = await client.query(`
      SELECT base44_id,data FROM artflow.businesses
      WHERE COALESCE(
        data->'marketplace_links'->>'eBay',data->'marketplace_links'->>'ebay',
        data->'mobile_shop_urls'->>'eBay',data->'mobile_shop_urls'->>'ebay',''
      ) <> ''
      ORDER BY base44_id`);

    for (const business of businesses.rows) {
      summary.businesses += 1;
      try {
        const result = await syncBusiness(client, business);
        summary.saved += result.saved;
        summary.deactivated += result.deactivated;
        summary.skipped += result.skipped;
        summary.reported_total += result.total || 0;
        if (!result.skipped) summary.synced += 1;
      } catch (error) {
        summary.failed += 1;
        console.warn('eBay listing cron business failed', business.base44_id, error?.message || error);
      }
    }
    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('eBay listing cron failed', error?.message || error);
    return res.status(500).json({ error: 'eBay listing refresh failed', ...summary });
  } finally {
    client.release();
  }
}
