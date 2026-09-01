import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

const { Pool } = pg;
const BUSINESS_ID = '6a922b3cda8054f2f06c9832';
const ALLOWED_TOKEN = 'exact-style-seed-2026-09-01-a7f4c9';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

function readSeed(name) {
  const raw = fs.readFileSync(new URL(`./${name}.b64`, import.meta.url), 'utf8').trim();
  return JSON.parse(zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'));
}

async function tableColumns(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='artflow' AND table_name=$1`,
    [table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function ownerId(client) {
  const r = await client.query(
    `SELECT base44_id FROM artflow.legacy_users
      WHERE lower(email) = 'nulery3529@gmail.com' OR lower(email) = 'natashaulery@gmail.com'
      ORDER BY CASE WHEN lower(email)='nulery3529@gmail.com' THEN 0 ELSE 1 END, created_date NULLS LAST
      LIMIT 1`
  );
  return r.rows[0]?.base44_id || null;
}

async function insertRows(client, table, inputRows, owner) {
  const cols = await tableColumns(client, table);
  let inserted = 0;
  for (const source of inputRows) {
    const row = { ...source };
    if (cols.has('base44_id')) row.base44_id = crypto.randomUUID();
    if (cols.has('created_by_id')) row.created_by_id = owner;
    if (cols.has('created_date')) row.created_date = new Date();
    if (cols.has('updated_date')) row.updated_date = new Date();
    if (cols.has('business_id')) row.business_id = BUSINESS_ID;
    const keys = Object.keys(row).filter((key) => cols.has(key));
    const values = keys.map((key) => key === 'data' ? JSON.stringify(row[key] || {}) : row[key]);
    const placeholders = keys.map((key, i) => key === 'data' ? `$${i + 1}::jsonb` : `$${i + 1}`);
    const quoted = keys.map((key) => `"${key.replaceAll('"', '""')}"`);
    await client.query(
      `INSERT INTO artflow.${table} (${quoted.join(',')}) VALUES (${placeholders.join(',')})`,
      values
    );
    inserted += 1;
  }
  return inserted;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (String(req.headers['x-artflow-seed-token'] || '') !== ALLOWED_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const client = await pool.connect();
  try {
    const orders = readSeed('orders-exact-style');
    const expenses = readSeed('expenses-exact-style');
    const owner = await ownerId(client);
    await client.query('BEGIN');
    await client.query(`UPDATE artflow.orders SET archived=true, updated_date=now() WHERE business_id=$1 AND archived IS NOT TRUE`, [BUSINESS_ID]);
    await client.query(`UPDATE artflow.expenses SET archived=true, updated_date=now() WHERE business_id=$1 AND archived IS NOT TRUE`, [BUSINESS_ID]);
    const orderCount = await insertRows(client, 'orders', orders, owner);
    const expenseCount = await insertRows(client, 'expenses', expenses, owner);
    await client.query('COMMIT');
    const verify = await client.query(
      `SELECT
        (SELECT count(*)::int FROM artflow.orders WHERE business_id=$1 AND archived IS NOT TRUE) AS orders,
        (SELECT count(*)::int FROM artflow.expenses WHERE business_id=$1 AND archived IS NOT TRUE) AS expenses`,
      [BUSINESS_ID]
    );
    return res.status(200).json({ ok: true, inserted: { orders: orderCount, expenses: expenseCount }, active: verify.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('exact style seed error', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Seed failed' });
  } finally {
    client.release();
  }
}
