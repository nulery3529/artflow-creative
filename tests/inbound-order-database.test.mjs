import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { insertRows } from '../api/inbound-orders.mjs';

test('forwarded sales with missing order IDs import once in PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA artflow;
      CREATE TABLE artflow.orders (
        base44_id text, business_id text, sale_date text, platform text,
        archived boolean, order_id text, source_email_id text, created_by_id text,
        created_date timestamptz, updated_date timestamptz, data jsonb,
        product_name text, quantity int, size text, unit_price numeric,
        sale_total numeric, buyer text, base_item_cost numeric, paper_ink_cost numeric,
        packaging_cost numeric, total_cost numeric, estimated_profit numeric, sync_source text
      )`);
    const client = { async query(sql, values) {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }};
    const row = { platform: 'Vinted', order_id: null, product_name: '8x10 Framed Art',
      quantity: 2, size: '8x10', unit_price: 10, sale_total: 20, buyer: 'Buyer' };
    assert.equal((await insertRows(client, 'business', 'receipt-1', '2026-10-06T14:00:00Z', [row])).length, 1);
    assert.equal((await insertRows(client, 'business', 'receipt-1', '2026-10-06T14:00:00Z', [row])).length, 0);
    const saved = await db.query('SELECT order_id, quantity, sale_total FROM artflow.orders');
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0].order_id, null);
    assert.equal(saved.rows[0].quantity, 2);
    assert.equal(Number(saved.rows[0].sale_total), 20);
  } finally { await db.close(); }
});
