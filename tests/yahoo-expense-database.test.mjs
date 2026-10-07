import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { insertYahooExpense } from '../api/yahoo-mail.mjs';

test('Yahoo receipt moved to another UID does not become another expense', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA artflow;
      CREATE TABLE artflow.expenses (
        base44_id text, business_id text, expense_date date, category text,
        amount numeric, archived boolean, source text, receipt_id text, created_by_id text,
        created_date timestamptz, updated_date timestamptz, data jsonb
      );
      CREATE TABLE artflow.email_import_messages (
        base44_id text, business_id text, message_id text, import_type text,
        status text, platform text, created_by_id text,
        created_date timestamptz, updated_date timestamptz, data jsonb
      )`);
    const client = { async query(sql, values) {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    }};
    const business = { base44_id: 'business', primary_email: 'owner@example.com' };
    const receipt = { from: 'receipts@shop.example', subject: 'Order confirmation',
      text: 'Paper purchase. Order total: $12.50', date: '2026-10-07', messageId: '<receipt@shop.example>' };
    assert.deepEqual(await insertYahooExpense(client, business, 'owner@example.com', 1, receipt), { imported: 1, skipped: 0 });
    assert.deepEqual(await insertYahooExpense(client, business, 'owner@example.com', 9, receipt), { imported: 0, skipped: 1 });
    assert.deepEqual(await insertYahooExpense(client, business, 'owner@example.com', 10, { ...receipt, messageId: '<another@shop.example>' }), { imported: 1, skipped: 0 });
    // Missing message IDs must not collapse unrelated receipts.
    await insertYahooExpense(client, business, 'owner@example.com', 11, { ...receipt, messageId: '' });
    await insertYahooExpense(client, business, 'owner@example.com', 12, { ...receipt, messageId: '' });
    const result = await db.query('SELECT amount FROM artflow.expenses');
    assert.equal(result.rows.length, 4);
    assert.ok(result.rows.every(row => Number(row.amount) === 12.50));
  } finally { await db.close(); }
});
