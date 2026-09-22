import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import { syncYahooMailbox } from './yahoo-mail.mjs';

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return provided === secret;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error:'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error:'Unauthorized' });

  const client = await pool.connect();
  const summary = { accounts:0, checked:0, saved:0, remaining:0, failed:0 };

  try {
    const businesses = await client.query(`
      SELECT base44_id,name,primary_email,created_by_id,data
        FROM artflow.businesses
       WHERE COALESCE((data->'yahoo_mail'->>'connected')::boolean,false)=true
         AND COALESCE(data->'yahoo_mail'->>'app_password_enc','')<>''
       ORDER BY base44_id
    `);

    for (const business of businesses.rows) {
      summary.accounts += 1;
      try {
        const result = await syncYahooMailbox(client, business);
        summary.checked += Number(result.checked || 0);
        summary.saved += Number(result.saved || 0);
        summary.remaining += Number(result.remaining || 0);
      } catch (error) {
        summary.failed += 1;
        console.warn('Yahoo background sync failed', business.base44_id, error?.message || error);
      }
    }

    return res.status(200).json({ ok:true, ...summary });
  } catch (error) {
    console.error('Yahoo mail cron failed', error?.message || error);
    return res.status(500).json({ error:error?.message || 'Yahoo mail sync failed', ...summary });
  } finally {
    client.release();
  }
}
