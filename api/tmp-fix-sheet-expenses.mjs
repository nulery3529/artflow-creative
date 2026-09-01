import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const KEY = 'artflow-fix-expenses-20260901';
const BUSINESS_ID = '6a922b3cda8054f2f06c9832';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.key !== KEY) return res.status(404).json({ error: 'Not found' });
  const encoded = String(req.query?.payload || '');
  if (!encoded) return res.status(400).json({ error: 'Missing payload' });

  let rows;
  try {
    rows = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 25) {
    return res.status(400).json({ error: 'Payload must contain 1-25 rows' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const item of rows) {
      const sheetRow = Number(item?.row);
      const date = String(item?.date || '');
      const description = String(item?.description || '').trim();
      if (!Number.isInteger(sheetRow) || sheetRow < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description) {
        throw new Error(`Invalid row payload for sheet row ${item?.row}`);
      }
      const result = await client.query(
        `UPDATE artflow.expenses
            SET expense_date = $1,
                updated_date = now(),
                data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
                  'description', $2::text,
                  'deductible_percent', 100,
                  'deductible_amount', amount,
                  'sync_source', 'google_sheet_master'
                )
          WHERE business_id = $3
            AND archived IS NOT TRUE
            AND data->>'source' = 'google_sheet_master'
            AND data->>'sheet_row' = $4`,
        [date, description, BUSINESS_ID, String(sheetRow)]
      );
      updated += result.rowCount || 0;
    }
    await client.query('COMMIT');

    const check = await client.query(
      `SELECT
         count(*) FILTER (WHERE archived IS NOT TRUE AND data->>'source'='google_sheet_master')::int AS sheet_rows,
         count(*) FILTER (WHERE archived IS NOT TRUE AND data->>'source'='google_sheet_master' AND (expense_date IS NULL OR btrim(expense_date)=''))::int AS missing_date,
         count(*) FILTER (WHERE archived IS NOT TRUE AND data->>'source'='google_sheet_master' AND COALESCE(data->>'description','')='')::int AS missing_description
       FROM artflow.expenses
       WHERE business_id=$1`,
      [BUSINESS_ID]
    );
    return res.status(200).json({ ok: true, updated, check: check.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: error?.message || String(error) });
  } finally {
    client.release();
  }
}
