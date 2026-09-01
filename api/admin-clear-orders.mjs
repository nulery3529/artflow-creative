import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const TOKEN = '89a035daa83e9b71546fba1921879db3e66fadd6229f36dd9655017325198e6f';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-clear-orders-token'] !== TOKEN) return res.status(403).json({ error: 'Forbidden' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT COUNT(*)::int AS count FROM artflow.orders');
    const deleted = await client.query('DELETE FROM artflow.orders');
    const after = await client.query('SELECT COUNT(*)::int AS count FROM artflow.orders');
    await client.query('COMMIT');
    return res.status(200).json({ before: before.rows[0].count, deleted: deleted.rowCount, after: after.rows[0].count });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('clear orders error', e?.message || e);
    return res.status(500).json({ error: 'Clear failed' });
  } finally {
    client.release();
  }
}
