import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const SUPPORTED = ['Vinted', 'Depop', 'Etsy', 'eBay'];
const clean = (v = '') => String(v || '').trim();
const normalize = (v = '') => clean(v).toLowerCase();

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
    try {
      return Object.fromEntries(new URLSearchParams(req.body).entries());
    } catch {}
  }
  return {};
}

function sendResult(res, status, payload, formMode = false) {
  if (!formMode) return res.status(status).json(payload);
  const message = JSON.stringify({ type: 'artflow-listing-sync-result', status, ...payload }).replace(/</g, '\\u003c');
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(`<!doctype html><html><body><script>parent.postMessage(${message}, location.origin);</script></body></html>`);
}

function platformFrom(value = '') {
  if (/vinted/i.test(value)) return 'Vinted';
  if (/depop/i.test(value)) return 'Depop';
  if (/etsy/i.test(value)) return 'Etsy';
  if (/ebay/i.test(value)) return 'eBay';
  return '';
}

const OFFICIAL_HOSTS = {
  Vinted: [
    'vinted.com','www.vinted.com','vinted.co.uk','www.vinted.co.uk','vinted.fr','www.vinted.fr',
    'vinted.de','www.vinted.de','vinted.it','www.vinted.it','vinted.es','www.vinted.es',
    'vinted.nl','www.vinted.nl','vinted.be','www.vinted.be','vinted.pl','www.vinted.pl',
    'vinted.pt','www.vinted.pt','vinted.cz','www.vinted.cz','vinted.at','www.vinted.at',
    'vinted.ie','www.vinted.ie','vinted.ca','www.vinted.ca','vinted.page.link'
  ],
  Depop: ['depop.com','www.depop.com','depop.app.link'],
  Etsy: ['etsy.com','www.etsy.com','etsy.me'],
  eBay: [
    'ebay.com','www.ebay.com','ebay.us','www.ebay.us','ebay.co.uk','www.ebay.co.uk',
    'ebay.ca','www.ebay.ca','ebay.com.au','www.ebay.com.au','ebay.de','www.ebay.de',
    'ebay.fr','www.ebay.fr','ebay.it','www.ebay.it','ebay.es','www.ebay.es'
  ],
};

function allowedHost(platform, raw = '') {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (OFFICIAL_HOSTS[platform] || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {}
  return false;
}

function canonicalFromHtml(html = '', baseUrl = '') {
  const candidates = [
    metaContent(html, 'og:url'),
    html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1],
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)?.[1],
  ].filter(Boolean);
  for (const raw of candidates) {
    try { return new URL(decodeEntities(raw), baseUrl).toString(); } catch {}
  }
  return '';
}

function isListingUrl(platform, raw = '') {
  try {
    const p = new URL(raw).pathname;
    if (platform === 'Vinted') return /\/items\/\d+/i.test(p);
    if (platform === 'Depop') return /\/products\/[^/?#]+/i.test(p);
    if (platform === 'Etsy') return /\/listing\/\d+/i.test(p);
    if (platform === 'eBay') return /\/itm\//i.test(p);
  } catch {}
  return false;
}

function isDepopProfileUrl(raw = '') {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!['depop.com', 'www.depop.com'].includes(host)) return false;
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return false;
    const username = segments[0];
    if (!/^[a-z0-9._-]{2,40}$/i.test(username)) return false;
    return !['products', 'sellinghub', 'search', 'login', 'signup', 'settings', 'help'].includes(username.toLowerCase());
  } catch {}
  return false;
}

function cleanMarketplaceUsername(value = '') {
  const raw = clean(value).replace(/^@+/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const segments = u.pathname.split('/').filter(Boolean);
      if (/vinted/i.test(u.hostname)) {
        const member = segments.find((segment) => /^\d+-/.test(segment));
        if (member) return member.replace(/^\d+-/, '').replace(/^@+/, '');
      }
      if (/depop/i.test(u.hostname) && segments.length) return segments[0].replace(/^@+/, '');
    } catch {}
  }
  return raw.trim();
}

function isValidMarketplaceUsername(value = '') {
  return /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/i.test(cleanMarketplaceUsername(value));
}

function parseSetCookieHeader(raw = '') {
  const cookies = {};
  for (const match of String(raw || '').matchAll(/(?:^|, )([A-Za-z0-9_\-]+)=([^;,]+)/g)) cookies[match[1]] = match[2];
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
}

async function vintedPublicSession() {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const response = await fetch('https://www.vinted.com/', {
    redirect: 'follow',
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`Vinted session returned ${response.status}`);
  await response.text();
  const cookie = parseSetCookieHeader(response.headers.get('set-cookie') || '');
  if (!cookie) throw new Error('Vinted did not provide a public session');
  return {
    userAgent,
    cookie,
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      Cookie: cookie,
    },
  };
}

async function vintedJson(path, session, referer = 'https://www.vinted.com/') {
  const response = await fetch(`https://www.vinted.com${path}`, {
    headers: { ...session.headers, Referer: referer },
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(clean(payload?.message || payload?.message_code || `Vinted returned ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function collectVintedProfileListings(usernameInput) {
  const username = cleanMarketplaceUsername(usernameInput);
  if (!isValidMarketplaceUsername(username)) throw new Error('Enter a valid Vinted username.');
  const session = await vintedPublicSession();
  const search = await vintedJson(`/api/v2/users?page=1&per_page=36&search_text=${encodeURIComponent(username)}`, session);
  const users = Array.isArray(search?.users) ? search.users : [];
  const user = users.find((entry) => normalize(entry?.login) === normalize(username)) || users[0];
  if (!user?.id) throw new Error(`Vinted user @${username} was not found.`);
  const canonicalUsername = clean(user.login || username);
  const profileUrl = clean(user.profile_url || user.share_profile_url || `https://www.vinted.com/member/${user.id}-${canonicalUsername}`);
  const out = [];
  const seen = new Set();
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, 10) && out.length < 500; page += 1) {
    const payload = await vintedJson(
      `/api/v2/wardrobe/${user.id}/items?page=${page}&per_page=50`,
      session,
      profileUrl
    );
    const items = Array.isArray(payload?.items) ? payload.items : [];
    totalPages = Math.max(1, Number(payload?.pagination?.total_pages) || 1);
    for (const item of items) {
      if (item?.is_draft || item?.is_closed || item?.is_hidden || item?.is_reserved) continue;
      const url = normalizeUrl(item?.url || (item?.id ? `https://www.vinted.com/items/${item.id}` : ''));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const firstPhoto = Array.isArray(item?.photos) ? item.photos[0] : null;
      const imageUrl = clean(firstPhoto?.url || firstPhoto?.full_size_url || firstPhoto?.thumbnails?.[0]?.url || '');
      const amount = item?.price?.amount ?? item?.price ?? 0;
      const currency = clean(item?.price?.currency_code || item?.currency || 'USD') || 'USD';
      out.push({
        platform: 'Vinted',
        url,
        meta: {
          finalUrl: url,
          title: clean(item?.title || `Vinted listing ${item?.id || ''}`).slice(0, 300),
          description: [item?.brand?.title, item?.size?.title, item?.status].map(clean).filter(Boolean).join(' · ').slice(0, 800),
          imageUrl,
          price: amount,
          currency,
        },
      });
      if (out.length >= 500) break;
    }
    if (items.length < 50) break;
  }
  return { username: canonicalUsername, profileUrl: normalizeUrl(profileUrl) || profileUrl, listings: out };
}

function isPrivateSellerDashboard(platform, raw = '') {
  try {
    const p = new URL(raw).pathname;
    if (platform !== 'Depop') return false;
    return /^\/sellinghub(?:\/|$)/i.test(p);
  } catch {}
  return false;
}

function listingIdFromUrl(platform, raw = '') {
  try {
    const p = new URL(raw).pathname;
    if (platform === 'Vinted') return p.match(/\/items\/(\d+)/i)?.[1] || '';
    if (platform === 'Depop') return p.match(/\/products\/([^/?#]+)/i)?.[1] || '';
    if (platform === 'Etsy') return p.match(/\/listing\/(\d+)/i)?.[1] || '';
    if (platform === 'eBay') return p.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || '';
  } catch {}
  return '';
}

function normalizeUrl(raw = '') {
  try {
    const u = new URL(clean(raw));
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','mkcid','mkrid','campid','customid','toolid'].forEach((key) => u.searchParams.delete(key));
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function decodeRepeated(value = '') {
  let current = clean(value);
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch { break; }
  }
  return current;
}

function embeddedMarketplaceUrls(raw = '') {
  const found = [];
  const seen = new Set();
  const push = (candidate) => {
    const decoded = decodeRepeated(candidate);
    if (!/^https?:\/\//i.test(decoded) || seen.has(decoded)) return;
    seen.add(decoded);
    const platform = platformFrom(decoded);
    if (platform && allowedHost(platform, decoded)) found.push({ platform, url: decoded });
  };

  try {
    const u = new URL(raw);
    const keys = [
      'link','url','u','target','redirect','redirect_url','redirect_uri','destination','dest',
      'deep_link_id','deep_link_value','af_dp','$canonical_url','$desktop_url','canonical_url','desktop_url'
    ];
    for (const key of keys) {
      const value = u.searchParams.get(key);
      if (value) push(value);
    }
    for (const [, value] of u.searchParams.entries()) {
      if (/https?%3a%2f%2f|https?:\/\//i.test(value)) push(value);
    }
  } catch {}

  const decodedRaw = decodeRepeated(raw);
  const urlMatches = decodedRaw.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const match of urlMatches) {
    if (match !== raw) push(match);
  }
  return found;
}

function splitUrls(value = '') {
  return String(value || '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => /^https?:\/\//i.test(v))
    .slice(0, 100);
}

function decodeEntities(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return '';
}

function extractTitle(html = '') {
  const og = metaContent(html, 'og:title');
  if (og) return og;
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]).replace(/<[^>]+>/g, '').trim() : '';
}

function extractPrice(html = '') {
  const candidates = [
    metaContent(html, 'product:price:amount'),
    metaContent(html, 'og:price:amount'),
    html.match(/itemprop=["']price["'][^>]+content=["']([0-9.,]+)["']/i)?.[1],
    html.match(/["']price["']\s*:\s*["']?([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1],
  ].filter(Boolean);
  for (const candidate of candidates) {
    const n = Number(String(candidate).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function extractListingLinks(platform, html = '', baseUrl = '') {
  const decoded = decodeEntities(html);
  const found = new Set();
  const add = (raw) => {
    if (!raw) return;
    try {
      const url = new URL(raw, baseUrl).toString();
      if (allowedHost(platform, url) && isListingUrl(platform, url)) found.add(normalizeUrl(url));
    } catch {}
  };

  for (const match of decoded.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(match[1]);

  const pathPatterns = {
    Vinted: /\/items\/\d+(?:-[^"'<>\\\s?]*)?/gi,
    Depop: /\/products\/[^"'<>\\\s?]+/gi,
    Etsy: /\/listing\/\d+(?:\/[^"'<>\\\s?]*)?/gi,
    eBay: /\/itm\/(?:[^"'<>\\\s?]+\/)?\d{8,16}/gi,
  };
  const re = pathPatterns[platform];
  if (re) for (const match of decoded.matchAll(re)) add(match[0]);

  return [...found].filter(Boolean).slice(0, 80);
}

async function fetchHtml(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) {
      const error = new Error(`Marketplace returned ${response.status}`);
      error.status = response.status;
      error.finalUrl = response.url || url;
      throw error;
    }
    return { html: await response.text(), finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function priceFromText(value = '') {
  const match = String(value || '').match(/(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (!match) return 0;
  const n = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function fetchBrowserMetadata(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL('https://api.microlink.io/');
    endpoint.searchParams.set('url', url);
    const response = await fetch(endpoint, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Browser metadata returned ${response.status}`);
    const payload = await response.json();
    if (payload?.status !== 'success' || !payload?.data) throw new Error('Browser metadata unavailable');
    const data = payload.data;
    const image = typeof data.image === 'string' ? data.image : (data.image?.url || '');
    return {
      finalUrl: clean(data.url || url),
      title: clean(data.title),
      description: clean(data.description),
      imageUrl: clean(image),
    };
  } finally {
    clearTimeout(timer);
  }
}

function depopUsernameFromProfile(profileUrl = '') {
  try {
    const u = new URL(profileUrl);
    return u.pathname.split('/').filter(Boolean)[0] || '';
  } catch { return ''; }
}

async function collectDepopProfileListings(profileUrl) {
  const apiKey = clean(process.env.SCRAPEBADGER_API_KEY);
  if (!apiKey) {
    const error = new Error('Full-profile Depop import is not connected yet. Art Flow needs a server-side Depop catalog key before it can pull an entire profile from one link.');
    error.code = 'DEPOP_PROFILE_SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const username = depopUsernameFromProfile(profileUrl);
  if (!username) throw new Error('Could not read the Depop username from that profile link.');

  const out = [];
  const seen = new Set();
  let cursor = '';
  for (let page = 0; page < 25 && out.length < 500; page += 1) {
    const endpoint = new URL(`https://scrapebadger.com/v1/depop/users/${encodeURIComponent(username)}/products`);
    endpoint.searchParams.set('market', 'us');
    endpoint.searchParams.set('per_page', '100');
    if (cursor) endpoint.searchParams.set('cursor', cursor);

    const response = await fetch(endpoint, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = clean(payload?.detail || payload?.error || `Depop catalog service returned ${response.status}`);
      const error = new Error(message || 'Depop catalog service failed');
      error.status = response.status;
      throw error;
    }

    const products = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.products)
        ? payload.products
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

    for (const product of products) {
      if (product?.is_sold === true) continue;
      const url = normalizeUrl(product?.url || (product?.slug ? `https://www.depop.com/products/${product.slug}/` : ''));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = clean(product?.title || [product?.brand, product?.size].filter(Boolean).join(' · ') || product?.slug || 'Depop listing');
      const description = clean(product?.description || [product?.brand, product?.size, product?.condition].filter(Boolean).join(' · '));
      out.push({
        platform: 'Depop',
        url,
        meta: {
          finalUrl: url,
          title: title.slice(0, 300),
          description: description.slice(0, 800),
          imageUrl: clean(product?.image || product?.image_url || product?.thumbnail || ''),
          price: product?.price || null,
          currency: product?.currency || 'USD',
        },
      });
      if (out.length >= 500) break;
    }

    const meta = payload?.meta || {};
    const nextCursor = clean(meta?.cursor || meta?.next_cursor || meta?.nextCursor || payload?.cursor || '');
    const hasMore = meta?.has_more === true || meta?.hasMore === true || Boolean(nextCursor);
    if (!hasMore || !nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return out;
}

async function session(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function profile(client, user) {
  const email = normalize(user?.email);
  const r = await client.query(
    `SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`,
    [user.id, email]
  );
  return r.rows[0] || null;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [row?.primary_email, d.primary_email, ...(d.member_emails || []), ...(d.sales_emails || []), ...(d.expense_emails || [])]
    .map(normalize).filter(Boolean);
}

async function businessForUser(client, p, user) {
  const active = p?.active_business_id || p?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const r = await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow = r.rows.find((x) => active && x.base44_id === active) || null;
  const emailRows = r.rows.filter((x) => email && businessEmails(x).includes(email));
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

async function listingMetadata(platform, url, prefetched = null) {
  if (prefetched) {
    const normalized = normalizeUrl(prefetched.finalUrl || url) || normalizeUrl(url);
    const title = (prefetched.title || `${platform} listing`).replace(/\s*[|–-]\s*(Vinted|Depop|Etsy|eBay).*$/i, '').trim();
    const explicitPrice = Number(String(prefetched.price ?? '').replace(/[^0-9.-]/g, ''));
    return {
      platform,
      listing_id: listingIdFromUrl(platform, normalized),
      title: title.slice(0, 300),
      price: Number.isFinite(explicitPrice) && explicitPrice >= 0
        ? explicitPrice
        : priceFromText(`${prefetched.title || ''} ${prefetched.description || ''}`),
      currency: clean(prefetched.currency || 'USD').toUpperCase() || 'USD',
      image_url: prefetched.imageUrl || '',
      listing_url: normalized,
    };
  }

  try {
    const { html, finalUrl } = await fetchHtml(url, 6000);
    const normalized = normalizeUrl(finalUrl || url) || normalizeUrl(url);
    let title = extractTitle(html).replace(/\s*[|–-]\s*(Vinted|Depop|Etsy|eBay).*$/i, '').trim();
    if (!title) title = `${platform} listing`;
    return {
      platform,
      listing_id: listingIdFromUrl(platform, normalized),
      title: title.slice(0, 300),
      price: extractPrice(html),
      currency: metaContent(html, 'product:price:currency') || 'USD',
      image_url: metaContent(html, 'og:image'),
      listing_url: normalized,
    };
  } catch {
    try {
      const meta = await fetchBrowserMetadata(url);
      return listingMetadata(platform, url, meta);
    } catch {
      return {
        platform,
        listing_id: listingIdFromUrl(platform, url),
        title: `${platform} listing`,
        price: 0,
        currency: 'USD',
        image_url: '',
        listing_url: normalizeUrl(url),
      };
    }
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const body = req.method === 'POST' ? parseBody(req) : {};
  const formMode = body.form_submit === '1';
  const send = (status, payload) => sendResult(res, status, payload, formMode);
  const s = await session(req).catch(() => null);
  if (!s?.user) return send(401, { error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const p = await profile(client, s.user);
    const b = await businessForUser(client, p, s.user);
    if (!b) return send(404, { error: 'Business workspace not found' });

    if (req.method === 'GET') {
      return res.status(200).json({
        supported: SUPPORTED,
        urls: b.data?.mobile_shop_urls || {},
      });
    }

    const requestedPlatform = clean(body.platform);
    const requestedUsername = cleanMarketplaceUsername(body.username || body.profile_username || '');
    const isVintedUsernameRequest = requestedPlatform === 'Vinted' && Boolean(requestedUsername);
    const submitted = splitUrls(body.urls || body.url || '');
    if (!submitted.length && !isVintedUsernameRequest) {
      return send(400, { error: 'Enter a Vinted username or paste a supported marketplace link.' });
    }

    const directListings = [];
    const shopPages = [];
    const privateSellerPages = [];
    const fullProfileSnapshots = [];
    const rejected = [];

    if (isVintedUsernameRequest) {
      try {
        const profile = await collectVintedProfileListings(requestedUsername);
        if (!profile.listings.length) {
          return send(422, {
            error: `@${profile.username || requestedUsername} does not have any currently available Vinted items.`,
            reason: 'vinted_profile_empty',
          });
        }
        directListings.push(...profile.listings);
        fullProfileSnapshots.push({
          platform: 'Vinted',
          profileUrl: profile.profileUrl,
          username: profile.username,
          urls: profile.listings.map((item) => normalizeUrl(item.url)).filter(Boolean),
        });
      } catch (error) {
        console.warn('Vinted full-profile import failed', error?.message || error);
        return send(error?.status === 429 ? 429 : 502, {
          error: clean(error?.message || 'Vinted full-profile import failed.'),
          reason: 'vinted_profile_import_failed',
        });
      }
    }

    for (const raw of submitted) {
      const platform = platformFrom(raw);
      if (!platform || !allowedHost(platform, raw)) {
        rejected.push(raw);
        continue;
      }

      if (isPrivateSellerDashboard(platform, raw)) {
        privateSellerPages.push({ platform, url: raw });
        continue;
      }

      if (isListingUrl(platform, raw)) {
        directListings.push({ platform, url: normalizeUrl(raw) });
        continue;
      }

      const embedded = embeddedMarketplaceUrls(raw);
      const embeddedListings = embedded.filter((item) => isListingUrl(item.platform, item.url));
      if (embeddedListings.length) {
        for (const item of embeddedListings) directListings.push({ platform: item.platform, url: normalizeUrl(item.url) });
        continue;
      }

      shopPages.push({ platform, url: raw });
    }

    // Resolve official mobile share/short links and shop pages. A copied marketplace-app link
    // may redirect to the canonical listing instead of containing /items, /products, /listing or /itm itself.
    for (const shop of shopPages) {
      if (shop.platform === 'Depop' && isDepopProfileUrl(shop.url)) {
        try {
          const profileListings = await collectDepopProfileListings(shop.url);
          if (!profileListings.length) {
            return send(422, {
              error: 'That Depop profile loaded, but Art Flow could not find any available product cards to import.',
              reason: 'depop_profile_empty',
            });
          }
          directListings.push(...profileListings);
          fullProfileSnapshots.push({
            platform: 'Depop',
            profileUrl: normalizeUrl(shop.url),
            urls: profileListings.map((item) => normalizeUrl(item.url)).filter(Boolean),
          });
          continue;
        } catch (error) {
          console.warn('Depop full-profile import failed', error?.message || error);
          if (error?.code === 'DEPOP_PROFILE_SERVICE_NOT_CONFIGURED') {
            return send(503, {
              error: error.message,
              reason: 'depop_profile_service_not_configured',
            });
          }
          return send(error?.status === 401 ? 503 : 502, {
            error: clean(error?.message || 'Depop full-profile import failed.'),
            reason: 'depop_profile_import_failed',
          });
        }
      }

      try {
        const { html, finalUrl } = await fetchHtml(shop.url, 9000);
        const resolvedUrl = finalUrl || shop.url;
        const resolvedPlatform = platformFrom(resolvedUrl) || shop.platform;

        if (allowedHost(resolvedPlatform, resolvedUrl) && isListingUrl(resolvedPlatform, resolvedUrl)) {
          directListings.push({ platform: resolvedPlatform, url: normalizeUrl(resolvedUrl) });
          continue;
        }

        const canonical = canonicalFromHtml(html, resolvedUrl);
        const canonicalPlatform = platformFrom(canonical) || resolvedPlatform;
        if (canonical && allowedHost(canonicalPlatform, canonical) && isListingUrl(canonicalPlatform, canonical)) {
          directListings.push({ platform: canonicalPlatform, url: normalizeUrl(canonical) });
          continue;
        }

        const found = extractListingLinks(resolvedPlatform, html, resolvedUrl);
        if (found.length) {
          for (const url of found) directListings.push({ platform: resolvedPlatform, url });
          continue;
        }

        try {
          const meta = await fetchBrowserMetadata(shop.url);
          const metaUrl = normalizeUrl(meta.finalUrl || shop.url);
          const metaPlatform = platformFrom(metaUrl) || shop.platform;
          if (allowedHost(metaPlatform, metaUrl) && isListingUrl(metaPlatform, metaUrl)) {
            directListings.push({ platform: metaPlatform, url: metaUrl, meta });
          } else if (allowedHost(shop.platform, shop.url)) {
            directListings.push({
              platform: shop.platform,
              url: normalizeUrl(shop.url),
              meta: {
                finalUrl: normalizeUrl(shop.url),
                title: `${shop.platform} listing`,
                description: '',
                imageUrl: '',
              },
            });
          }
        } catch {
          if (allowedHost(shop.platform, shop.url)) {
            directListings.push({
              platform: shop.platform,
              url: normalizeUrl(shop.url),
              meta: {
                finalUrl: normalizeUrl(shop.url),
                title: `${shop.platform} listing`,
                description: '',
                imageUrl: '',
              },
            });
          }
        }
      } catch (error) {
        console.warn('mobile listing link resolve failed', shop.platform, error?.message || error);

        const redirectedUrl = normalizeUrl(error?.finalUrl || '');
        const redirectedPlatform = platformFrom(redirectedUrl) || shop.platform;
        if (redirectedUrl && allowedHost(redirectedPlatform, redirectedUrl) && isListingUrl(redirectedPlatform, redirectedUrl)) {
          directListings.push({ platform: redirectedPlatform, url: redirectedUrl });
          continue;
        }

        try {
          const meta = await fetchBrowserMetadata(shop.url);
          const metaUrl = normalizeUrl(meta.finalUrl || shop.url);
          const metaPlatform = platformFrom(metaUrl) || shop.platform;
          if (allowedHost(metaPlatform, metaUrl) && isListingUrl(metaPlatform, metaUrl)) {
            directListings.push({ platform: metaPlatform, url: metaUrl, meta });
          } else if (allowedHost(shop.platform, shop.url)) {
            directListings.push({
              platform: shop.platform,
              url: normalizeUrl(shop.url),
              meta: {
                finalUrl: normalizeUrl(shop.url),
                title: `${shop.platform} listing`,
                description: '',
                imageUrl: '',
              },
            });
          }
        } catch (fallbackError) {
          console.warn('browser metadata fallback failed', shop.platform, fallbackError?.message || fallbackError);
          if (allowedHost(shop.platform, shop.url)) {
            directListings.push({
              platform: shop.platform,
              url: normalizeUrl(shop.url),
              meta: {
                finalUrl: normalizeUrl(shop.url),
                title: `${shop.platform} listing`,
                description: '',
                imageUrl: '',
              },
            });
          }
        }
      }
    }

    const unique = [];
    const seen = new Set();
    for (const item of directListings) {
      const key = `${item.platform}|${item.url}`;
      if (!item.url || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
      if (unique.length >= 500) break;
    }

    if (!unique.length) {
      if (privateSellerPages.some((item) => item.platform === 'Depop')) {
        return send(422, {
          error: "That is Depop's private Selling Hub / Active Listings page. Art Flow cannot read listings from that logged-in dashboard. Open a Depop product, tap Share → Copy link, then paste the product link here.",
          rejected: privateSellerPages.length,
          reason: 'private_seller_dashboard',
        });
      }

      const rejectedHosts = rejected.map((raw) => { try { return new URL(raw).hostname; } catch { return 'invalid link'; } });
      console.warn('mobile listing sync no readable links', { submitted: submitted.length, rejectedHosts, unresolved: shopPages.length });
      return send(422, {
        error: 'Art Flow received the link, but could not resolve it to a marketplace listing yet. Copy the link from the listing Share button and try again.',
        rejected: rejected.length,
      });
    }

    const listings = await mapLimit(unique, 8, (item) => listingMetadata(item.platform, item.url, item.meta || null));
    let saved = 0;
    const counts = {};
    for (const listing of listings) {
      if (!listing.listing_url || !listing.platform) continue;
      const id = crypto.createHash('sha256').update(`${b.base44_id}|${listing.platform}|${listing.listing_url}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Active',now(),'mobile_listing_sync',jsonb_build_object('gallery_manual',true,'gallery_added_at',now()))
         ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
           listing_id=EXCLUDED.listing_id,
           title=CASE WHEN EXCLUDED.title LIKE '% listing' THEN artflow.marketplace_listings.title ELSE EXCLUDED.title END,
           price=CASE WHEN EXCLUDED.price>0 THEN EXCLUDED.price ELSE artflow.marketplace_listings.price END,
           currency=EXCLUDED.currency,
           image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
           status=CASE
             WHEN artflow.marketplace_listings.status='Sold' THEN 'Sold'
             ELSE 'Active'
           END,
           last_seen_at=now(),sync_source='mobile_listing_sync',
           data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb) || jsonb_build_object('gallery_manual',true,'gallery_added_at',now())`,
        [id,b.base44_id,listing.platform,listing.listing_id || null,listing.title,listing.price || 0,listing.currency || 'USD',listing.image_url || null,listing.listing_url]
      );
      counts[listing.platform] = (counts[listing.platform] || 0) + 1;
      saved++;
    }

    let deactivated = 0;
    for (const snapshot of fullProfileSnapshots) {
      if (!snapshot.urls.length || snapshot.urls.length >= 500) continue;
      const result = await client.query(
        `UPDATE artflow.marketplace_listings
         SET status='Inactive',last_seen_at=now(),sync_source=$4
         WHERE business_id=$1 AND platform=$2 AND status='Active' AND NOT (listing_url = ANY($3::text[]))`,
        [b.base44_id, snapshot.platform, snapshot.urls, `${normalize(snapshot.platform)}_profile_snapshot`]
      );
      deactivated += Number(result.rowCount || 0);
    }

    if (fullProfileSnapshots.length) {
      const mobileShopUrls = { ...(b.data?.mobile_shop_urls || {}) };
      for (const snapshot of fullProfileSnapshots) mobileShopUrls[snapshot.platform] = snapshot.profileUrl;
      const nextData = { ...(b.data || {}), mobile_shop_urls: mobileShopUrls };
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [b.base44_id, JSON.stringify(nextData)]);
      b.data = nextData;
    }

    const breakdown = Object.entries(counts).map(([site, count]) => `${site}: ${count}`).join(' · ');
    const profileNote = fullProfileSnapshots.length ? ' pulled from your full profile' : ' added to Gallery';
    const removedNote = deactivated ? ` · ${deactivated} old listing${deactivated === 1 ? '' : 's'} removed from Available` : '';
    return send(200, {
      ok: true,
      saved,
      deactivated,
      counts,
      full_profile: fullProfileSnapshots.length > 0,
      message: `${saved} listing${saved === 1 ? '' : 's'}${profileNote}${breakdown ? ` (${breakdown})` : ''}${removedNote}.`,
    });
  } catch (error) {
    console.error('mobile listing sync error', error?.message || error);
    return send(500, { error: 'Mobile marketplace sync failed' });
  } finally {
    client.release();
  }
}
