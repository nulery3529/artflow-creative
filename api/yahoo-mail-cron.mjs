import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import { syncYahooExpenses, syncYahooMailbox } from './yahoo-mail.mjs';

const { Pool } = pg;
const PRIMARY_VERCEL_PROJECT_ID = 'prj_DROTZuTXWIqP0aCXDtJ0xMkWAitz';
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const vercelSchedule = String(req.headers['x-vercel-cron-schedule'] || '');
  return secret ? provided === secret : vercelSchedule === "20 * * * *";
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error:'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error:'Unauthorized' });
  if (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_PROJECT_ID !== PRIMARY_VERCEL_PROJECT_ID) {
    return res.status(200).json({ ok: true, skipped: 'secondary_vercel_project' });
  }

  const client = await pool.connect();
  const summary = {
    accounts:0,
    checked:0,
    saved:0,
    remaining:0,
    expense_checked:0,
    expense_imported:0,
    expense_remaining:0,
    failed:0,
  };

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
        const expenses = await syncYahooExpenses(client, business);
        summary.checked += Number(result.checked || 0);
        summary.saved += Number(result.saved || 0);
        summary.remaining += Number(result.remaining || 0);
        summary.expense_checked += Number(expenses.checked || 0);
        summary.expense_imported += Number(expenses.imported || 0);
        summary.expense_remaining += Number(expenses.remaining || 0);
      } catch (error) {
        const message = String(error?.message || 'Yahoo background sync failed');
        const authRejected = /Yahoo rejected this credential|AUTHENTICATIONFAILED|LOGIN failed|invalid credentials/i.test(message);
        if (authRejected) {
          const nextData = {
            ...(business.data || {}),
            yahoo_mail: {
              ...(business.data?.yahoo_mail || {}),
              connected: false,
              last_error: message,
              disconnected_at: new Date().toISOString(),
            },
          };
          await client.query(
            `UPDATE artflow.businesses SET data=$2::jsonb, updated_date=now() WHERE base44_id=$1`,
            [business.base44_id, JSON.stringify(nextData)]
          ).catch(() => {});
        } else {
          summary.failed += 1;
        }
        console.warn('Yahoo background sync failed', business.base44_id, message);
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
