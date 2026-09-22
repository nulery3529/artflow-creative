import pg from 'pg';
import crypto from 'node:crypto';
import { pooledDatabaseUrl } from './_db.mjs';
import { collectPoshmarkProfileListings } from './mobile-listing-sync.mjs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const clean = (value = '') => String(value || '').trim();

function poshmarkUsername(raw = '') {
  try {
    const url = new URL(clean(raw));
    if (url.hostname !== 'poshmark.com' && !url.hostname.endsWith('.poshmark.com')) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === 'closet');
    const username = index >= 0 ? clean(parts[index + 1]).replace(/^@+/, '') : '';
    return /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/i.test(username) ? username : '';
  } catch {
    return '';
  }
}

function listingId(raw = '') {
  try {
    return new URL(raw).pathname.match(/-([a-f0-9]{24})$/i)?.[1] || '';
  } catch {
    return '';
  }
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
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx
    ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}

async function syncBusiness(client, business) {
  const data = business.data || {};
  const rawProfile = clean(
    data?.marketplace_links?.Poshmark ||
    data?.marketplace_links?.poshmark ||
    data?.mobile_shop_urls?.Poshmark ||
    data?.mobile_shop_urls?.poshmark ||
    ''
  );
  const username = poshmarkUsername(rawProfile);
  if (!username) return { skipped: 1, saved: 0, deactivated: 0 };

  const profile = await collectPoshmarkProfileListings(username);
  if (!profile?.listings?.length) return { skipped: 1, saved: 0, deactivated: 0 };

  const userRow = await client.query(
    `SELECT auth_user_id
       FROM artflow.legacy_users
      WHERE active_business_id=$1 AND auth_user_id IS NOT NULL
      ORDER BY updated_date DESC NULLS LAST, created_date DESC NULLS LAST
      LIMIT 1`,
    [business.base44_id]
  );
  const targetScope = userRow.rows[0]?.auth_user_id
    ? `user:${userRow.rows[0].auth_user_id}`
    : business.base44_id;

  const activeUrls = [];
  let saved = 0;

  for (const item of profile.listings) {
    const url = clean(item?.url || item?.meta?.finalUrl);
    const itemId = listingId(url);
    if (!url || !itemId) continue;

    const meta = item.meta || {};
    const title = clean(meta.title || `Poshmark listing ${itemId}`).slice(0, 300);
    const price = Number(meta.price || 0) || 0;
    const currency = clean(meta.currency || 'USD').toUpperCase() || 'USD';
    const imageUrl = clean(meta.imageUrl || '');
    activeUrls.push(url);

    const existing = await client.query(
      `SELECT id
         FROM artflow.marketplace_listings
        WHERE business_id=$1 AND platform='Poshmark' AND listing_id=$2
        LIMIT 1`,
      [targetScope, itemId]
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `UPDATE artflow.marketplace_listings
            SET title=$2,
                price=CASE WHEN $3::numeric>0 THEN $3::numeric ELSE price END,
                currency=$4,
                image_url=COALESCE(NULLIF($5,''),image_url),
                listing_url=$6,
                status='Active',
                last_seen_at=now(),
                sync_source='poshmark_profile_cron',
                data=COALESCE(data,'{}'::jsonb) || jsonb_build_object('profile_cron',true,'profile_username',$7::text)
          WHERE id=$1`,
        [existing.rows[0].id, title, price, currency, imageUrl, url, username]
      );
    } else {
      const id = crypto.createHash('sha256').update(`${targetScope}|Poshmark|${url}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings
           (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
         VALUES ($1,$2,'Poshmark',$3,$4,$5,$6,$7,$8,'Active',now(),'poshmark_profile_cron',
           jsonb_build_object('profile_cron',true,'profile_username',$9::text))
         ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
           listing_id=EXCLUDED.listing_id,
           title=EXCLUDED.title,
           price=CASE WHEN EXCLUDED.price>0 THEN EXCLUDED.price ELSE artflow.marketplace_listings.price END,
           currency=EXCLUDED.currency,
           image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
           status='Active',
           last_seen_at=now(),
           sync_source='poshmark_profile_cron',
           data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb) || EXCLUDED.data`,
        [id, targetScope, itemId, title, price, currency, imageUrl || null, url, username]
      );
    }
    saved += 1;
  }

  let deactivated = 0;
  if (profile.complete && activeUrls.length) {
    const result = await client.query(
      `UPDATE artflow.marketplace_listings
          SET status='Inactive',last_seen_at=now(),sync_source='poshmark_profile_cron'
        WHERE business_id=$1
          AND platform='Poshmark'
          AND status='Active'
          AND NOT (listing_url = ANY($2::text[]))`,
      [targetScope, activeUrls]
    );
    deactivated = Number(result.rowCount || 0);
  }

  return { skipped: 0, saved, deactivated };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url, 'http://localhost');
    const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  const summary = { businesses: 0, synced: 0, saved: 0, deactivated: 0, skipped: 0, failed: 0 };

  try {
    await ensureTable(client);
    const businesses = await client.query(`
      SELECT base44_id,data
        FROM artflow.businesses
       WHERE COALESCE(
         data->'marketplace_links'->>'Poshmark',
         data->'marketplace_links'->>'poshmark',
         data->'mobile_shop_urls'->>'Poshmark',
         data->'mobile_shop_urls'->>'poshmark',
         ''
       ) <> ''
       ORDER BY base44_id
    `);

    for (const business of businesses.rows) {
      summary.businesses += 1;
      try {
        const result = await syncBusiness(client, business);
        summary.saved += result.saved;
        summary.deactivated += result.deactivated;
        summary.skipped += result.skipped;
        if (!result.skipped) summary.synced += 1;
      } catch (error) {
        summary.failed += 1;
        console.warn('Poshmark listing cron business failed', business.base44_id, error?.message || error);
      }
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('Poshmark listing cron failed', error?.message || error);
    return res.status(500).json({ error: 'Poshmark listing refresh failed', ...summary });
  } finally {
    client.release();
  }
}
