import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { recordImport } from '../api/gmail-expense-sync.mjs';

test('Gmail expense import can insert and later update a receipt checkpoint', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA artflow;
      CREATE TABLE artflow.email_import_messages (
        base44_id text, business_id text, message_id text, import_type text,
        status text, platform text, created_by_id text,
        created_date timestamptz, updated_date timestamptz, data jsonb
      )`);
    const client = { async query(sql, values) {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }};
    const receipt = { businessId: 'business', messageId: 'receipt-1', createdBy: 'owner',
      status: 'imported', details: 'Imported expense' };
    await recordImport(client, receipt);
    await recordImport(client, { ...receipt, status: 'skipped', details: 'Duplicate expense email' });
    const result = await db.query('SELECT status, created_by_id, data FROM artflow.email_import_messages');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, 'skipped');
    assert.equal(result.rows[0].created_by_id, 'owner');
    assert.equal(result.rows[0].data.details, 'Duplicate expense email');
  } finally { await db.close(); }
});
