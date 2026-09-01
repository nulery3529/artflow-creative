import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });

export const config = { api: { bodyParser: false } };

const clean = (value = '') => String(value ?? '').trim();
const money = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const inferSize = (value = '') => {
  const m = String(value || '').match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return m ? m[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function ensureTables(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.depop_webhook_configs (
    business_id text PRIMARY KEY,
    webhook_id text NOT NULL,
    secret text NOT NULL,
    url text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    event_types jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.depop_webhook_events (
    event_key text PRIMARY KEY,
    business_id text NOT NULL,
    event_id text,
    event_type text NOT NULL,
    event_created_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`);
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

function validSignature(raw, timestamp, signature, secret) {
  if (!timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject stale replays while leaving enough room for normal delivery retries.
  if (Math.abs(Date.now() / 1000 - ts) > 15 * 60) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(clean(signature).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function titleFromProduct(product = {}) {
  const first = clean(product.description).split(/\r?\n/).map((v) => v.trim()).find((v) => v && !/^#/.test(v));
  if (first) return first.slice(0, 300);
  return ([product.brand, product.product_type].map(clean).filter(Boolean).join(' ') || `Depop listing ${product.product_id || ''}`).slice(0, 300);
}

async function upsertProduct(client, businessId, product = {}) {
  const productId = clean(product.product_id || product.id);
  const slug = clean(product.slug);
  if (!productId || !slug) return;
  const listingUrl = `https://www.depop.com/products/${encodeURIComponent(slug)}`;
  const picture = Array.isArray(product.pictures) ? product.pictures.find((p) => clean(p?.url)) : null;
  const quantity = Number(product.quantity ?? 0);
  const active = clean(product.status).toUpperCase() === 'STATUS_ONSALE' && quantity > 0;
  const title = titleFromProduct(product);
  const price = Math.max(0, money(product.current_price ?? product.discount_price ?? product.price_amount));
  const currency = clean(product.price_currency || 'USD') || 'USD';
  const imageUrl = clean(picture?.url || '');

  const existing = await client.query(
    `SELECT id,listing_url FROM artflow.marketplace_listings WHERE business_id=$1 AND platform='Depop' AND listing_id=$2 LIMIT 1`,
    [businessId, productId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE artflow.marketplace_listings
       SET title=$3,price=$4,currency=$5,image_url=COALESCE(NULLIF($6,''),image_url),listing_url=$7,status=$8,last_seen_at=now(),sync_source='depop_webhook_product',data=$9::jsonb
       WHERE id=$1 AND business_id=$2`,
      [existing.rows[0].id, businessId, title, price, currency, imageUrl, listingUrl, active ? 'Active' : 'Inactive', JSON.stringify({ quantity, depop_status: product.status || null, sku: product.sku || null })]
    );
    return;
  }

  const id = crypto.createHash('sha256').update(`${businessId}|Depop|${listingUrl}`).digest('hex');
  await client.query(
    `INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
     VALUES ($1,$2,'Depop',$3,$4,$5,$6,$7,$8,$9,now(),'depop_webhook_product',$10::jsonb)
     ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,price=EXCLUDED.price,currency=EXCLUDED.currency,image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),status=EXCLUDED.status,last_seen_at=now(),sync_source='depop_webhook_product',data=EXCLUDED.data`,
    [id, businessId, productId, title, price, currency, imageUrl || null, listingUrl, active ? 'Active' : 'Inactive', JSON.stringify({ quantity, depop_status: product.status || null, sku: product.sku || null })]
  );
}

async function syncOrder(client, businessId, order = {}, source = 'depop_webhook_order') {
  const purchaseId = clean(order.purchase_id);
  if (!purchaseId) return;
  const status = clean(order.status).toUpperCase();
  if (status === 'REFUNDED' || status === 'CANCELLED') {
    await client.query(`UPDATE artflow.orders SET archived=true,sync_source=$3,updated_date=now() WHERE business_id=$1 AND platform='Depop' AND order_id=$2 AND archived IS NOT TRUE`, [businessId, purchaseId, `${source}_${status.toLowerCase()}`]);
    return;
  }

  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  const saleDate = clean(order.created_at).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const buyer = clean(order?.buyer_address?.name);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || {};
    const title = clean(line.description || 'Depop sale').slice(0, 300) || 'Depop sale';
    const total = money(line.sold_price || line.original_price);
    if (!(total > 0)) continue;
    const sourceId = `depop-webhook:${purchaseId}:${clean(line.purchase_item_id || line.product_id || i)}`;
    const sourceUrl = line.slug ? `https://www.depop.com/products/${encodeURIComponent(clean(line.slug))}` : '';
    const size = inferSize(title);
    const data = { source_url: sourceUrl || null, image_url: clean(line.image_url) || null, depop_status: status || null, source: 'depop_webhook' };
    const existing = await client.query(`SELECT base44_id FROM artflow.orders WHERE business_id=$1 AND source_email_id=$2 LIMIT 1`, [businessId, sourceId]);
    if (existing.rows[0]) {
      await client.query(
        `UPDATE artflow.orders SET updated_date=now(),sale_date=$3,platform='Depop',order_id=$4,product_name=$5,quantity=1,size=$6,unit_price=$7,sale_total=$7,buyer=$8,archived=false,sync_source=$9,data=COALESCE(data,'{}'::jsonb)||$10::jsonb WHERE base44_id=$1 AND business_id=$2`,
        [existing.rows[0].base44_id, businessId, saleDate, purchaseId, title, size, total, buyer || null, source, JSON.stringify(data)]
      );
    } else {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO artflow.orders (base44_id,created_date,updated_date,sale_date,platform,order_id,product_name,quantity,size,unit_price,sale_total,buyer,source_email_id,base_item_cost,paper_ink_cost,packaging_cost,total_cost,estimated_profit,archived,sync_source,business_id,data)
         VALUES ($1,now(),now(),$2,'Depop',$3,$4,1,$5,$6,$6,$7,$8,0,0,0,0,$6,false,$9,$10,$11::jsonb)`,
        [id, saleDate, purchaseId, title, size, total, buyer || null, sourceId, source, businessId, JSON.stringify(data)]
      );
    }
  }
}

async function fetchOrder(purchaseId) {
  const apiKey = clean(process.env.DEPOP_PARTNER_API_KEY);
  if (!apiKey || !purchaseId) return null;
  const response = await fetch(`https://partnerapi.depop.com/api/v1/orders/${encodeURIComponent(purchaseId)}/`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'Depop webhook receiver' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const raw = await rawBody(req);
  const timestamp = clean(req.headers['x-depop-timestamp']);
  const signature = clean(req.headers['x-depop-signature']);
  const client = await pool.connect();
  try {
    await ensureTables(client);
    const configs = await client.query(`SELECT business_id,webhook_id,secret FROM artflow.depop_webhook_configs WHERE enabled=true ORDER BY updated_at DESC LIMIT 10`);
    const matched = configs.rows.find((row) => validSignature(raw, timestamp, signature, row.secret));
    if (!matched) return res.status(401).json({ error: 'Invalid Depop webhook signature' });

    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const eventType = clean(event?.event_type);
    const eventId = clean(event?.id);
    const createdAt = clean(event?.created_at);
    if (!eventType || !eventId) return res.status(400).json({ error: 'Invalid webhook envelope' });

    const eventKey = crypto.createHash('sha256').update(`${eventId}|${eventType}|${createdAt}`).digest('hex');
    const inserted = await client.query(
      `INSERT INTO artflow.depop_webhook_events (event_key,business_id,event_id,event_type,event_created_at,payload)
       VALUES ($1,$2,$3,$4,NULLIF($5,'')::timestamptz,$6::jsonb) ON CONFLICT (event_key) DO NOTHING RETURNING event_key`,
      [eventKey, matched.business_id, eventId, eventType, createdAt, JSON.stringify(event)]
    );
    if (!inserted.rows[0]) return res.status(200).json({ ok: true, duplicate: true });

    if (eventType === 'v1:product.update') {
      await upsertProduct(client, matched.business_id, event?.data?.product || {});
    } else if (eventType === 'v1:order.new' || eventType === 'v1:order.update') {
      await syncOrder(client, matched.business_id, event?.data || {}, `depop_webhook_${eventType.split('.').pop()}`);
    } else if (eventType === 'v1:order.refund') {
      const purchaseId = clean(event?.data?.purchase_id);
      const current = await fetchOrder(purchaseId);
      if (current) await syncOrder(client, matched.business_id, current, 'depop_webhook_refund');
      else await client.query(`UPDATE artflow.orders SET archived=true,sync_source='depop_webhook_refund',updated_date=now() WHERE business_id=$1 AND platform='Depop' AND order_id=$2 AND archived IS NOT TRUE`, [matched.business_id, purchaseId]);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Depop webhook processing failed', error?.message || error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
}
