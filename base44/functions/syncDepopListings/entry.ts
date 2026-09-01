import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const HOST = 'https://partnerapi.depop.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

const clean = (value = '') => String(value || '').trim();
const money = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function getApiKey() {
  return clean(Deno.env.get('DEPOP_PARTNER_API_KEY') || '');
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
    const error = new Error(`Depop API ${response.status}: ${String(payload?.detail || payload?.error || payload?.message || text).slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function titleFromProduct(product = {}) {
  const description = clean(product.description);
  const firstUsefulLine = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^#/.test(line));
  if (firstUsefulLine) return firstUsefulLine.slice(0, 300);
  const fallback = [product.brand, product.product_type].map(clean).filter(Boolean).join(' ');
  return (fallback || `Depop listing ${product.product_id || ''}`).trim().slice(0, 300);
}

function normalizeProduct(product = {}) {
  const slug = clean(product.slug);
  if (!slug) return null;
  const productId = clean(product.product_id);
  const picture = Array.isArray(product.pictures) ? product.pictures.find((item) => clean(item?.url)) : null;
  return {
    platform: 'Depop',
    listing_id: productId || slug,
    title: titleFromProduct(product),
    price: money(product.current_price ?? product.discount_price ?? product.price_amount),
    currency: clean(product.price_currency || 'USD') || 'USD',
    image_url: clean(picture?.url || ''),
    listing_url: `https://www.depop.com/products/${encodeURIComponent(slug)}/`,
    status: 'Active',
  };
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // The current Partner API key belongs to the approved seller account, so do not
  // expose that seller's catalog to unrelated Art Flow users.
  if (user.role !== 'admin') {
    return Response.json({
      available: false,
      connected: false,
      needs_partner_access: true,
      listings: [],
      message: 'Bulk Depop listings require an approved Depop Partner connection for this seller account.',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({
      available: false,
      connected: false,
      needs_setup: true,
      listings: [],
      message: 'Bulk Depop listing sync is ready in Art Flow, but the approved Depop Partner API key is not configured yet.',
    });
  }

  try {
    const listings = [];
    const seenCursors = new Set();
    let cursor = '';
    let pages = 0;
    let hasMore = true;

    while (hasMore && pages < MAX_PAGES) {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        state: 'selling',
        sort_by: 'id_desc',
      });
      if (cursor) params.set('cursor', cursor);

      const payload = await depopGet(`/api/v1/products/?${params.toString()}`, apiKey);
      const products = Array.isArray(payload?.data) ? payload.data : [];
      for (const product of products) {
        const normalized = normalizeProduct(product);
        if (normalized) listings.push(normalized);
      }

      pages += 1;
      const nextCursor = clean(payload?.meta?.cursor || '');
      hasMore = payload?.meta?.has_more === true;
      if (!hasMore || !nextCursor || nextCursor === cursor || seenCursors.has(nextCursor)) {
        hasMore = false;
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    return Response.json({
      available: true,
      connected: true,
      complete: !hasMore,
      pages,
      count: listings.length,
      listings,
      message: hasMore
        ? `Loaded ${listings.length} active Depop listings, but the catalog exceeded the current sync safety limit.`
        : `Loaded all ${listings.length} active Depop listings.`,
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const message = status === 401 || status === 403
      ? 'Depop rejected the Partner credential or it does not have products_read access for this seller account.'
      : String(error?.message || 'Depop listing sync failed');
    return Response.json({ available: true, connected: false, listings: [], error: message }, { status: 502 });
  }
}
