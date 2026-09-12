import { ensureStoreTables, storePool, parseBody, hashPassword, verifyPassword, issueCustomerToken, getCartToken, linkCartToCustomer, getStoreCustomer } from './_store-core.mjs';

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const clean = (value = '', max = 200) => String(value || '').trim().slice(0, max);

// Storefront buyer accounts — separate from seller sign-in.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureStoreTables();
    const body = req.method === 'POST' ? parseBody(req) : {};
    const action = String(body.action || '');

    if (req.method === 'GET') {
      const customer = await getStoreCustomer(req);
      return res.status(200).json({ customer });
    }

    if (action === 'logout') return res.status(200).json({ ok: true });

    if (action === 'register') {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const name = clean(body.name, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const found = await storePool.query(`SELECT id FROM artflow.store_customers WHERE lower(email)=$1`, [email]);
      if (found.rows[0]) return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });

      const inserted = await storePool.query(
        `INSERT INTO artflow.store_customers (email, name, password_hash) VALUES ($1,$2,$3)
         RETURNING id, email, name, phone, created_at`,
        [email, name, hashPassword(password)]
      );
      const customer = inserted.rows[0];
      await linkCartToCustomer(getCartToken(req), customer.id);
      return res.status(200).json({ customer, token: issueCustomerToken(customer.id) });
    }

    if (action === 'login') {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const found = await storePool.query(
        `SELECT id, email, name, phone, password_hash, created_at FROM artflow.store_customers WHERE lower(email)=$1`,
        [email]
      );
      const row = found.rows[0];
      if (!row || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({ error: 'Incorrect email or password' });
      }
      await linkCartToCustomer(getCartToken(req), row.id);
      const customer = { id: row.id, email: row.email, name: row.name, phone: row.phone, created_at: row.created_at };
      return res.status(200).json({ customer, token: issueCustomerToken(row.id) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('store auth error', error?.message);
    return res.status(500).json({ error: 'Could not complete that request' });
  }
}