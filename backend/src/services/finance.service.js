/**
 * Finance domain (db-prd §4/§5): quotations, invoices, payments, expenses.
 * Rules per master-prd §8:
 *   total = subtotal + tax − discount · outstanding = total − paid
 *   UNPAID → PARTIALLY_PAID → PAID (overpayment rejected; OVERDUE past due_date)
 * INSTITUTION may pay own invoices; only ORGANIZATION creates documents.
 * Async facade throughout.
 */
const db = require('../db');
const { badRequest, forbidden, notFound } = require('../utils/http');
const { round2 } = require('../utils/numbers');
const { docTotals, outstandingOf, invoiceStatus } = require('../utils/money');
const { requireFields, str, positiveAmount } = require('../utils/validate');
const { nid } = require('../utils/ids');
const { canSeeCustomer } = require('./scope.service');

// ---------- Quotations ----------
async function listQuotations(scope, { archived = false } = {}) {
  const arch = archived ? 'q.archived_at IS NOT NULL' : 'q.archived_at IS NULL';
  if (scope.role === 'organization') {
    return db.query(
      `SELECT q.*, c.name AS customer_name FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
       WHERE ${arch}
       ORDER BY q.created_at DESC, q.quotation_key DESC`
    );
  }
  if (scope.role === 'institution' && scope.customer_id) {
    return db.query(
      `SELECT q.*, c.name AS customer_name FROM quotations q
        LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.customer_id = ? AND ${arch}
       ORDER BY q.created_at DESC, q.quotation_key DESC`,
      [scope.customer_id]
    );
  }
  throw forbidden('Not authorized');
}

async function createQuotation(body = {}) {
  requireFields(body, ['customer_id']);
  const customer = await db.get('SELECT id FROM customers WHERE id = ?', [str(body.customer_id)]);
  if (!customer) throw badRequest('Unknown customer_id');
  const items = Array.isArray(body.items) && body.items.length
    ? body.items
    : [{ description: body.program || 'Training', qty: 1, rate: body.expected_value || 100000 }];
  const { lines, subtotal, discount, tax, total } = docTotals(items, { discount_amount: body.discount });
  const id = await nid(db, 'QUO', 'quotations');
  await db.run(
    'INSERT INTO quotations (id,customer_id,program,subtotal,discount,tax,total,status) VALUES (?,?,?,?,?,?,?,?)',
    [id, str(body.customer_id), body.program || null, subtotal, discount, tax, total, body.status || 'DRAFT']
  );
  for (let i = 0; i < items.length; i++) {
    await db.run(
      'INSERT INTO quotation_items (quotation_id,description,qty,rate,amount) VALUES (?,?,?,?,?)',
      [id, items[i].description || 'Training', items[i].qty || 1, items[i].rate || 0, lines[i]]
    );
  }
  return db.get('SELECT * FROM quotations WHERE id = ?', [id]);
}

// ---------- Invoices ----------
async function listInvoices(scope, { archived = false } = {}) {
  const arch = archived ? 'i.archived_at IS NOT NULL' : 'i.archived_at IS NULL';
  if (scope.role === 'organization') {
    return db.query(
      `SELECT i.*, c.name AS customer_name FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
       WHERE ${arch}
       ORDER BY i.created_at DESC, i.invoice_key DESC`
    );
  }
  if (scope.role === 'institution' && scope.customer_id) {
    return db.query(
      `SELECT i.*, c.name AS customer_name FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.customer_id = ? AND ${arch}
       ORDER BY i.created_at DESC, i.invoice_key DESC`,
      [scope.customer_id]
    );
  }
  throw forbidden('Not authorized');
}

async function getInvoice(scope, invoiceId) {
  const inv = await db.get(
    `SELECT i.*, c.name AS customer_name FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [invoiceId]
  );
  if (!inv) throw notFound('Invoice not found');
  if (!(await canSeeCustomer(db, scope, inv.customer_id))) throw forbidden('Not authorized for this invoice');
  inv.items = await db.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_key', [invoiceId]);
  inv.payments = await db.query(
    'SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC, payment_key DESC',
    [invoiceId]
  );
  return inv;
}

async function createInvoice(body = {}) {
  requireFields(body, ['customer_id']);
  const customer = await db.get('SELECT id FROM customers WHERE id = ?', [str(body.customer_id)]);
  if (!customer) throw badRequest('Unknown customer_id');
  const items = Array.isArray(body.items) && body.items.length
    ? body.items
    : [{ description: body.program || 'Training', qty: 1, rate: 100000 }];
  const { lines, subtotal, discount, tax, total } = docTotals(items, { discount_amount: body.discount });
  const id = await nid(db, 'INV', 'invoices');
  await db.run(
    `INSERT INTO invoices (id,customer_id,quotation_id,program,subtotal,discount,tax,total,paid,outstanding,status,due_date)
     VALUES (?,?,?,?,?,?,?,?,0,?,'UNPAID',?)`,
    [id, str(body.customer_id), body.quotation_id || null, body.program || null,
      subtotal, discount, tax, total, total, body.due_date || null]
  );
  for (let i = 0; i < items.length; i++) {
    await db.run(
      'INSERT INTO invoice_items (invoice_id,description,qty,rate,amount) VALUES (?,?,?,?,?)',
      [id, items[i].description || 'Training', items[i].qty || 1, items[i].rate || 0, lines[i]]
    );
  }
  return db.get('SELECT * FROM invoices WHERE id = ?', [id]);
}

// ---------- Payments ----------
async function listPayments(scope) {
  if (scope.role === 'organization') {
    return db.query(
      `SELECT p.*, c.name AS customer_name FROM payments p
        LEFT JOIN invoices i ON i.id = p.invoice_id
        LEFT JOIN customers c ON c.id = i.customer_id
       ORDER BY p.created_at DESC, p.payment_key DESC LIMIT 100`
    );
  }
  if (scope.role === 'institution' && scope.customer_id) {
    return db.query(
      `SELECT p.*, c.name AS customer_name FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.customer_id = ?
       ORDER BY p.created_at DESC, p.payment_key DESC LIMIT 100`,
      [scope.customer_id]
    );
  }
  throw forbidden('Not authorized');
}

/** Record a payment: > 0, ≤ outstanding; org anywhere, institution own only. */
async function createPayment(scope, body = {}) {
  requireFields(body, ['invoice_id']);
  const inv = await db.get('SELECT * FROM invoices WHERE id = ?', [str(body.invoice_id)]);
  if (!inv) throw notFound('Invoice not found');
  const allowed = scope.role === 'organization'
    || (scope.role === 'institution' && scope.customer_id === inv.customer_id);
  if (!allowed) throw forbidden('Not authorized to pay this invoice');

  const amount = positiveAmount(body.amount, 'Amount');
  const currentOutstanding = outstandingOf(inv.total, inv.paid);
  if (amount > currentOutstanding + 0.001) {
    throw badRequest(`Amount exceeds outstanding (₹${currentOutstanding})`);
  }

  return db.transaction(async (tx) => {
    const id = await nid(tx, 'PAY', 'payments');
    await tx.run(
      'INSERT INTO payments (id,invoice_id,customer_id,amount,method,date,reference,notes) VALUES (?,?,?,?,?,?,?,?)',
      [id, inv.id, inv.customer_id, amount, str(body.method) || 'Bank Transfer',
        str(body.date) || new Date().toISOString().slice(0, 10), str(body.reference) || '', str(body.notes) || '']
    );
    const paid = round2(await tx.count('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?', [inv.id]));
    const outstanding = outstandingOf(inv.total, paid);
    const status = invoiceStatus({ total: inv.total, paid, due_date: inv.due_date });
    await tx.run('UPDATE invoices SET paid = ?, outstanding = ?, status = ? WHERE id = ?', [paid, outstanding, status, inv.id]);
    return { id, paid, outstanding, status };
  });
}

// ---------- Expenses ----------
/**
 * Expenses carry their linkage inline (audit E5 / D21): the customer and batch
 * a cost belongs to, plus the trainer it pays. Joining here means every list
 * read already shows the attribution without a second round-trip.
 */
async function listExpenses({ archived = false } = {}) {
  const arch = archived ? 'e.archived_at IS NOT NULL' : 'e.archived_at IS NULL';
  return db.query(
    `SELECT e.*, c.name AS customer_name, b.id AS batch_label, t.name AS trainer_name
       FROM expenses e
       LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN batches  b ON b.id = e.batch_id
       LEFT JOIN trainers t ON t.id = e.trainer_id
      WHERE ${arch}
      ORDER BY e.date DESC, e.expense_key DESC LIMIT 200`
  );
}

/** Trainer may file OWN claim (starts PENDING); org records anything. */
async function createExpense(scope, body = {}) {
  requireFields(body, ['amount']);
  let trainerId = str(body.trainer_id) || null;
  let status = body.status || 'APPROVED';
  if (scope.role === 'trainer') {
    if (!scope.trainer_id) throw forbidden('Not authorized');
    trainerId = scope.trainer_id;
    status = 'PENDING';
  } else if (scope.role !== 'organization') {
    throw forbidden('Organization access only');
  }

  // Optional linkage — validated so a typo can never create an orphan link.
  const customerId = str(body.customer_id) || null;
  const batchId = str(body.batch_id) || null;
  if (customerId && !(await db.get('SELECT id FROM customers WHERE id = ?', [customerId]))) {
    throw badRequest('Unknown customer_id');
  }
  if (batchId && !(await db.get('SELECT id FROM batches WHERE id = ?', [batchId]))) {
    throw badRequest('Unknown batch_id');
  }
  if (trainerId && !(await db.get('SELECT id FROM trainers WHERE id = ?', [trainerId]))) {
    throw badRequest('Unknown trainer_id');
  }

  const id = await nid(db, 'EXP', 'expenses');
  await db.run(
    `INSERT INTO expenses (id,date,category,vendor,description,amount,trainer_id,customer_id,batch_id,status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, str(body.date) || new Date().toISOString().slice(0, 10), str(body.category) || 'Other',
      str(body.vendor) || '', str(body.description) || '', round2(Number(body.amount)), trainerId,
      customerId, batchId, status]
  );
  return db.get('SELECT * FROM expenses WHERE id = ?', [id]);
}

/** Trainer self-service view: my payouts + my pending claims. */
async function trainerFinance(trainerId) {
  const rows = await db.query('SELECT * FROM expenses WHERE trainer_id = ? ORDER BY date DESC, expense_key DESC', [trainerId]);
  return {
    payouts: rows.filter((r) => r.category === 'Trainer'),
    claims: rows.filter((r) => r.category !== 'Trainer'),
    total_paid: round2(rows.filter((r) => r.status === 'PAID').reduce((x, r) => x + Number(r.amount || 0), 0)),
    pending: round2(rows.filter((r) => r.status === 'PENDING').reduce((x, r) => x + Number(r.amount || 0), 0)),
    rows,
  };
}

/** 1-click Quotation -> Invoice conversion (complete end-to-end traceability). */
async function convertQuotationToInvoice(scope, quotationId) {
  if (scope.role !== 'organization') throw forbidden('Organization access only');
  const quo = await db.get('SELECT * FROM quotations WHERE id = ?', [quotationId]);
  if (!quo) throw notFound('Quotation not found');

  const existing = await db.get('SELECT * FROM invoices WHERE quotation_id = ?', [quotationId]);
  if (existing) return existing;

  const items = await db.query('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY item_key', [quotationId]);
  const invoiceId = await nid(db, 'INV', 'invoices');
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO invoices (id, customer_id, quotation_id, program, subtotal, discount, tax, total, paid, outstanding, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,0,?,'UNPAID',?)`,
      [invoiceId, quo.customer_id, quo.id, quo.program, quo.subtotal, quo.discount, quo.tax, quo.total, quo.total, dueDate]
    );

    for (const item of items) {
      await tx.run(
        'INSERT INTO invoice_items (invoice_id, description, qty, rate, amount) VALUES (?,?,?,?,?)',
        [invoiceId, item.description, item.qty, item.rate, item.amount]
      );
    }

    await tx.run("UPDATE quotations SET status = 'ACCEPTED' WHERE id = ?", [quo.id]);
    return tx.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  });
}

async function updateExpense(scope, id, body = {}) {
  if (scope.role !== 'organization') throw forbidden('Organization access only');
  const exp = await db.get('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!exp) throw notFound('Expense not found');
  const status = body.status || (body.action === 'approve' ? 'APPROVED' : body.action === 'pay' ? 'PAID' : exp.status);
  await db.run('UPDATE expenses SET status = ? WHERE id = ?', [status, id]);

  // Linkage + details are editable, so a mis-attributed cost can be corrected
  // without deleting and re-entering it (audit E5 / D21).
  const linkable = [['customer_id', 'customers'], ['batch_id', 'batches'], ['trainer_id', 'trainers']];
  for (const [col, table] of linkable) {
    if (body[col] === undefined) continue;
    const val = str(body[col]) || null;
    if (val && !(await db.get(`SELECT id FROM ${table} WHERE id = ?`, [val]))) {
      throw badRequest(`Unknown ${col}`);
    }
    await db.run(`UPDATE expenses SET ${col} = ? WHERE id = ?`, [val, id]);
  }
  for (const col of ['category', 'vendor', 'description', 'date']) {
    if (body[col] !== undefined) {
      await db.run(`UPDATE expenses SET ${col} = ? WHERE id = ?`, [str(body[col]) || null, id]);
    }
  }
  if (body.amount !== undefined) {
    await db.run('UPDATE expenses SET amount = ? WHERE id = ?', [round2(Number(body.amount)), id]);
  }
  return db.get('SELECT * FROM expenses WHERE id = ?', [id]);
}

async function updateQuotation(scope, id, body = {}) {
  const quo = await db.get('SELECT * FROM quotations WHERE id = ?', [id]);
  if (!quo) throw notFound('Quotation not found');
  if (scope.role === 'institution' && quo.customer_id !== scope.customer_id) throw forbidden('Not authorized');
  const status = body.status || (body.action === 'accept' ? 'ACCEPTED' : body.action === 'reject' ? 'REJECTED' : quo.status);
  await db.run('UPDATE quotations SET status = ? WHERE id = ?', [status, id]);
  return db.get('SELECT * FROM quotations WHERE id = ?', [id]);
}

module.exports = {
  listQuotations, createQuotation, updateQuotation, convertQuotationToInvoice, listInvoices, getInvoice, createInvoice,
  listPayments, createPayment, listExpenses, createExpense, updateExpense, trainerFinance,
};
