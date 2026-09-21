// Scheduled auto-sync for Vinted, Depop and Poshmark sales, plus a Vinted Pro
// imported-listings refresh for every connected Vinted Pro business.
// Vercel Cron calls this endpoint on a schedule (see vercel.json "crons").
// It works without any user session: every linked Google mailbox is refreshed
// server-side and scanned for marketplace sale emails, and new orders are
// written straight into the sales database.
import {
  pool,
  getLegacyProfile,
  getBusiness,
  googleAccessTokenFor,
  syncGmailAccount,
} from './_gmail-sales-core.mjs';
import { syncAllConnectedVinted } from './_vinted-pro-core.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET" when the env var is
  // set. When it is not set (local dev), the endpoint stays open.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url, 'http://localhost');
    const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  const summary = { accounts: 0, matched: 0, scanned: 0, parsed: 0, imported: 0, reconnectRequired: 0, rateLimited: 0, failed: 0 };
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

        const result = await syncGmailAccount(client, business, accessToken);
        if (result.reconnectRequired) {
          summary.reconnectRequired += 1;
          continue;
        }
        if (!result.matched) continue;
        summary.matched += 1;
        summary.scanned += result.scanned;
        summary.parsed += result.parsed;
        summary.imported += result.imported;
      } catch (error) {
        if (error?.code === 'GMAIL_RECONNECT' || error?.status === 401) summary.reconnectRequired += 1;
        else if (error?.code === 'GMAIL_RATE_LIMIT' || error?.status === 429) summary.rateLimited += 1;
        else summary.failed += 1;
        console.warn('Gmail cron sync account failed', error?.message || error);
      }
    }

    // Autosync every connected Vinted Pro business so no one has to press
    // "Sync imported" manually.
    let vinted = { businesses: 0, saved: 0, failed: 0 };
    try {
      vinted = await syncAllConnectedVinted(client);
    } catch (error) {
      console.warn('Vinted Pro cron sync failed', error?.message || error);
    }

    return res.status(200).json({ ok: true, ...summary, vinted });
  } catch (error) {
    console.error('gmail cron sync error', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Cron sync failed.', ...summary });
  } finally {
    client.release();
  }
}
