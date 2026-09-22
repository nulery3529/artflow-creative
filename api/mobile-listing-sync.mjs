import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';
import { encrypt, decrypt } from './_official-sync-shared.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });
const SUPPORTED = ['Vinted', 'Depop', 'Etsy', 'eBay', 'Poshmark'];
const LINKED_SITE_PLATFORMS = ['Vinted', 'Depop', 'Etsy', 'eBay', 'Poshmark'];
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
  if (/poshmark/i.test(value)) return 'Poshmark';
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
  Poshmark: ['poshmark.com','www.poshmark.com'],
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
    if (platform === 'Poshmark') return /\/listing\/[^/?#]+-[a-f0-9]{24}$/i.test(p);
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
      if (/etsy/i.test(u.hostname)) {
        const shopIndex = segments.findIndex((segment) => segment.toLowerCase() === 'shop');
        if (shopIndex >= 0 && segments[shopIndex + 1]) return segments[shopIndex + 1].replace(/^@+/, '');
      }
      if (/ebay/i.test(u.hostname)) {
        const userIndex = segments.findIndex((segment) => ['usr', 'str'].includes(segment.toLowerCase()));
        if (userIndex >= 0 && segments[userIndex + 1]) return segments[userIndex + 1].replace(/^@+/, '');
      }
      if (/poshmark/i.test(u.hostname)) {
        const closetIndex = segments.findIndex((segment) => segment.toLowerCase() === 'closet');
        if (closetIndex >= 0 && segments[closetIndex + 1]) return segments[closetIndex + 1].replace(/^@+/, '');
      }
    } catch {}
  }
  return raw.trim();
}

function isValidMarketplaceUsername(value = '') {
  return /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/i.test(cleanMarketplaceUsername(value));
}

function linkedSitePlatform(value = '') {
  const normalized = normalize(value);
  if (normalized === 'vinted') return 'Vinted';
  if (normalized === 'depop') return 'Depop';
  if (normalized === 'etsy') return 'Etsy';
  if (normalized === 'ebay') return 'eBay';
  if (normalized === 'poshmark') return 'Poshmark';
  return '';
}

function linkedSiteProfileUrl(platform, usernameInput = '') {
  const username = cleanMarketplaceUsername(usernameInput);
  if (!isValidMarketplaceUsername(username)) return '';
  const encoded = encodeURIComponent(username);
  if (platform === 'Depop') return `https://www.depop.com/${encoded}/`;
  if (platform === 'Etsy') return `https://www.etsy.com/shop/${encoded}`;
  if (platform === 'eBay') return `https://www.ebay.com/sch/i.html?_ssn=${encoded}&_sop=10`;
  if (platform === 'Poshmark') return `https://poshmark.com/closet/${encoded}`;
  return '';
}

async function resolvePoshmarkProfileUrl(raw = '') {
  const input = clean(raw);
  if (!input) return '';
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (host === 'poshmark.com' || host.endsWith('.poshmark.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const closetIndex = parts.findIndex((part) => part.toLowerCase() === 'closet');
      const username = closetIndex >= 0 ? clean(parts[closetIndex + 1]).replace(/^@+/, '') : '';
      return username && isValidMarketplaceUsername(username)
        ? linkedSiteProfileUrl('Poshmark', username)
        : normalizeUrl(input);
    }
    if (host === 'posh.mk' || host.endsWith('.posh.mk')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(input, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        const finalUrl = clean(response.url || input);
        try { await response.body?.cancel?.(); } catch {}
        if (allowedHost('Poshmark', finalUrl)) {
          const final = new URL(finalUrl);
          const parts = final.pathname.split('/').filter(Boolean);
          const closetIndex = parts.findIndex((part) => part.toLowerCase() === 'closet');
          const username = closetIndex >= 0 ? clean(parts[closetIndex + 1]).replace(/^@+/, '') : '';
          if (username && isValidMarketplaceUsername(username)) return linkedSiteProfileUrl('Poshmark', username);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {}
  return input;
}

function normalizeEtsyCredentials(keyInput = '', secretInput = '') {
  let key = clean(keyInput);
  let secret = clean(secretInput);
  const parts = key.split(':').map(clean).filter(Boolean);
  if (parts.length === 2) {
    key = parts[0];
    secret = parts[1];
  } else if (parts.length > 2) {
    key = parts[0];
  }
  return { key, secret };
}

async function etsyCredentialPair(client) {
  let storedKey = '';
  let storedSecret = '';
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS artflow.app_settings (
      key text PRIMARY KEY,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now()
    )`);
    const result = await client.query(`SELECT data FROM artflow.app_settings WHERE key='etsy_credentials' LIMIT 1`);
    const stored = result.rows[0]?.data || {};
    storedKey = clean(stored.keystring || stored.key);
    if (stored.shared_secret_enc) storedSecret = clean(decrypt(stored.shared_secret_enc));
  } catch (error) {
    console.warn('Could not read saved Etsy credentials for Gallery sync', error?.message || error);
  }

  const saved = normalizeEtsyCredentials(storedKey, storedSecret);
  if (saved.key && saved.secret) return saved;

  return normalizeEtsyCredentials(
    process.env.ETSY_API_KEY || process.env.ETSY_KEYSTRING,
    process.env.ETSY_SHARED_SECRET || process.env.ETSY_CLIENT_SECRET
  );
}

async function etsyPublicApiHeader(client) {
  const creds = await etsyCredentialPair(client);
  return creds.key && creds.secret ? `${creds.key}:${creds.secret}` : '';
}

async function etsyPublicGet(client, path) {
  const apiKey = await etsyPublicApiHeader(client);
  if (!apiKey) {
    const error = new Error('Etsy public listing access is not configured yet.');
    error.code = 'ETSY_PUBLIC_API_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = clean(data?.error || data?.error_description || data?.message || text || `Etsy API returned ${response.status}`);
    const error = new Error(detail || `Etsy API returned ${response.status}`);
    error.status = response.status;
    error.code = response.status === 401 || response.status === 403 ? 'ETSY_API_NOT_ACTIVE' : 'ETSY_API_ERROR';
    throw error;
  }
  return data;
}

async function etsyToken(params) {
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(clean(data?.error_description || data?.error || text || `Etsy token request failed (${response.status})`));
    error.code = 'ETSY_OAUTH_REFRESH_FAILED';
    throw error;
  }
  return data;
}

async function validEtsyAccessToken(client, p) {
  const oauth = p?.data?.etsy_oauth || {};
  if (!oauth.refresh_token_enc) return '';

  const creds = await etsyCredentialPair(client);
  if (!creds.key || !creds.secret) {
    const error = new Error('Etsy app credentials are not configured.');
    error.code = 'ETSY_PUBLIC_API_NOT_CONFIGURED';
    throw error;
  }

  const expiresAt = oauth.expires_at ? new Date(oauth.expires_at).getTime() : 0;
  if (oauth.access_token_enc && expiresAt > Date.now() + 60_000) {
    return decrypt(oauth.access_token_enc);
  }

  let refreshed;
  try {
    refreshed = await etsyToken({
      grant_type: 'refresh_token',
      client_id: creds.key,
      refresh_token: decrypt(oauth.refresh_token_enc),
    });
  } catch (error) {
    error.code = 'ETSY_OAUTH_REFRESH_FAILED';
    throw error;
  }

  const nextOauth = {
    ...oauth,
    access_token_enc: refreshed.access_token ? encrypt(refreshed.access_token) : oauth.access_token_enc,
    refresh_token_enc: refreshed.refresh_token ? encrypt(refreshed.refresh_token) : oauth.refresh_token_enc,
    expires_at: new Date(Date.now() + (Number(refreshed.expires_in) || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const nextData = { ...(p.data || {}), etsy_oauth: nextOauth };
  await client.query(`UPDATE artflow.legacy_users SET data=$2::jsonb,updated_date=now() WHERE base44_id=$1`, [p.base44_id, JSON.stringify(nextData)]);
  p.data = nextData;
  return refreshed.access_token || '';
}

async function etsyAuthorizedGet(client, path, accessToken) {
  const creds = await etsyCredentialPair(client);
  if (!creds.key || !creds.secret || !accessToken) {
    const error = new Error('Etsy is not fully connected for this Art Flow account.');
    error.code = 'ETSY_OAUTH_REFRESH_FAILED';
    throw error;
  }
  const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': `${creds.key}:${creds.secret}`,
      accept: 'application/json',
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = clean(data?.error || data?.error_description || data?.message || text || `Etsy API returned ${response.status}`);
    const error = new Error(detail || `Etsy API returned ${response.status}`);
    error.status = response.status;
    error.code = response.status === 401 || response.status === 403 ? 'ETSY_OAUTH_REFRESH_FAILED' : 'ETSY_API_ERROR';
    throw error;
  }
  return data;
}

function etsyMoney(value) {
  if (value && typeof value === 'object') {
    const amount = Number(value.amount || 0);
    const divisor = Number(value.divisor || 100) || 100;
    return Number.isFinite(amount) ? Number((amount / divisor).toFixed(2)) : 0;
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function collectEtsyProfileListings(client, p, usernameInput) {
  const requested = cleanMarketplaceUsername(usernameInput);
  if (!isValidMarketplaceUsername(requested)) throw new Error('Enter a valid Etsy shop username.');

  const oauth = p?.data?.etsy_oauth || {};
  const oauthShopId = clean(oauth.shop_id);
  const oauthShopName = clean(oauth.shop_name);
  const canUseOfficial = Boolean(
    oauth.refresh_token_enc && oauthShopId &&
    (!oauthShopName || normalize(oauthShopName) === normalize(requested))
  );

  let shopId = '';
  let username = requested;
  let accessToken = '';
  let official = false;

  if (canUseOfficial) {
    accessToken = await validEtsyAccessToken(client, p);
    shopId = oauthShopId;
    username = oauthShopName || requested;
    official = true;
  } else {
    const shopSearch = await etsyPublicGet(client, `/shops?shop_name=${encodeURIComponent(requested)}&limit=25`);
    const shops = Array.isArray(shopSearch?.results) ? shopSearch.results : [];
    const shop = shops.find((entry) => normalize(entry?.shop_name) === normalize(requested)) || shops[0];
    if (!shop?.shop_id) {
      const error = new Error(`Etsy shop ${requested} was not found.`);
      error.code = 'ETSY_SHOP_NOT_FOUND';
      throw error;
    }
    shopId = String(shop.shop_id);
    username = clean(shop.shop_name || requested);
  }

  const profileUrl = `https://www.etsy.com/shop/${encodeURIComponent(username)}`;
  const active = [];
  let offset = 0;
  let total = null;
  let complete = false;

  for (let page = 0; page < 100 && active.length < 10000; page += 1) {
    const data = official
      ? await etsyAuthorizedGet(client, `/shops/${shopId}/listings?state=active&limit=100&offset=${offset}&includes=Images`, accessToken)
      : await etsyPublicGet(client, `/shops/${shopId}/listings/active?limit=100&offset=${offset}`);
    const results = Array.isArray(data?.results) ? data.results : [];
    active.push(...results);
    const reportedCount = Number(data?.count);
    if (Number.isFinite(reportedCount) && reportedCount >= 0) total = reportedCount;
    offset += results.length;
    if (!results.length || results.length < 100 || (total !== null && offset >= total)) {
      complete = true;
      break;
    }
  }
  if (total !== null && active.length >= total) complete = true;

  if (!active.length) {
    if (official) {
      const error = new Error(`Etsy returned zero active listings for ${username}, even though this shop is connected. Reconnect Etsy if this continues.`);
      error.code = 'ETSY_CONNECTED_SHOP_EMPTY';
      throw error;
    }
    return { username, profileUrl, listings: [], complete: true, total: total || 0 };
  }

  const detailedById = new Map();
  for (const item of active) {
    if (Array.isArray(item?.images) && item.images.length) detailedById.set(String(item?.listing_id || ''), item);
  }

  if (!official) {
    for (let index = 0; index < active.length; index += 100) {
      const ids = active.slice(index, index + 100).map((item) => item?.listing_id).filter(Boolean);
      if (!ids.length) continue;
      try {
        const batch = await etsyPublicGet(client, `/listings/batch?listing_ids=${encodeURIComponent(ids.join(','))}&includes=Images`);
        const results = Array.isArray(batch?.results) ? batch.results : [];
        for (const item of results) detailedById.set(String(item?.listing_id || ''), item);
      } catch (error) {
        console.warn('Etsy listing image batch lookup failed', error?.message || error);
      }
    }
  }

  const listings = active.map((basic) => {
    const item = detailedById.get(String(basic?.listing_id || '')) || basic;
    const listingId = String(item?.listing_id || basic?.listing_id || '');
    const images = Array.isArray(item?.images) ? item.images : [];
    const firstImage = [...images].sort((a, b) => Number(a?.rank || 0) - Number(b?.rank || 0))[0] || {};
    const url = normalizeUrl(item?.url || basic?.url || (listingId ? `https://www.etsy.com/listing/${listingId}` : ''));
    if (!url || !listingId) return null;
    return {
      platform: 'Etsy',
      url,
      meta: {
        finalUrl: url,
        title: clean(item?.title || basic?.title || `Etsy listing ${listingId}`).slice(0, 300),
        description: clean(item?.description || basic?.description || '').slice(0, 800),
        imageUrl: clean(firstImage?.url_570xN || firstImage?.url_fullxfull || firstImage?.url_170x135 || ''),
        price: etsyMoney(item?.price || basic?.price),
        currency: clean(item?.price?.currency_code || basic?.price?.currency_code || 'USD').toUpperCase() || 'USD',
      },
    };
  }).filter(Boolean);

  return { username, profileUrl, listings, complete, total: total ?? listings.length, official };
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

function poshmarkListingUrl(item = {}) {
  const id = clean(item?.id);
  if (!/^[a-f0-9]{24}$/i.test(id)) return '';
  const slug = clean(item?.title || 'listing')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 170) || 'listing';
  return normalizeUrl(`https://poshmark.com/listing/${slug}-${id}`);
}

function poshmarkImageUrl(item = {}) {
  const candidates = [
    item?.cover_shot?.url,
    item?.cover_shot?.url_large,
    item?.cover_shot?.url_1280x,
    item?.cover_shot?.url_600x,
    item?.cover_shot?.url_310sq,
    item?.cover_shot?.url_small,
    item?.picture_url,
    item?.image_url,
    item?.pictures?.[0]?.url,
    item?.pictures?.[0]?.url_large,
    item?.pictures?.[0]?.url_1280x,
    item?.photos?.[0]?.url,
    item?.photos?.[0]?.url_large,
  ];
  return clean(candidates.find((value) => /^https:\/\//i.test(clean(value))) || '');
}

async function collectPoshmarkProfileListings(usernameInput) {
  const username = cleanMarketplaceUsername(usernameInput);
  if (!isValidMarketplaceUsername(username)) throw new Error('Enter a valid Poshmark username.');

  const profileUrl = linkedSiteProfileUrl('Poshmark', username);
  const listings = [];
  const seen = new Set();
  let total = null;
  let apiSucceeded = false;

  // Poshmark's public closet endpoint is read-only and paginated. Use it first
  // so large closets are not limited to the listings embedded in the first HTML page.
  try {
    let offset = 0;
    for (let page = 0; page < 110 && offset < 5000; page += 1) {
      const endpoint = `https://poshmark.com/vm-rest/users/${encodeURIComponent(username)}/posts?count=48&offset=${offset}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
            accept: 'application/json,text/plain,*/*',
            'accept-language': 'en-US,en;q=0.9',
            referer: profileUrl,
          },
        });
      } finally {
        clearTimeout(timer);
      }
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
      if (!response.ok) throw new Error(clean(payload?.error || payload?.message || `Poshmark closet returned ${response.status}`));

      apiSucceeded = true;
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.posts)
          ? payload.posts
          : Array.isArray(payload?.results)
            ? payload.results
            : [];
      const reportedTotal = Number(payload?.more?.total ?? payload?.total);
      if (Number.isFinite(reportedTotal) && reportedTotal >= 0) total = reportedTotal;

      for (const item of rows) {
        const status = normalize(item?.status || item?.inventory?.status || '');
        if (['sold', 'sold_out', 'reserved', 'inactive', 'deleted'].includes(status)) continue;
        if (normalize(item?.inventory?.status) && normalize(item?.inventory?.status) !== 'available') continue;
        if (item?.active_item === false) continue;
        const url = poshmarkListingUrl(item);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        listings.push({
          platform: 'Poshmark',
          url,
          meta: {
            finalUrl: url,
            title: clean(item?.title || `Poshmark listing ${item?.id || ''}`).slice(0, 300),
            description: clean(item?.description || '').slice(0, 800),
            imageUrl: poshmarkImageUrl(item),
            price: item?.price_amount?.val ?? item?.price?.amount ?? item?.price ?? 0,
            currency: clean(item?.price_amount?.currency_code || item?.price?.currency_code || 'USD') || 'USD',
          },
        });
      }

      offset += rows.length;
      if (!rows.length || rows.length < 48 || (total !== null && offset >= total)) break;
    }
  } catch (error) {
    console.warn('Poshmark public closet API unavailable; falling back to closet HTML', error?.message || error);
  }

  if (apiSucceeded && listings.length) {
    return {
      username,
      profileUrl,
      listings,
      total: total ?? listings.length,
    };
  }

  // Fallback for rare API blocks: keep the existing HTML hydration parser.
  const { html, finalUrl } = await fetchHtml(profileUrl, 12000);
  const marker = 'window.__INITIAL_STATE__=';
  const initialStart = html.indexOf(marker);
  if (initialStart < 0) throw new Error(`Poshmark closet @${username} could not be read.`);
  const jsonStart = initialStart + marker.length;
  let jsonEnd = html.indexOf('};(function', jsonStart);
  if (jsonEnd < 0) jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonEnd < 0) throw new Error(`Poshmark closet @${username} did not return listing data.`);
  if (html.slice(jsonEnd, jsonEnd + 2) === '};') jsonEnd += 1;
  let state;
  try {
    state = JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    throw new Error(`Poshmark closet @${username} returned unreadable listing data.`);
  }
  const rows = Array.isArray(state?.$_closet?.listingsPostData?.data) ? state.$_closet.listingsPostData.data : [];
  for (const item of rows) {
    if (normalize(item?.status) !== 'published') continue;
    if (normalize(item?.inventory?.status) !== 'available') continue;
    if (item?.active_item === false) continue;
    const url = poshmarkListingUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    listings.push({
      platform: 'Poshmark',
      url,
      meta: {
        finalUrl: url,
        title: clean(item?.title || `Poshmark listing ${item?.id || ''}`).slice(0, 300),
        description: clean(item?.description || '').slice(0, 800),
        imageUrl: poshmarkImageUrl(item),
        price: item?.price_amount?.val ?? item?.price ?? 0,
        currency: clean(item?.price_amount?.currency_code || 'USD') || 'USD',
      },
    });
  }
  return {
    username,
    profileUrl: normalizeUrl(finalUrl || profileUrl) || profileUrl,
    listings,
    total: Number(state?.$_closet?.listingsPostData?.more?.total) || listings.length,
  };
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
    if (platform === 'Poshmark') return p.match(/-([a-f0-9]{24})$/i)?.[1] || '';
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
    Poshmark: /\/listing\/[^"'<>\\\s?]+-[a-f0-9]{24}/gi,
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


async function ebayApplicationToken() {
  const clientId = clean(process.env.EBAY_CLIENT_ID);
  const clientSecret = clean(process.env.EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const error = new Error('eBay API credentials are not configured on Art Flow yet.');
    error.code = 'EBAY_API_NOT_CONFIGURED';
    throw error;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok || !data?.access_token) {
    const detail = clean(data?.error_description || data?.error || text || `eBay token request failed (${response.status})`);
    const authFailed = response.status === 401 || response.status === 403 || /client authentication failed/i.test(detail);
    const error = new Error(authFailed
      ? 'Art Flow’s eBay server connection needs administrator repair. You do not need to enter an API key or change your eBay account.'
      : (detail || 'eBay application token could not be created.'));
    error.status = response.status;
    error.code = authFailed ? 'EBAY_API_AUTH_FAILED' : 'EBAY_API_ERROR';
    throw error;
  }
  return data.access_token;
}

function ebayLegacyItemId(item = {}) {
  const direct = clean(item?.legacyItemId);
  if (direct) return direct;
  const restful = clean(item?.itemId);
  const match = restful.match(/^v1\|([^|]+)\|/i);
  return clean(match?.[1] || '');
}

async function collectEbayProfileListings(usernameInput) {
  const username = cleanMarketplaceUsername(usernameInput);
  if (!isValidMarketplaceUsername(username)) throw new Error('Enter a valid eBay username or shop name.');

  const profileUrl = linkedSiteProfileUrl('eBay', username);
  const accessToken = await ebayApplicationToken();
  const listings = [];
  const seen = new Set();
  let offset = 0;
  let total = null;
  let complete = false;

  // Art Flow owns the eBay app credentials on the server. Users only link
  // their seller account/profile; they never enter API credentials.
  // Keep seller filtering independent of buyingOptions so an all-category
  // seller import does not accidentally exclude valid active listings.
  for (let page = 0; page < 50 && offset < 10000; page += 1) {
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('category_ids', '0');
    url.searchParams.set('filter', `sellers:{${username}}`);
    url.searchParams.set('fieldgroups', 'EXTENDED');
    url.searchParams.set('limit', '200');
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const detail = clean(data?.errors?.[0]?.message || data?.errors?.[0]?.longMessage || data?.error_description || data?.error || text || `eBay Browse API returned ${response.status}`);
      const error = new Error(detail || `eBay Browse API returned ${response.status}`);
      error.status = response.status;
      error.code = response.status === 401 || response.status === 403 ? 'EBAY_API_AUTH_FAILED' : 'EBAY_BROWSE_ERROR';
      throw error;
    }

    const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
    const reportedTotal = Number(data?.total);
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) total = reportedTotal;

    for (const item of items) {
      const listingId = ebayLegacyItemId(item);
      const listingUrl = normalizeUrl(item?.itemWebUrl || (listingId ? `https://www.ebay.com/itm/${listingId}` : ''));
      if (!listingId || !listingUrl || seen.has(listingUrl)) continue;
      seen.add(listingUrl);
      listings.push({
        platform: 'eBay',
        url: listingUrl,
        meta: {
          finalUrl: listingUrl,
          title: clean(item?.title || `eBay listing ${listingId}`).slice(0, 300),
          description: clean(item?.shortDescription || '').slice(0, 800),
          imageUrl: clean(item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || ''),
          price: Number(item?.price?.value || 0) || 0,
          currency: clean(item?.price?.currency || 'USD').toUpperCase() || 'USD',
        },
      });
    }

    offset += items.length;
    if (!items.length || items.length < 200 || (total !== null && offset >= total)) {
      complete = true;
      break;
    }
  }

  return {
    username,
    profileUrl,
    listings,
    total: total ?? listings.length,
    complete,
  };
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

async function ensureProfile(client, user) {
  let p = await profile(client, user);
  if (p) return p;
  const id = `neon-user:${user.id}`;
  await client.query(
    `INSERT INTO artflow.legacy_users
      (base44_id,email,full_name,role,active_business_id,disabled,auth_user_id,created_date,updated_date,data)
     VALUES ($1,$2,$3,'user',NULL,false,$4,now(),now(),'{}'::jsonb)
     ON CONFLICT (base44_id) DO NOTHING`,
    [id, user.email || '', user.name || null, user.id]
  );
  p = await profile(client, user);
  if (!p) throw new Error('Art Flow user profile could not be created');
  return p;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [row?.primary_email, d.primary_email, ...(d.member_emails || []), ...(d.sales_emails || []), ...(d.expense_emails || [])]
    .map(normalize).filter(Boolean);
}

async function businessForUser(client, p, user) {
  const active = p?.active_business_id || p?.data?.active_business_id || null;
  const email = normalize(user?.email);
  const r = await client.query(`SELECT base44_id,name,primary_email,created_by_id,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const owns = (x) => Boolean(x && ((email && businessEmails(x).includes(email)) || x.created_by_id === p?.base44_id || x.created_by_id === user?.id));
  const activeRow = r.rows.find((x) => active && x.base44_id === active && owns(x)) || null;
  const emailRows = r.rows.filter((x) => owns(x));
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
    const p = await ensureProfile(client, s.user);
    const b = await businessForUser(client, p, s.user);
    const userScope = `user:${s.user.id}`;
    const listingScopes = Array.from(new Set([userScope, b?.base44_id].filter(Boolean)));
    const profileData = p.data || {};
    const businessData = b?.data || {};

    if (req.method === 'GET') {
      const mobileShopUrls = { ...(businessData.mobile_shop_urls || {}), ...(profileData.mobile_shop_urls || {}) };
      const marketplaceLinks = { ...(businessData.marketplace_links || {}), ...(profileData.marketplace_links || {}) };
      const urls = { ...mobileShopUrls };
      for (const site of SUPPORTED) {
        const shared = clean(marketplaceLinks?.[site] || marketplaceLinks?.[normalize(site)] || '');
        if (shared) {
          urls[site] = site === 'eBay'
            ? (linkedSiteProfileUrl('eBay', shared) || shared)
            : shared;
        }
      }
      const savedPoshmark = clean(urls.Poshmark || urls.poshmark || '');
      if (savedPoshmark) {
        const resolvedPoshmark = await resolvePoshmarkProfileUrl(savedPoshmark);
        if (resolvedPoshmark) urls.Poshmark = resolvedPoshmark;
      }
      return res.status(200).json({
        supported: SUPPORTED,
        urls,
      });
    }

    const action = clean(body.action);
    if (action === 'import_etsy_csv') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      if (!rows.length) return send(400, { error: 'No Etsy listings were found in that CSV.' });

      const savedShop = clean(
        profileData?.marketplace_links?.Etsy || profileData?.marketplace_links?.etsy ||
        profileData?.mobile_shop_urls?.Etsy || profileData?.mobile_shop_urls?.etsy ||
        businessData?.marketplace_links?.Etsy || businessData?.marketplace_links?.etsy ||
        businessData?.mobile_shop_urls?.Etsy || businessData?.mobile_shop_urls?.etsy || ''
      );
      const shopBase = allowedHost('Etsy', savedShop) && !isListingUrl('Etsy', savedShop)
        ? normalizeUrl(savedShop)
        : 'https://www.etsy.com/search';

      const activeUrls = [];
      let saved = 0;
      await client.query('BEGIN');
      try {
        for (const row of rows) {
          const title = clean(row?.title).slice(0, 300);
          if (!title) continue;
          const sku = clean(row?.sku).slice(0, 200);
          const imageUrl = clean(row?.image_url);
          let safeImage = '';
          try {
            const image = new URL(imageUrl);
            const host = image.hostname.toLowerCase();
            if (image.protocol === 'https:' && (host === 'etsystatic.com' || host.endsWith('.etsystatic.com') || host === 'etsy.com' || host.endsWith('.etsy.com'))) {
              safeImage = image.toString();
            }
          } catch {}
          const priceNumber = Number(String(row?.price ?? '').replace(/[^0-9.-]/g, ''));
          const price = Number.isFinite(priceNumber) && priceNumber >= 0 ? priceNumber : 0;
          const quantityNumber = Number.parseInt(String(row?.quantity ?? '0'), 10);
          const quantity = Number.isFinite(quantityNumber) && quantityNumber >= 0 ? quantityNumber : 0;
          const currency = clean(row?.currency || 'USD').toUpperCase().slice(0, 8) || 'USD';
          const sourceIndex = Number.parseInt(String(row?.source_index ?? '0'), 10) || 0;
          const fingerprint = crypto.createHash('sha256')
            .update(`${sku || title}|${title}|${price}|${safeImage}|${sourceIndex}`)
            .digest('hex');
          const listingId = `csv_${fingerprint.slice(0, 24)}`;
          const listingUrlObject = new URL(shopBase);
          if (/\/shop\//i.test(listingUrlObject.pathname)) listingUrlObject.searchParams.set('search_query', title);
          else listingUrlObject.searchParams.set('q', title);
          listingUrlObject.searchParams.set('ref', 'artflow_csv');
          listingUrlObject.searchParams.set('af', fingerprint.slice(0, 12));
          const listingUrl = listingUrlObject.toString();
          const id = crypto.createHash('sha256').update(`${userScope}|Etsy|${listingId}`).digest('hex');

          await client.query(
            `INSERT INTO artflow.marketplace_listings
               (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
             VALUES ($1,$2,'Etsy',$3,$4,$5,$6,$7,$8,'Active',now(),'etsy_csv_import',
               jsonb_build_object('etsy_csv_import',true,'quantity',$9::int,'sku',$10::text))
             ON CONFLICT (id) DO UPDATE SET
               listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,price=EXCLUDED.price,currency=EXCLUDED.currency,
               image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
               listing_url=EXCLUDED.listing_url,status='Active',last_seen_at=now(),sync_source='etsy_csv_import',data=EXCLUDED.data`,
            [id, userScope, listingId, title, price, currency, safeImage || null, listingUrl, quantity, sku]
          );
          activeUrls.push(listingUrl);
          saved += 1;
        }

        let deactivated = 0;
        if (activeUrls.length) {
          const result = await client.query(
            `UPDATE artflow.marketplace_listings
                SET status='Inactive',last_seen_at=now()
              WHERE business_id=$1 AND platform='Etsy' AND sync_source='etsy_csv_import'
                AND NOT (listing_url = ANY($2::text[]))`,
            [userScope, activeUrls]
          );
          deactivated = Number(result.rowCount || 0);
        }
        await client.query('COMMIT');
        return send(200, {
          ok: true,
          saved,
          deactivated,
          message: `Imported ${saved} Etsy listing${saved === 1 ? '' : 's'} into Gallery${deactivated ? ` and marked ${deactivated} old listing${deactivated === 1 ? '' : 's'} inactive` : ''}.`,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }

    if (action === 'update_listing_image') {
      const listingId = clean(body.id);
      const imageUrl = String(body.image_url || '').trim();
      if (!listingId) return send(400, { error: 'Listing id is required.' });
      if (!/^data:image\//i.test(imageUrl) && !/^https:\/\//i.test(imageUrl)) {
        return send(400, { error: 'Choose a valid image.' });
      }
      if (imageUrl.length > 3_500_000) {
        return send(413, { error: 'That image is too large. Choose a smaller photo.' });
      }
      const updated = await client.query(
        `UPDATE artflow.marketplace_listings
            SET image_url=$3,
                data=COALESCE(data,'{}'::jsonb) || jsonb_build_object('gallery_photo_manual',true,'gallery_photo_updated_at',now()),
                last_seen_at=now()
          WHERE id=$1 AND business_id=ANY($2::text[])
          RETURNING id,image_url`,
        [listingId, listingScopes, imageUrl]
      );
      if (!updated.rows[0]) return send(404, { error: 'Gallery listing not found.' });
      return send(200, { ok: true, id: updated.rows[0].id, image_url: updated.rows[0].image_url });
    }

    if (action === 'link_site' || action === 'unlink_site') {
      const platform = linkedSitePlatform(body.platform);
      if (!platform || !LINKED_SITE_PLATFORMS.includes(platform)) {
        return send(400, { error: 'Choose a supported selling site.' });
      }

      const mobileShopUrls = { ...(businessData.mobile_shop_urls || {}), ...(profileData.mobile_shop_urls || {}) };
      const marketplaceLinks = { ...(businessData.marketplace_links || {}), ...(profileData.marketplace_links || {}) };
      if (action === 'unlink_site') {
        delete mobileShopUrls[platform];
        delete mobileShopUrls[normalize(platform)];
        delete marketplaceLinks[platform];
        delete marketplaceLinks[normalize(platform)];
      } else {
        if (platform === 'Vinted') {
          return send(400, { error: 'Use Pull Full Profile for Vinted so Art Flow can resolve the correct member page.' });
        }
        const username = cleanMarketplaceUsername(body.username || body.profile_username || '');
        const profileUrl = linkedSiteProfileUrl(platform, username);
        if (!profileUrl) return send(400, { error: `Enter a valid ${platform} username or shop name.` });
        mobileShopUrls[platform] = profileUrl;
        marketplaceLinks[platform] = profileUrl;
      }

      const nextProfileData = { ...profileData, mobile_shop_urls: mobileShopUrls, marketplace_links: marketplaceLinks };
      await client.query(`UPDATE artflow.legacy_users SET data=$2::jsonb,updated_date=now() WHERE base44_id=$1`, [p.base44_id, JSON.stringify(nextProfileData)]);
      p.data = nextProfileData;
      if (b) {
        const nextBusinessData = { ...businessData, mobile_shop_urls: mobileShopUrls, marketplace_links: marketplaceLinks };
        await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [b.base44_id, JSON.stringify(nextBusinessData)]);
        b.data = nextBusinessData;
      }
      const urls = { ...mobileShopUrls };
      for (const site of SUPPORTED) {
        const shared = clean(marketplaceLinks?.[site] || marketplaceLinks?.[normalize(site)] || '');
        if (shared) urls[site] = shared;
      }
      return send(200, {
        ok: true,
        urls,
        message: action === 'unlink_site' ? `${platform} profile unlinked.` : `${platform} profile linked.`,
      });
    }

    const requestedPlatform = clean(body.platform);
    const rawProfileInput = clean(body.username || body.profile_username || '');
    const requestedUsername = cleanMarketplaceUsername(rawProfileInput);
    const isVintedUsernameRequest = requestedPlatform === 'Vinted' && Boolean(requestedUsername);
    const isPoshmarkUsernameRequest = requestedPlatform === 'Poshmark' && Boolean(requestedUsername);
    const isEtsyUsernameRequest = requestedPlatform === 'Etsy' && Boolean(requestedUsername);
    const isEbayUsernameRequest = requestedPlatform === 'eBay' && Boolean(requestedUsername);
    const isPublicShopUsernameRequest = requestedPlatform === 'Depop' && Boolean(requestedUsername);
    const submitted = splitUrls(body.urls || body.url || '');
    if (!submitted.length && !isVintedUsernameRequest && !isPoshmarkUsernameRequest && !isEtsyUsernameRequest && !isEbayUsernameRequest && !isPublicShopUsernameRequest) {
      return send(400, { error: 'Enter a marketplace username or paste a supported marketplace link.' });
    }

    const directListings = [];
    const shopPages = [];
    const privateSellerPages = [];
    const fullProfileSnapshots = [];
    const rejected = [];

    if (isPublicShopUsernameRequest) {
      const profileUrl = linkedSiteProfileUrl(requestedPlatform, requestedUsername);
      if (!profileUrl) return send(400, { error: `Enter a valid ${requestedPlatform} username or shop name.` });
      shopPages.push({ platform: requestedPlatform, url: profileUrl, profileUsername: requestedUsername });
    }

    if (isEtsyUsernameRequest) {
      try {
        const profile = await collectEtsyProfileListings(client, p, requestedUsername);
        if (!profile.listings.length) {
          return send(422, {
            error: `${profile.username || requestedUsername} does not have any currently active Etsy listings.`,
            reason: 'etsy_profile_empty',
          });
        }
        directListings.push(...profile.listings);
        fullProfileSnapshots.push({
          platform: 'Etsy',
          profileUrl: profile.profileUrl,
          username: profile.username,
          urls: profile.listings.map((item) => normalizeUrl(item.url)).filter(Boolean),
          partial: profile.complete === false,
        });
      } catch (error) {
        console.warn('Etsy username import failed', error?.message || error);
        if (error?.code === 'ETSY_PUBLIC_API_NOT_CONFIGURED') {
          return send(503, {
            error: 'Etsy username import is ready, but the Etsy API key is not configured on Art Flow yet.',
            reason: 'etsy_api_not_configured',
          });
        }
        if (error?.code === 'ETSY_API_NOT_ACTIVE') {
          return send(503, {
            error: 'Etsy username import is ready, but Etsy has not activated the Art Flow API key yet. Try again after Etsy approves the key.',
            reason: 'etsy_api_not_active',
          });
        }
        if (error?.code === 'ETSY_OAUTH_REFRESH_FAILED') {
          return send(401, {
            error: 'Your Etsy connection expired and could not be refreshed. Tap Disconnect Etsy, then Connect Etsy once to renew access.',
            reason: 'etsy_reconnect_required',
          });
        }
        if (error?.code === 'ETSY_CONNECTED_SHOP_EMPTY') {
          return send(502, {
            error: clean(error?.message || 'Etsy returned an empty connected shop unexpectedly.'),
            reason: 'etsy_connected_shop_empty',
          });
        }
        return send(error?.code === 'ETSY_SHOP_NOT_FOUND' ? 404 : 502, {
          error: clean(error?.message || 'Could not load that Etsy shop by username.'),
          reason: 'etsy_username_import_failed',
        });
      }
    }

    if (isEbayUsernameRequest) {
      try {
        const profile = await collectEbayProfileListings(requestedUsername);
        if (!profile.listings.length) {
          return send(422, {
            error: `eBay seller ${profile.username || requestedUsername} does not have any readable active listings right now.`,
            reason: 'ebay_profile_empty',
          });
        }
        directListings.push(...profile.listings);
        fullProfileSnapshots.push({
          platform: 'eBay',
          profileUrl: profile.profileUrl,
          username: profile.username,
          urls: profile.listings.map((item) => normalizeUrl(item.url)).filter(Boolean),
          partial: profile.complete === false,
        });
      } catch (error) {
        console.warn('eBay full-profile import failed', error?.message || error);
        return send(502, {
          error: clean(error?.message || 'eBay full-profile import failed.'),
          reason: 'ebay_profile_import_failed',
        });
      }
    }

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

    if (isPoshmarkUsernameRequest) {
      try {
        const profile = await collectPoshmarkProfileListings(requestedUsername);
        if (!profile.listings.length) {
          return send(422, {
            error: `@${profile.username || requestedUsername} does not have any currently available Poshmark items.`,
            reason: 'poshmark_profile_empty',
          });
        }
        directListings.push(...profile.listings);
        fullProfileSnapshots.push({
          platform: 'Poshmark',
          profileUrl: profile.profileUrl,
          username: profile.username,
          urls: profile.listings.map((item) => normalizeUrl(item.url)).filter(Boolean),
        });
      } catch (error) {
        console.warn('Poshmark full-profile import failed', error?.message || error);
        return send(502, {
          error: clean(error?.message || 'Poshmark full-profile import failed.'),
          reason: 'poshmark_profile_import_failed',
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
        const normalizedListingUrl = normalizeUrl(raw);
        if (platform === 'Etsy') {
          let title = 'Etsy listing';
          try {
            const parts = new URL(normalizedListingUrl).pathname.split('/').filter(Boolean);
            const listingIndex = parts.findIndex((part) => part.toLowerCase() === 'listing');
            const slug = listingIndex >= 0 ? parts[listingIndex + 2] : '';
            if (slug) title = decodeURIComponent(slug).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || title;
          } catch {}
          directListings.push({
            platform,
            url: normalizedListingUrl,
            meta: {
              finalUrl: normalizedListingUrl,
              title,
              description: '',
              imageUrl: '',
              price: 0,
              currency: 'USD',
            },
          });
        } else {
          directListings.push({ platform, url: normalizedListingUrl });
        }
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
          // The catalog service is an optimization, not a requirement. If it is
          // unavailable or not configured, fall through to the public-profile
          // HTML/metadata importer below so each Art Flow workspace can still
          // connect a Depop username without needing official Partner OAuth.
          console.warn('Depop catalog import unavailable; trying public profile fallback', error?.message || error);
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
          if (shop.profileUsername && ['Etsy', 'eBay'].includes(resolvedPlatform)) {
            fullProfileSnapshots.push({
              platform: resolvedPlatform,
              profileUrl: normalizeUrl(resolvedUrl) || shop.url,
              username: shop.profileUsername,
              urls: found.map((url) => normalizeUrl(url)).filter(Boolean),
              partial: true,
            });
          }
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
      if (!item.url || !isListingUrl(item.platform, item.url) || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
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
      const id = crypto.createHash('sha256').update(`${userScope}|${listing.platform}|${listing.listing_url}`).digest('hex');

      let updatedExistingId = false;
      if (listing.listing_id) {
        const existingByListingId = await client.query(
          `SELECT id FROM artflow.marketplace_listings
           WHERE business_id=$1 AND platform=$2 AND listing_id=$3
           LIMIT 1`,
          [userScope, listing.platform, listing.listing_id]
        );
        if (existingByListingId.rows[0]?.id) {
          await client.query(
            `UPDATE artflow.marketplace_listings SET
               title=CASE WHEN $2 LIKE '% listing' THEN title ELSE $2 END,
               price=CASE WHEN $3::numeric>0 THEN $3::numeric ELSE price END,
               currency=$4,
               image_url=COALESCE(NULLIF($5,''),image_url),
               listing_url=$6,
               status=CASE WHEN status='Sold' THEN 'Sold' ELSE 'Active' END,
               last_seen_at=now(),sync_source='mobile_listing_sync',
               data=COALESCE(data,'{}'::jsonb) || jsonb_build_object('gallery_manual',true,'gallery_added_at',now())
             WHERE id=$1`,
            [existingByListingId.rows[0].id, listing.title, listing.price || 0, listing.currency || 'USD', listing.image_url || '', listing.listing_url]
          );
          updatedExistingId = true;
        }
      }

      if (!updatedExistingId) {
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
          [id,userScope,listing.platform,listing.listing_id || null,listing.title,listing.price || 0,listing.currency || 'USD',listing.image_url || null,listing.listing_url]
        );
      }
      counts[listing.platform] = (counts[listing.platform] || 0) + 1;
      saved++;
    }

    let deactivated = 0;
    for (const snapshot of fullProfileSnapshots) {
      if (snapshot.partial || !snapshot.urls.length) continue;
      const result = await client.query(
        `UPDATE artflow.marketplace_listings
         SET status='Inactive',last_seen_at=now(),sync_source=$4
         WHERE business_id=$1 AND platform=$2 AND status='Active' AND NOT (listing_url = ANY($3::text[]))`,
        [userScope, snapshot.platform, snapshot.urls, `${normalize(snapshot.platform)}_profile_snapshot`]
      );
      deactivated += Number(result.rowCount || 0);
    }

    if (fullProfileSnapshots.length) {
      const mobileShopUrls = { ...(businessData.mobile_shop_urls || {}), ...(p.data?.mobile_shop_urls || {}) };
      const marketplaceLinks = { ...(businessData.marketplace_links || {}), ...(p.data?.marketplace_links || {}) };
      for (const snapshot of fullProfileSnapshots) {
        mobileShopUrls[snapshot.platform] = snapshot.profileUrl;
        marketplaceLinks[snapshot.platform] = snapshot.profileUrl;
      }
      const nextProfileData = { ...(p.data || {}), mobile_shop_urls: mobileShopUrls, marketplace_links: marketplaceLinks };
      await client.query(`UPDATE artflow.legacy_users SET data=$2::jsonb,updated_date=now() WHERE base44_id=$1`, [p.base44_id, JSON.stringify(nextProfileData)]);
      p.data = nextProfileData;
      if (b) {
        const nextBusinessData = { ...(b.data || {}), mobile_shop_urls: mobileShopUrls, marketplace_links: marketplaceLinks };
        await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`, [b.base44_id, JSON.stringify(nextBusinessData)]);
        b.data = nextBusinessData;
      }
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
