import { ensureStoreTables, storePool, parseBody, getSellerBusiness, normalizeUuid, clampInt, slugify } from './_store-core.mjs';

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);
const PRODUCT_STATUSES = ['draft', 'active', 'archived', 'sold'];
const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled'];

function cleanProductImage(value = '') {
  const image = String(value || '').trim();
  if (/^https?:\/\//i.test(image)) return image.slice(0, 4000);
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image) && image.length <= 2500000) return image;
  return '';
}

// Seller-side store management: products, categories, orders, customers.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const context = await getSellerBusiness(req);
  if (!context) return res.status(401).json({ error: 'Unauthorized' });
  const businessId = context.business.base44_id;

  try {
    await ensureStoreTables();

    if (req.method === 'GET') {
      const resource = String(req.query?.resource || 'products');

      if (resource === 'products') {
        const products = await storePool.query(
          `SELECT p.*, c.name AS category_name
             FROM artflow.store_products p
             LEFT JOIN artflow.store_categories c ON c.id = p.category_id
            WHERE p.business_id=$1
            ORDER BY p.updated_at DESC`,
          [businessId]
        );
        return res.status(200).json({ products: products.rows });
      }

      if (resource === 'categories') {
        const categories = await storePool.query(
          `SELECT c.*, count(p.id)::int AS product_count
             FROM artflow.store_categories c
             LEFT JOIN artflow.store_products p ON p.category_id = c.id
            WHERE c.business_id=$1
            GROUP BY c.id ORDER BY c.name`,
          [businessId]
        );
        return res.status(200).json({ categories: categories.rows });
      }

      if (resource === 'orders') {
        const id = normalizeUuid(req.query?.id);
        if (id) {
          const order = (await storePool.query(
            `SELECT o.*, c.name AS customer_name FROM artflow.store_orders o
               LEFT JOIN artflow.store_customers c ON c.id = o.customer_id
              WHERE o.id=$1 AND (o.business_id=$2 OR $2 IS NULL)`,
            [id, businessId]
          )).rows[0];
          if (!order) return res.status(404).json({ error: 'Order not found' });
          const items = await storePool.query(`SELECT * FROM artflow.store_order_items WHERE order_id=$1`, [id]);
          const payments = await storePool.query(`SELECT * FROM artflow.store_payments WHERE order_id=$1 ORDER BY created_at DESC`, [id]);
          return res.status(200).json({ order: { ...order, items: items.rows, payments: payments.rows } });
        }
        const orders = await storePool.query(
          `SELECT o.id, o.order_number, o.email, o.customer_name, o.status, o.total_cents, o.currency, o.created_at,
                  (SELECT count(*)::int FROM artflow.store_order_items oi WHERE oi.order_id = o.id) AS item_count
             FROM artflow.store_orders o
            WHERE o.business_id=$1 OR $1 IS NULL
            ORDER BY o.created_at DESC LIMIT 200`,
          [businessId]
        );
        return res.status(200).json({ orders: orders.rows });
      }

      if (resource === 'customers') {
        const customers = await storePool.query(
          `SELECT c.id, c.email, c.name, c.phone, c.created_at,
                  (SELECT count(*)::int FROM artflow.store_orders o WHERE o.customer_id = c.id) AS order_count,
                  coalesce((SELECT sum(o.total_cents) FROM artflow.store_orders o WHERE o.customer_id = c.id), 0)::int AS lifetime_cents
             FROM artflow.store_customers c
            ORDER BY c.created_at DESC LIMIT 200`
        );
        return res.status(200).json({ customers: customers.rows });
      }

      return res.status(400).json({ error: 'Unknown resource' });
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'product_save') {
      const name = clean(body.name, 180);
      if (!name) return res.status(400).json({ error: 'Product name is required' });
      const price = clampInt(body.price_cents, 0, 100000000, 0);
      const stock = clampInt(body.stock, 0, 100000, 0);
      const status = PRODUCT_STATUSES.includes(body.status) ? body.status : 'draft';
      const categoryId = normalizeUuid(body.category_id);
      const description = clean(body.description, 4000);
      const hashtags = clean(body.hashtags, 1200);
      const images = (Array.isArray(body.images) ? body.images : [])
        .map((url) => cleanProductImage(url))
        .filter(Boolean)
        .slice(0, 8);
      const id = normalizeUuid(body.id);

      if (id) {
        const updated = await storePool.query(
          `UPDATE artflow.store_products
              SET name=$2, slug=$3, description=$4, hashtags=$5, price_cents=$6, stock=$7, status=$8,
                  category_id=$9, images=$10::jsonb, track_stock=$11,
                  sold_at=CASE
                    WHEN $8='sold' AND sold_at IS NULL THEN now()
                    WHEN $8<>'sold' THEN NULL
                    ELSE sold_at
                  END,
                  updated_at=now()
            WHERE id=$1 AND business_id=$12
            RETURNING *`,
          [id, name, slugify(name), description, hashtags, price, stock, status, categoryId, JSON.stringify(images),
           body.track_stock !== false, businessId]
        );
        if (!updated.rows[0]) return res.status(404).json({ error: 'Product not found' });
        return res.status(200).json({ product: updated.rows[0] });
      }

      const created = await storePool.query(
        `INSERT INTO artflow.store_products (business_id, category_id, name, slug, description, hashtags, price_cents, stock, status, images, track_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         RETURNING *`,
        [businessId, categoryId, name, slugify(name), description, hashtags, price, stock, status, JSON.stringify(images),
         body.track_stock !== false]
      );
      return res.status(200).json({ product: created.rows[0] });
    }

    if (action === 'product_status') {
      const id = normalizeUuid(body.id);
      const status = String(body.status || '');
      if (!id || !['active', 'sold'].includes(status)) {
        return res.status(400).json({ error: 'Invalid product status' });
      }
      const updated = await storePool.query(
        `UPDATE artflow.store_products
            SET status=$2,
                sold_at=CASE WHEN $2='sold' THEN COALESCE(sold_at,now()) ELSE NULL END,
                updated_at=now()
          WHERE id=$1 AND business_id=$3
          RETURNING *`,
        [id, status, businessId]
      );
      if (!updated.rows[0]) return res.status(404).json({ error: 'Product not found' });
      return res.status(200).json({ product: updated.rows[0] });
    }

    if (action === 'product_delete') {
      const id = normalizeUuid(body.id);
      if (!id) return res.status(400).json({ error: 'Missing product' });
      await storePool.query(`DELETE FROM artflow.store_products WHERE id=$1 AND business_id=$2`, [id, businessId]);
      return res.status(200).json({ ok: true });
    }

    if (action === 'category_save') {
      const name = clean(body.name, 100);
      if (!name) return res.status(400).json({ error: 'Category name is required' });
      const id = normalizeUuid(body.id);
      if (id) {
        const updated = await storePool.query(
          `UPDATE artflow.store_categories SET name=$2, slug=$3 WHERE id=$1 AND business_id=$4 RETURNING *`,
          [id, name, slugify(name), businessId]
        );
        if (!updated.rows[0]) return res.status(404).json({ error: 'Category not found' });
        return res.status(200).json({ category: updated.rows[0] });
      }
      const created = await storePool.query(
        `INSERT INTO artflow.store_categories (business_id, name, slug) VALUES ($1,$2,$3) RETURNING *`,
        [businessId, name, slugify(name)]
      );
      return res.status(200).json({ category: created.rows[0] });
    }

    if (action === 'category_delete') {
      const id = normalizeUuid(body.id);
      if (!id) return res.status(400).json({ error: 'Missing category' });
      await storePool.query(`DELETE FROM artflow.store_categories WHERE id=$1 AND business_id=$2`, [id, businessId]);
      return res.status(200).json({ ok: true });
    }

    if (action === 'order_update') {
      const id = normalizeUuid(body.id);
      const status = String(body.status || '');
      if (!id || !ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid order update' });
      const updated = await storePool.query(
        `UPDATE artflow.store_orders SET status=$2, updated_at=now()
          WHERE id=$1 AND (business_id=$3 OR $3 IS NULL) RETURNING *`,
        [id, status, businessId]
      );
      if (!updated.rows[0]) return res.status(404).json({ error: 'Order not found' });
      if (status === 'paid' || status === 'completed') {
        await storePool.query(
          `UPDATE artflow.store_payments SET status='succeeded'
            WHERE order_id=$1 AND provider='stripe' AND status='pending'`,
          [id]
        );
      }
      if (status === 'cancelled') {
        await storePool.query(
          `UPDATE artflow.store_payments SET status='failed'
            WHERE order_id=$1 AND provider='stripe' AND status='pending'`,
          [id]
        );
      }
      return res.status(200).json({ order: updated.rows[0] });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('store admin error', error?.message);
    return res.status(500).json({ error: 'Could not complete that request' });
  }
}