import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const KEY = 'artflow-expense-schema-20260901';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.key !== KEY) return res.status(404).json({ error: 'Not found' });
  const client = await pool.connect();
  try {
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='artflow' AND table_name='expenses'
      ORDER BY ordinal_position
    `);
    const sample = await client.query(`
      SELECT base44_id, data, to_jsonb(e) AS row_json
      FROM artflow.expenses e
      LIMIT 1
    `);
    return res.status(200).json({ columns: columns.rows, sample: sample.rows[0] || null });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  } finally {
    client.release();
  }
}
