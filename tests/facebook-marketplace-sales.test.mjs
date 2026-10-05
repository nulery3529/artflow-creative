import test from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceImageUrl, parseSaleEmail } from '../api/_gmail-sales-core.mjs';

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


test('prefers Facebook Marketplace product thumbnail over Facebook email logo', () => {
  const html = [
    '<img width="32" height="32" src="https://www.facebook.com/images/email/facebook_icon.png" />',
    '<img width="64" height="64" src="https://scontent.xx.fbcdn.net/v/t45.5328-4/828925676_1384828573822816_4546459477707900126_n.jpg?stp=cp0_dst-jpg_s64x64_tt6&amp;_nc_cat=110" />',
    '<img width="1" height="1" src="https://www.facebook.com/email_open_log_pic.php?mid=abc" />',
  ].join('\n');

  const image = marketplaceImageUrl(
    'Facebook Marketplace',
    html,
    '8x8 Framed Crescent Moon Dreamcatcher Quilling Art Print'
  );

  assert.match(image, /^https:\/\/scontent\.xx\.fbcdn\.net\//i);
  assert.doesNotMatch(image, /facebook_icon\.png/i);
});
