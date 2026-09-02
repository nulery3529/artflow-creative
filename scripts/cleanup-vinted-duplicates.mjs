import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const before = await client.query(`
    SELECT COUNT(*)::int AS duplicate_groups,
           COALESCE(SUM(cnt - 1),0)::int AS extra_rows
    FROM (
      SELECT business_id, platform, listing_id, COUNT(*)::int AS cnt
      FROM artflow.marketplace_listings
      WHERE platform='Vinted' AND listing_id IS NOT NULL AND listing_id<>''
      GROUP BY business_id, platform, listing_id
      HAVING COUNT(*) > 1
    ) d
  `);

  const deleted = await client.query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY business_id, platform, listing_id
               ORDER BY last_seen_at DESC NULLS LAST,
                        CASE WHEN COALESCE(image_url,'')<>'' THEN 1 ELSE 0 END DESC,
                        LENGTH(COALESCE(image_url,'')) DESC,
                        id DESC
             ) AS rn
      FROM artflow.marketplace_listings
      WHERE platform='Vinted' AND listing_id IS NOT NULL AND listing_id<>''
    )
    DELETE FROM artflow.marketplace_listings m
    USING ranked r
    WHERE m.id=r.id AND r.rn>1
    RETURNING m.id
  `);

  const after = await client.query(`
    SELECT COUNT(*)::int AS duplicate_groups,
           COALESCE(SUM(cnt - 1),0)::int AS extra_rows
    FROM (
      SELECT business_id, platform, listing_id, COUNT(*)::int AS cnt
      FROM artflow.marketplace_listings
      WHERE platform='Vinted' AND listing_id IS NOT NULL AND listing_id<>''
      GROUP BY business_id, platform, listing_id
      HAVING COUNT(*) > 1
    ) d
  `);

  await client.query('COMMIT');
  console.log(JSON.stringify({
    before: before.rows[0],
    deleted: deleted.rowCount,
    after: after.rows[0],
  }));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
