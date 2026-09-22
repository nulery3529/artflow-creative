import test from 'node:test';
import assert from 'node:assert/strict';

import { GMAIL_QUERIES, parsePoshmarkCancellation, parseSaleEmail } from '../api/_gmail-sales-core.mjs';

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


test('parses a prefixed Poshmark sold email with smart quotes', () => {
  const rows = parseSaleEmail(
    'Poshmark <orders@poshmark.com>',
    'Congrats! “8x8 Celestial Skeleton Print” just sold to @moonbuyer on Poshmark!',
    'Order ID: smart-123\nItem Price: $18.00\nPackaging Reminder'
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, 'Poshmark');
  assert.equal(rows[0].sale_total, 18);
  assert.equal(rows[0].order_id, 'smart-123');
});


test('sums item prices for a legacy Poshmark bundle without a total line', () => {
  const rows = parseSaleEmail(
    'Poshmark <orders@poshmark.com>',
    '"Bundle of Tulip Art and 1 more item" just sold to @buyer on Poshmark!',
    [
      'Great news - you just sold 2 items in a bundle.',
      'Order ID',
      'legacy-bundle-2',
      'Item',
      'Price',
      '8x8 Tulip Art',
      '$12.00',
      '8x8 Floral Art',
      '$12.00',
      'Your Earnings (minus fee and taxes) $19.20',
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].sale_total, 24);
  assert.equal(rows[0].unit_price, 12);
});

test('uses discounted Total Price for a legacy Poshmark bundle', () => {
  const rows = parseSaleEmail(
    'Poshmark <orders@poshmark.com>',
    '"Bundle of Quilling Art and 2 more items" just sold to @buyer on Poshmark!',
    [
      'Great news - you just sold 3 items in a bundle.',
      'Order ID',
      'legacy-bundle-3',
      'Item',
      'Price',
      'Art One',
      '$12.00',
      'Art Two',
      '$18.00',
      'Art Three',
      '$12.00',
      'Subtotal $42.00',
      'Seller Discount (20%) -$8.40',
      'Total Price $33.60',
      'Your Earnings (minus fee and taxes) $26.88',
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].sale_total, 33.6);
  assert.equal(rows[0].unit_price, 11.2);
});


test('recognizes a Poshmark cancellation and its order id', () => {
  const cancellation = parsePoshmarkCancellation(
    'Please do not ship: "Bundle of 8x8 Paper Quilling Tulip Wall and 1 more item" for @mellymelteaches was canceled',
    [
      'Re: Order Id 6aa45ffa0826402f6551ab6f',
      'Hi Natasha\'s closet,',
      'We wanted to let you know that this order was canceled.',
    ].join('\n')
  );

  assert.deepEqual(cancellation, {
    order_id: '6aa45ffa0826402f6551ab6f',
    product_name: 'Bundle of 8x8 Paper Quilling Tulip Wall and 1 more item',
  });
});

test('Gmail sync includes Poshmark cancellation messages', () => {
  assert.ok(
    GMAIL_QUERIES.some((query) => /poshmark/i.test(query) && /Please do not ship/i.test(query) && /canceled/i.test(query))
  );
});
