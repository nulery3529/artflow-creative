// Scheduled background expense sync for every Art Flow business with a linked
// Google account. Unlike the browser-side 5-minute refresh, this keeps running
// when the user is signed out or the app is closed.
import {
  pool,
  getLegacyProfile,
  getBusiness,
  googleAccessTokenFor,
} from './_gmail-sales-core.mjs';
import { syncExpenseAccount } from './gmail-expense-sync.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  // Vercel Cron includes Authorization: Bearer $CRON_SECRET when CRON_SECRET
  // is configured. Keep the endpoint protected whenever that secret exists.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url, 'http://localhost');
    const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  const summary = {
    accounts: 0,
    matched: 0,
    scanned: 0,
    imported: 0,
    skipped: 0,
    reconnectRequired: 0,
    rateLimited: 0,
    failed: 0,
  };

  try {
    const accounts = await client.query(`
      SELECT a.id, a."accountId", a."accessToken", a."refreshToken", a."accessTokenExpiresAt",
             a."userId", u.email AS user_email
        FROM account a
        JOIN "user" u ON u.id = a."userId"
       WHERE a."providerId" = 'google' AND u.email IS NOT NULL
    `);

    for (const account of accounts.rows) {
      summary.accounts += 1;
      try {
        const accessToken = await googleAccessTokenFor(client, account);
        const user = { id: account.userId, email: account.user_email };
        const profile = await getLegacyProfile(client, user);
        const business = await getBusiness(client, profile, user);
        if (!business?.base44_id) continue;

        const result = await syncExpenseAccount(client, business, accessToken);
        if (!result.matched) continue;
        summary.matched += 1;
        summary.scanned += result.scanned;
        summary.imported += result.imported;
        summary.skipped += result.skipped;
      } catch (error) {
        if (error?.code === 'GMAIL_RECONNECT' || error?.status === 400 || error?.status === 401) {
          summary.reconnectRequired += 1;
        } else if (error?.code === 'GMAIL_RATE_LIMIT' || error?.status === 429) {
          summary.rateLimited += 1;
        } else {
          summary.failed += 1;
        }
        console.warn('Gmail expense cron account failed', error?.message || error);
      }
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('gmail expense cron error', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Expense cron sync failed.', ...summary });
  } finally {
    client.release();
  }
}
