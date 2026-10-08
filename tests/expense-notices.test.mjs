import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFor, isNonExpenseNotice, originalSubject } from '../api/gmail-expense-sync.mjs';

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

test('purchased item category wins over incidental checkout fees', () => {
  assert.equal(categoryFor('Your receipt for "Matte photo paper"',
    'Order Matte photo paper Paid $7.89 Buyer Protection fee $1.20'), 'Paper & Print Media');
  assert.equal(categoryFor('Your receipt for "Picture Frames"',
    'Order Picture Frames Paid $5.18 Buyer Protection fee $0.90'), 'Frames & Display');
  assert.equal(categoryFor('Your monthly eBay fee invoice',
    'Listing fee $12.00'), 'Marketplace & Selling Fees');
});
