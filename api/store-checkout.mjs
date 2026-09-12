import { ensureStoreTables, storePool, parseBody, getCartToken, getStoreCustomer, normalizeUuid, clampInt, newOrderNumber } from './_store-core.mjs';

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const clean = (value = '', max = 200) => String(value || '').trim().slice(0, max);

const ADDRESS_FIELDS = ['label', 'recipient_name', 'line1', 'line2', 'city', 'region', 'postal_code', 'country'];

function readAddress(body) {
  const source = body.address && typeof body.address === 'object' ? body.address : {};
  const address = {};
  for (const field of ADDRESS_FIELDS) address[field] = clean(source[field], 160);
  if (!address.recipient_name) address.recipient_name = clean(body.name, 120);
  if (!address.country) address.country = 'US';
  return address;
}

// Places the order with server-side prices, records a pending Stripe payment,
// and (once STRIPE_SECRET_KEY is set) creates the Stripe Checkout session.
// Until the live Stripe account is connected the order stays pending and the
// seller confirms it from Store Orders.
async function createStripeCheckout(order, items, origin) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/shop/checkout?paid=1&order=${encodeURIComponent(order.order_number)}`);
  params.set('cancel_url', `${origin}/shop/checkout`);
  params.set('customer_email', order.email);
  items.forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, order.currency.toLowerCase());
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.price_cents));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!response.ok) {
    console.error('stripe checkout failed', await response.text().catch(() => ''));
    return null;
  }
  const session = await response.json();
  await storePool.query(
    `UPDATE artflow.store_payments SET provider_ref=$2 WHERE order_id=$1 AND provider='stripe' AND provider_ref IS NULL`,
    [order.id, session.id]
  );
  return session.url || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureStoreTables();
    const customer = await getStoreCustomer(req);
    const customerId = customer?.id || null;
    const cartToken = getCartToken(req);

    if (req.method === 'GET') {
      if (!customerId) return res.status(200).json({ addresses: [], customer: null });
      const addresses = await storePool.query(
        `SELECT * FROM artflow.store_addresses WHERE customer_id=$1 ORDER BY is_default DESC, created_at DESC`,
        [customerId]
      );
      return res.status(200).json({ addresses: addresses.rows, customer });
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'save_address') {
      if (!customerId) return res.status(401).json({ error: 'Sign in to save addresses' });
      const address = readAddress(body);
      if (!address.line1 || !address.city) return res.status(400).json({ error: 'Street address and city are required' });
      const id = normalizeUuid(body.id);
      if (id) {
        await storePool.query(
          `UPDATE artflow.store_addresses
              SET label=$2, recipient_name=$3, line1=$4, line2=$5, city=$6, region=$7, postal_code=$8, country=$9
            WHERE id=$1 AND customer_id=$10`,
          [id, address.label, address.recipient_name, address.line1, address.line2, address.city, address.region, address.postal_code, address.country, customerId]
        );
      } else {
        await storePool.query(
          `INSERT INTO artflow.store_addresses (customer_id, label, recipient_name, line1, line2, city, region, postal_code, country, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOT EXISTS (SELECT 1 FROM artflow.store_addresses WHERE customer_id=$1))`,
          [customerId, address.label, address.recipient_name, address.line1, address.line2, address.city, address.region, address.postal_code, address.country]
        );
      }
      const addresses = await storePool.query(
        `SELECT * FROM artflow.store_addresses WHERE customer_id=$1 ORDER BY is_default DESC, created_at DESC`,
        [customerId]
      );
      return res.status(200).json({ addresses: addresses.rows });
    }

    if (action === 'delete_address') {
      if (!customerId) return res.status(401).json({ error: 'Sign in to manage addresses' });
      const id = normalizeUuid(body.id);
      if (!id) return res.status(400).json({ error: 'Missing address' });
      await storePool.query(`DELETE FROM artflow.store_addresses WHERE id=$1 AND customer_id=$2`, [id, customerId]);
      const addresses = await storePool.query(
        `SELECT * FROM artflow.store_addresses WHERE customer_id=$1 ORDER BY is_default DESC, created_at DESC`,
        [customerId]
      );
      return res.status(200).json({ addresses: addresses.rows });
    }

    if (action === 'place_order') {
      const email = normalizeEmail(body.email) || customer?.email || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      const name = clean(body.name, 120) || customer?.name || '';
      const address = readAddress(body);
      if (!address.line1 || !address.city) return res.status(400).json({ error: 'Shipping street address and city are required' });
      const notes = clean(body.notes, 500);

      const items = (await storePool.query(
        `SELECT ci.product_id, ci.quantity, p.name, p.price_cents, p.currency, p.stock, p.track_stock, p.status, p.images, p.business_id
           FROM artflow.store_cart_items ci
           JOIN artflow.store_products p ON p.id = ci.product_id
          WHERE ci.cart_token=$1 OR ($2::uuid IS NOT NULL AND ci.customer_id=$2)
          ORDER BY ci.created_at`,
        [cartToken, customerId]
      )).rows.filter((row) => row.status === 'active');
      if (!items.length) return res.status(400).json({ error: 'Your cart is empty' });

      for (const item of items) {
        if (item.track_stock && item.quantity > item.stock) {
          return res.status(400).json({ error: `Only ${Math.max(item.stock, 0)} left of "${item.name}"` });
        }
      }

      const subtotal = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
      const shipping = 0;
      const currency = items[0].currency || 'USD';
      const businessId = items[0].business_id || null;

      const orderRows = await storePool.query(
        `INSERT INTO artflow.store_orders (business_id, customer_id, order_number, email, customer_name, status, subtotal_cents, shipping_cents, total_cents, currency, shipping_address, notes)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10::jsonb,$11)
         RETURNING *`,
        [businessId, customerId, newOrderNumber(), email, name, subtotal, shipping, subtotal + shipping, currency,
         JSON.stringify(address), notes]
      );
      const order = orderRows.rows[0];

      for (const item of items) {
        const image = Array.isArray(item.images) && item.images[0] ? String(item.images[0]) : null;
        await storePool.query(
          `INSERT INTO artflow.store_order_items (order_id, product_id, name, price_cents, quantity, image)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, item.product_id, item.name, item.price_cents, item.quantity, image]
        );
        if (item.track_stock) {
          await storePool.query(
            `UPDATE artflow.store_products SET stock = GREATEST(stock - $2, 0), updated_at=now() WHERE id=$1`,
            [item.product_id, item.quantity]
          );
        }
      }

      await storePool.query(
        `INSERT INTO artflow.store_payments (order_id, provider, amount_cents, currency, status)
         VALUES ($1,'stripe',$2,$3,'pending')`,
        [order.id, order.total_cents, order.currency]
      );

      await storePool.query(
        `DELETE FROM artflow.store_cart_items WHERE product_id = ANY($1::uuid[]) AND (cart_token=$2 OR ($3::uuid IS NOT NULL AND customer_id=$3))`,
        [items.map((item) => item.product_id), cartToken, customerId]
      );

      const checkoutUrl = await createStripeCheckout(
        { ...order, email },
        items.map((item) => ({ name: item.name, quantity: item.quantity, price_cents: item.price_cents })),
        process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : (req.headers?.origin || 'https://artflowcreative.com')
      );

      return res.status(200).json({
        order: { ...order, email },
        checkout_url: checkoutUrl,
        payment: { provider: 'stripe', status: 'pending', live: Boolean(checkoutUrl) },
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('store checkout error', error?.message);
    return res.status(500).json({ error: 'Could not complete checkout' });
  }
}