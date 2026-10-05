import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSaleEmail } from '../api/_gmail-sales-core.mjs';

test('parses Facebook Marketplace seller order email', () => {
  const rows = parseSaleEmail(
    'Facebook Marketplace <noreply@marketplace.facebook.com>',
    'New Marketplace order for 8x8 Framed Crescent Moon Dreamcatcher Quilling Art Print',
    [
      'Hi Seller,',
      'Congrats on your Marketplace order!',
      '8x8 Framed Crescent Moon Dreamcatcher Quilling Art Print',
      '$10.00',
      'To be shipped',
      'https://www.facebook.com/marketplace/you/shipping_orders/10235160679743320/?listing_id=1767307497902658',
      'This message was sent about a recent sale on Facebook.',
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, 'Facebook Marketplace');
  assert.equal(rows[0].product_name, '8x8 Framed Crescent Moon Dreamcatcher Quilling Art Print');
  assert.equal(rows[0].sale_total, 10);
  assert.equal(rows[0].quantity, 1);
  assert.equal(rows[0].size, '8x8');
  assert.equal(rows[0].order_id, '10235160679743320');
  assert.equal(
    rows[0].source_url,
    'https://www.facebook.com/marketplace/you/shipping_orders/10235160679743320/'
  );
});

test('does not count Facebook Marketplace shipping label email as a new sale', () => {
  const rows = parseSaleEmail(
    'Facebook Marketplace <noreply@marketplace.facebook.com>',
    'Shipping label for your Marketplace order',
    [
      'Your prepaid shipping label is attached.',
      'Please ship this item by Thursday.',
      '5x7 Framed Art Print',
      '$10.00',
    ].join('\n')
  );

  assert.deepEqual(rows, []);
});
