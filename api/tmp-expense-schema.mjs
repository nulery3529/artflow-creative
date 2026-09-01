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
      LIMIT 5
    `);
    const stats = await client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE archived IS NOT TRUE)::int AS active,
        count(*) FILTER (WHERE archived IS NOT TRUE AND (expense_date IS NULL OR btrim(expense_date)=''))::int AS active_missing_date,
        count(*) FILTER (WHERE archived IS NOT TRUE AND data->>'source'='google_sheet_master')::int AS active_sheet_rows,
        count(*) FILTER (WHERE archived IS NOT TRUE AND data->>'source'='google_sheet_master' AND (expense_date IS NULL OR btrim(expense_date)=''))::int AS sheet_missing_date
      FROM artflow.expenses
    `);
    return res.status(200).json({ columns: columns.rows, stats: stats.rows[0] || null, sample: sample.rows });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  } finally {
    client.release();
  }
}
