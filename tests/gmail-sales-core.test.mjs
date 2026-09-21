import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSaleEmail } from '../api/_gmail-sales-core.mjs';

test('parses a multiline Poshmark sold email with the full item price', () => {
  const rows = parseSaleEmail(
    'Poshmark <orders@poshmark.com>',
    '"8x10 Plum Botanical Art Print" just sold to @artbuyer on Poshmark!',
    [
      'Order ID',
      'abc-123-def',
      'Item',
      'Price',
      '8x10 Plum Botanical Art Print',
      '$24.00',
      'Your Earnings',
      '$19.20',
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, 'Poshmark');
  assert.equal(rows[0].order_id, 'abc-123-def');
  assert.equal(rows[0].sale_total, 24);
  assert.equal(rows[0].buyer, 'artbuyer');
});

test('parses a forwarded Poshmark sold email with an inline item price', () => {
  const rows = parseSaleEmail(
    'orders@poshmark.com',
    'Fwd: "5x7 Skeleton Floral Print" just sold to @collector on Poshmark!',
    'Order ID: 9988-7766\nItem Price: $12.50\nPackaging Reminder'
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_name, '5x7 Skeleton Floral Print');
  assert.equal(rows[0].sale_total, 12.5);
  assert.equal(rows[0].size, '5x7');
});

test('ignores unrelated Poshmark email subjects', () => {
  const rows = parseSaleEmail(
    'orders@poshmark.com',
    'Your weekly Poshmark report',
    'Item Price: $20.00'
  );

  assert.deepEqual(rows, []);
});


test('uses the accepted offer price for a Poshmark bundle', () => {
  const rows = parseSaleEmail(
    'Poshmark <orders@poshmark.com>',
    '"Bundle of 8 X 8 Framed Quilled Bear and 1 more item" just sold to @confusedfox on Poshmark!',
    [
      'Great news - you just sold 2 items in a bundle.',
      'Order ID',
      '6aafc5d18fa3339dfdab5614',
      'Item',
      'Price',
      '8 X 8 Framed Quilled Bear Family Cd 39',
      'Size: OS',
      '$12.00',
      '8 X 8 Framed Quilled Wolf And Edf 5',
      'Size: OS',
      '$18.00',
      'Offer Price $25.00',
      'Shipping Discount -$1.50',
      'Your Earnings (minus fee and taxes) $18.50',
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, 'Poshmark');
  assert.equal(rows[0].order_id, '6aafc5d18fa3339dfdab5614');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].sale_total, 25);
  assert.equal(rows[0].unit_price, 12.5);
});
