const { round2 } = require('./numbers');

/** A line item: amount = qty × rate (line-level discount/tax are Phase-2 refinements). */
function lineAmount({ qty = 1, rate = 0 }) {
  return round2(Number(qty || 0) * Number(rate || 0));
}

/**
 * Document totals per master-prd §8:
 *   subtotal = Σ(qty × rate)
 *   total    = subtotal + tax − discount, tax computed on (subtotal − discount)
 */
function docTotals(items = [], { discount_amount = 0, tax_rate } = {}) {
  const defaultRate = require('../config').defaultTaxRate;
  const rate = Number(tax_rate != null ? tax_rate : defaultRate) || 0;

  const lines = items.map((it) => lineAmount(it));
  const subtotal = round2(lines.reduce((s, n) => s + n, 0));
  const discount = round2(Math.min(Math.max(Number(discount_amount) || 0, 0), subtotal));
  const tax = round2(((subtotal - discount) * rate) / 100);
  const total = round2(subtotal - discount + tax);

  return { lines, subtotal, discount, tax, total, taxRate: rate };
}

/** Outstanding = invoice_total − total_paid (never below 0). */
function outstandingOf(total, paid) {
  return round2(Math.max(0, Number(total || 0) - Number(paid || 0)));
}

/**
 * Invoice status per master-prd §8 / db-prd §5:
 *   paid >= total → PAID · 0 < paid < total → PARTIALLY_PAID · paid == 0 → UNPAID
 *   any outstanding past due_date → OVERDUE
 */
function invoiceStatus({ total, paid, due_date }, today = new Date()) {
  const outstanding = outstandingOf(total, paid);
  if (outstanding <= 0.01) return 'PAID';
  const overdue = !!due_date && new Date(`${due_date}T23:59:59`) < today;
  if (overdue) return 'OVERDUE';
  return Number(paid || 0) > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}

module.exports = { lineAmount, docTotals, outstandingOf, invoiceStatus };
