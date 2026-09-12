import { ensureStoreTables, storePool, parseBody, getCartToken, getStoreCustomer, clampInt, normalizeUuid } from './_store-core.mjs';

// Cart + wishlist. The browser supplies a cart token (localStorage UUID);
// when the buyer is signed in their rows are linked to the customer record so
// the cart follows them across devices once the iOS app sends the same token.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureStoreTables();
    const cartToken = getCartToken(req);
    if (!cartToken) return res.status(400).json({ error: 'Missing cart token' });
    const customer = await getStoreCustomer(req);
    const customerId = customer?.id || null;

    const loadCart = async () => {
      const cart = await storePool.query(
        `SELECT ci.product_id, ci.quantity, p.name, p.slug, p.price_cents, p.currency, p.stock, p.track_stock, p.status, p.images
           FROM artflow.store_cart_items ci
           JOIN artflow.store_products p ON p.id = ci.product_id
          WHERE ci.cart_token=$1 OR ($2::uuid IS NOT NULL AND ci.customer_id=$2)
          ORDER BY ci.created_at`,
        [cartToken, customerId]
      );
      const wishlist = await storePool.query(
        `SELECT wi.product_id, p.name, p.slug, p.price_cents, p.currency, p.stock, p.track_stock, p.status, p.images
           FROM artflow.store_wishlist_items wi
           JOIN artflow.store_products p ON p.id = wi.product_id
          WHERE wi.cart_token=$1 OR ($2::uuid IS NOT NULL AND wi.customer_id=$2)
          ORDER BY wi.created_at`,
        [cartToken, customerId]
      );
      return { cart: cart.rows, wishlist: wishlist.rows };
    };

    if (req.method === 'GET') {
      const { cart, wishlist } = await loadCart();
      return res.status(200).json({ cart, wishlist });
    }

    const body = parseBody(req);
    const action = String(body.action || '');
    const productId = normalizeUuid(body.product_id);

    if (action === 'add') {
      if (!productId) return res.status(400).json({ error: 'Missing product' });
      const quantity = clampInt(body.quantity, 1, 99, 1);
      const product = (await storePool.query(
        `SELECT stock, track_stock, status FROM artflow.store_products WHERE id=$1`, [productId]
      )).rows[0];
      if (!product || product.status !== 'active') return res.status(404).json({ error: 'This product is no longer available' });
      if (product.track_stock && product.stock <= 0) return res.status(400).json({ error: 'This item is sold out' });
      const wanted = clampInt(quantity, 1, product.track_stock ? Math.max(product.stock, 1) : 99, 1);
      await storePool.query(
        `INSERT INTO artflow.store_cart_items (cart_token, customer_id, product_id, quantity)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (cart_token, product_id)
         DO UPDATE SET quantity = LEAST(store_cart_items.quantity + $4, $5)`,
        [cartToken, customerId, productId, wanted, product.track_stock ? Math.max(product.stock, 1) : 99]
      );
    } else if (action === 'update') {
      if (!productId) return res.status(400).json({ error: 'Missing product' });
      const quantity = clampInt(body.quantity, 0, 99, 0);
      if (quantity <= 0) {
        await storePool.query(`DELETE FROM artflow.store_cart_items WHERE cart_token=$1 AND product_id=$2`, [cartToken, productId]);
      } else {
        await storePool.query(
          `UPDATE artflow.store_cart_items SET quantity=$3 WHERE cart_token=$1 AND product_id=$2`,
          [cartToken, productId, quantity]
        );
      }
    } else if (action === 'remove') {
      if (!productId) return res.status(400).json({ error: 'Missing product' });
      await storePool.query(`DELETE FROM artflow.store_cart_items WHERE cart_token=$1 AND product_id=$2`, [cartToken, productId]);
    } else if (action === 'wishlist_add') {
      if (!productId) return res.status(400).json({ error: 'Missing product' });
      await storePool.query(
        `INSERT INTO artflow.store_wishlist_items (cart_token, customer_id, product_id)
         VALUES ($1,$2,$3) ON CONFLICT (cart_token, product_id) DO NOTHING`,
        [cartToken, customerId, productId]
      );
    } else if (action === 'wishlist_remove') {
      if (!productId) return res.status(400).json({ error: 'Missing product' });
      await storePool.query(`DELETE FROM artflow.store_wishlist_items WHERE cart_token=$1 AND product_id=$2`, [cartToken, productId]);
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    const { cart, wishlist } = await loadCart();
    return res.status(200).json({ cart, wishlist });
  } catch (error) {
    console.error('store cart error', error?.message);
    return res.status(500).json({ error: 'Could not update your cart' });
  }
}