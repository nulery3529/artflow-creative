import { ensureStoreTables, storePool, getStoreCustomer, normalizeUuid } from './_store-core.mjs';

// Buyer order history for the storefront account page.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureStoreTables();
    const customer = await getStoreCustomer(req);
    if (!customer) return res.status(401).json({ error: 'Sign in to view your orders' });

    const id = normalizeUuid(req.query?.id);
    if (id) {
      const order = (await storePool.query(
        `SELECT * FROM artflow.store_orders WHERE id=$1 AND customer_id=$2`,
        [id, customer.id]
      )).rows[0];
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const items = await storePool.query(
        `SELECT name, price_cents, quantity, image, product_id FROM artflow.store_order_items WHERE order_id=$1`,
        [order.id]
      );
      return res.status(200).json({ order, items: items.rows });
    }

    const orders = await storePool.query(
      `SELECT id, order_number, status, total_cents, currency, created_at FROM artflow.store_orders
        WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [customer.id]
    );
    const items = await storePool.query(
      `SELECT oi.order_id, oi.name, oi.price_cents, oi.quantity, oi.image
         FROM artflow.store_order_items oi
         JOIN artflow.store_orders o ON o.id = oi.order_id
        WHERE o.customer_id=$1`,
      [customer.id]
    );
    const byOrder = {};
    for (const row of items.rows) {
      (byOrder[row.order_id] = byOrder[row.order_id] || []).push(row);
    }
    return res.status(200).json({ orders: orders.rows.map((order) => ({ ...order, items: byOrder[order.id] || [] })) });
  } catch (error) {
    console.error('store orders error', error?.message);
    return res.status(500).json({ error: 'Could not load orders' });
  }
}