import { ensureStoreTables, storePool } from './_store-core.mjs';

// Public storefront catalog — shared by the web storefront and the iOS app.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureStoreTables();
    const resource = String(req.query?.resource || 'catalog');

    if (resource === 'product') {
      const id = String(req.query?.id || '').trim();
      const result = await storePool.query(
        `SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.currency, p.stock, p.track_stock, p.images, p.category_id,
                c.name AS category_name
           FROM artflow.store_products p
           LEFT JOIN artflow.store_categories c ON c.id = p.category_id
          WHERE p.status = 'active' AND (p.id::text = $1 OR p.slug = $1)
          LIMIT 1`,
        [id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
      const related = await storePool.query(
        `SELECT id, name, price_cents, currency, images FROM artflow.store_products
          WHERE status='active' AND category_id IS NOT NULL AND category_id = $1 AND id <> $2
          ORDER BY created_at DESC LIMIT 4`,
        [result.rows[0].category_id, result.rows[0].id]
      );
      return res.status(200).json({ product: result.rows[0], related: related.rows });
    }

    const products = await storePool.query(`
      SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.currency, p.stock, p.track_stock, p.images, p.category_id, p.created_at,
             c.name AS category_name
        FROM artflow.store_products p
        LEFT JOIN artflow.store_categories c ON c.id = p.category_id
       WHERE p.status = 'active'
       ORDER BY p.created_at DESC`);
    const categories = await storePool.query(`
      SELECT c.id, c.name, c.slug, count(p.id)::int AS product_count
        FROM artflow.store_categories c
        LEFT JOIN artflow.store_products p ON p.category_id = c.id AND p.status = 'active'
       GROUP BY c.id, c.name, c.slug
       ORDER BY c.name`);
    return res.status(200).json({ products: products.rows, categories: categories.rows });
  } catch (error) {
    console.error('store catalog error', error?.message);
    return res.status(500).json({ error: 'Store is unavailable right now' });
  }
}