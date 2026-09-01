import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const validPlatform = (value = '') =>
  /vinted/i.test(value) ? 'Vinted'
  : /depop/i.test(value) ? 'Depop'
  : /etsy/i.test(value) ? 'Etsy'
  : /ebay/i.test(value) ? 'eBay'
  : '';

function sourceHostMatches(platform, url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (platform === 'Vinted') return host === 'vinted.com' || host.endsWith('.vinted.com');
    if (platform === 'Depop') return host === 'depop.com' || host.endsWith('.depop.com');
    if (platform === 'Etsy') return host === 'etsy.com' || host.endsWith('.etsy.com');
    if (platform === 'eBay') return host === 'ebay.com' || host.endsWith('.ebay.com');
  } catch {}
  return false;
}

function listingIdFromUrl(platform, url = '') {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (platform === 'Vinted') return path.match(/\/items\/(\d+)/i)?.[1] || '';
    if (platform === 'Depop') return path.match(/\/products\/([^/?#]+)/i)?.[1] || '';
    if (platform === 'Etsy') return path.match(/\/listing\/(\d+)/i)?.[1] || '';
    if (platform === 'eBay') return path.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || path.match(/\/itm\/(\d{8,16})/i)?.[1] || '';
  } catch {}
  return '';
}

const normalizeUrl = (value = '') => {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','mkcid','mkrid','campid','customid','toolid'].forEach((key) => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
};

export default async function(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const syncKey = String(body?.sync_key || '').trim();
    const incoming = Array.isArray(body?.listings) ? body.listings.slice(0, 200) : [];
    if (!syncKey || !incoming.length) {
      return Response.json({ error: 'Missing sync key or listings' }, { status: 400, headers: cors });
    }

    const businesses = await base44.asServiceRole.entities.Business.list('-updated_date', 500);
    const business = businesses.find((item) =>
      item.extension_sync_enabled !== false &&
      String(item.extension_sync_key || '').trim() === syncKey
    );
    if (!business?.id) return Response.json({ error: 'Invalid Art Flow Browser Sync key' }, { status: 401, headers: cors });

    const all = await base44.asServiceRole.entities.MarketplaceListing.list('-last_seen_at', 5000).catch(() => []);
    const target = all.filter((row) => row.business_id === business.id);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of incoming) {
      const platform = validPlatform(raw?.platform);
      const listingUrl = normalizeUrl(raw?.listing_url || raw?.url || '');
      const title = String(raw?.title || raw?.product_name || '').trim().slice(0, 300);
      if (!platform || !title || !listingUrl || !sourceHostMatches(platform, listingUrl)) {
        skipped += 1;
        continue;
      }

      const rawPrice = Number(String(raw?.price ?? '').replace(/[^0-9.-]/g, ''));
      const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : 0;
      const listingId = String(raw?.listing_id || listingIdFromUrl(platform, listingUrl)).trim().slice(0, 200);
      const imageUrl = /^https?:\/\//i.test(String(raw?.image_url || '').trim()) ? String(raw.image_url).trim().slice(0, 2000) : '';
      const payload = {
        business_id: business.id,
        access_emails: Array.from(new Set([...(business.member_emails || []), ...(business.sales_emails || []), business.primary_email].filter(Boolean))),
        platform,
        listing_id: listingId || null,
        title,
        price,
        currency: String(raw?.currency || 'USD').trim().slice(0, 8) || 'USD',
        image_url: imageUrl || null,
        listing_url: listingUrl,
        status: 'Active',
        last_seen_at: now,
        sync_source: 'browser_listing_sync',
      };

      let existing = target.find((row) =>
        row.platform === platform && listingId && String(row.listing_id || '') === listingId
      );
      if (!existing) existing = target.find((row) => row.platform === platform && normalizeUrl(row.listing_url) === listingUrl);

      if (existing) {
        if (!imageUrl && existing.image_url) payload.image_url = existing.image_url;
        await base44.asServiceRole.entities.MarketplaceListing.update(existing.id, payload);
        Object.assign(existing, payload);
        updated += 1;
      } else {
        const made = await base44.asServiceRole.entities.MarketplaceListing.create({
          ...payload,
          created_by_id: business.created_by_id,
        });
        target.push(made);
        created += 1;
      }
    }

    return Response.json({
      ok: true,
      created,
      updated,
      skipped,
      total: created + updated,
      message: `${created + updated} current listing${created + updated === 1 ? '' : 's'} linked to your Gallery.`,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: String(error?.message || error || 'Listing capture failed') }, { status: 500, headers: cors });
  }
}
