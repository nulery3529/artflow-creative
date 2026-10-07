import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonExpenseNotice, originalSubject } from '../api/gmail-expense-sync.mjs';

test('delivery status messages do not create additional purchase expenses', () => {
  for (const subject of ['📦ORDER DELIVERED: Printer ink', 'OUT FOR DELIVERY: Paper',
    'Your order has been shipped', 'Your package is delivered', 'Tracking update']) {
    assert.equal(isNonExpenseNotice(subject), true, subject);
  }
  assert.equal(isNonExpenseNotice(originalSubject('ArtFlow Expense',
    'Subject: OUT FOR DELIVERY: Paper\nOrder total: $12.50')), true);
});

test('purchase receipts and separately purchased postage remain eligible', () => {
  for (const subject of ['Order confirmation', 'Your receipt for photo paper',
    'Your shipping label is ready', 'Postage payment receipt', 'Invoice for delivery services']) {
    assert.equal(isNonExpenseNotice(subject), false, subject);
  }
});
