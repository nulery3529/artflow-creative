import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;

export const storePool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const TOKEN_SECRET = process.env.BETTER_AUTH_SECRET || 'artflow-store-secret';

// ---------------------------------------------------------------------------
// Schema: the storefront tables live in the same Neon `artflow` schema as the
// rest of the business, so web and iOS share one database and one logic layer.
// Created lazily (once per server instance) so no manual migration is needed.
// ---------------------------------------------------------------------------
const STORE_DDL = `
CREATE SCHEMA IF NOT EXISTS artflow;

CREATE TABLE IF NOT EXISTS artflow.store_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artflow.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL,
  category_id uuid REFERENCES artflow.store_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  hashtags text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  stock integer NOT NULL DEFAULT 0,
  track_stock boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artflow.store_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_customers_email_uidx ON artflow.store_customers ((lower(email)));

CREATE TABLE IF NOT EXISTS artflow.store_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES artflow.store_customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Shipping',
  recipient_name text NOT NULL DEFAULT '',
  line1 text NOT NULL DEFAULT '',
  line2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'US',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artflow.store_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_token text NOT NULL,
  customer_id uuid REFERENCES artflow.store_customers(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES artflow.store_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_cart_items_token_product_uidx ON artflow.store_cart_items (cart_token, product_id);

CREATE TABLE IF NOT EXISTS artflow.store_wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_token text NOT NULL,
  customer_id uuid REFERENCES artflow.store_customers(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES artflow.store_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_wishlist_token_product_uidx ON artflow.store_wishlist_items (cart_token, product_id);

CREATE TABLE IF NOT EXISTS artflow.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text,
  customer_id uuid REFERENCES artflow.store_customers(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  email text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  subtotal_cents integer NOT NULL DEFAULT 0,
  shipping_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE artflow.store_products ADD COLUMN IF NOT EXISTS hashtags text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS store_orders_number_uidx ON artflow.store_orders (order_number);

CREATE TABLE IF NOT EXISTS artflow.store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES artflow.store_orders(id) ON DELETE CASCADE,
  product_id uuid,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  image text
);

CREATE TABLE IF NOT EXISTS artflow.store_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES artflow.store_orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_ref text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

let tablesReady = null;
export function ensureStoreTables() {
  if (!tablesReady) {
    tablesReady = storePool.query(STORE_DDL).then(() => true).catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

// ---------------------------------------------------------------------------
// Buyer (storefront customer) authentication — deliberately separate from the
// seller Better Auth surface, so buyer accounts never reach the seller app.
// ---------------------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueCustomerToken(customerId) {
  const payload = Buffer.from(JSON.stringify({ cid: customerId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readCustomerToken(req) {
  const header = String(req.headers['x-customer-token'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!header || !header.includes('.')) return null;
  const [payload, sig] = header.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.cid || null;
  } catch {
    return null;
  }
}

export function getCartToken(req) {
  return String(req.headers['x-cart-token'] || '').trim().slice(0, 80) || null;
}

export async function linkCartToCustomer(cartToken, customerId) {
  if (!cartToken || !customerId) return;
  await storePool.query(`UPDATE artflow.store_cart_items SET customer_id=$2 WHERE cart_token=$1`, [cartToken, customerId]);
  await storePool.query(`UPDATE artflow.store_wishlist_items SET customer_id=$2 WHERE cart_token=$1`, [cartToken, customerId]);
}

export async function getStoreCustomer(req) {
  const customerId = readCustomerToken(req);
  if (!customerId) return null;
  const result = await storePool.query(
    `SELECT id, email, name, phone, created_at FROM artflow.store_customers WHERE id=$1`,
    [customerId]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Seller context — mirrors the workspace resolution used by the other APIs.
// ---------------------------------------------------------------------------
const normalize = (v = '') => String(v || '').trim().toLowerCase();

export async function getSellerSession(req) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  return session?.user || null;
}

async function getProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const result = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id=$1 OR lower(email)=$2
     ORDER BY CASE WHEN active_business_id IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END, created_date NULLS LAST
     LIMIT 1`,
    [user.id, email]
  );
  return result.rows[0] || null;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [
    row?.primary_email,
    d.primary_email,
    ...(Array.isArray(d.member_emails) ? d.member_emails : []),
    ...(Array.isArray(d.sales_emails) ? d.sales_emails : []),
    ...(Array.isArray(d.expense_emails) ? d.expense_emails : []),
  ].map(normalize).filter(Boolean);
}

export async function getSellerBusiness(req) {
  const user = await getSellerSession(req);
  if (!user) return null;
  const client = await storePool.connect();
  try {
    const profile = await getProfile(client, user);
    const active = profile?.active_business_id || profile?.data?.active_business_id || null;
    const email = normalize(user?.email);
    const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
    const activeRow = result.rows.find((row) => active && row.base44_id === active) || null;
    const emailRows = result.rows.filter((row) => email && businessEmails(row).includes(email));
    const isPlaceholder = (row) => {
      if (!row) return false;
      const d = row.data || {};
      return businessEmails(row).length === 0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name || '').trim());
    };
    const canonical = emailRows[0] || null;
    const business = (isPlaceholder(activeRow) && canonical ? canonical : (activeRow || canonical)) || null;
    if (business) return { user, business };

    const id = `business:${crypto.randomUUID()}`;
    const name = `${String(user?.name || 'My').trim() || 'My'} Art Business`;
    const data = { primary_email: user.email, member_emails: [user.email], sales_emails: [user.email], expense_emails: [user.email], tracked_marketplaces: [] };
    await client.query(
      `INSERT INTO artflow.businesses (base44_id, name, primary_email, data) VALUES ($1,$2,$3,$4::jsonb)`,
      [id, name, user.email, JSON.stringify(data)]
    );
    return { user, business: { base44_id: id, name, primary_email: user.email, data } };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
export function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function slugify(value = '') {
  return String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `item-${crypto.randomBytes(3).toString('hex')}`;
}

export function newOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `AFC-${stamp}${rand}`;
}

export function normalizeUuid(value) {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

export function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}