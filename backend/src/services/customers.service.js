/**
 * Customers (institutions) + Customer 360 — the hero screen (uiux.md §8,
 * userflow FLOW O): one call → lead, training, finance, summary, collection risk.
 * Visible to organization (all), institution (own), trainer (institutions they
 * train at), student (their own institution). Async facade throughout.
 */
const db = require('../db');
const { notFound } = require('../utils/http');
const { round2 } = require('../utils/numbers');
const { outstandingOf } = require('../utils/money');
const { collectionRisk, maxOverdueDays } = require('../utils/risk');
const { canSeeCustomer, batchWithMeta } = require('./scope.service');

async function listCustomers(scope, { search = '' } = {}) {
  let rows;
  if (scope.role === 'organization') {
    rows = await db.query('SELECT * FROM customers ORDER BY id');
  } else if (scope.role === 'institution') {
    rows = await db.query('SELECT * FROM customers WHERE id = ?', [scope.customer_id]);
  } else if (scope.role === 'trainer' && scope.trainer_id) {
    rows = await db.query(
      `SELECT DISTINCT c.* FROM customers c
        JOIN batches b ON b.customer_id = c.id
       WHERE b.trainer_id = ? ORDER BY c.id`,
      [scope.trainer_id]
    );
  } else if (scope.role === 'student' && scope.student_id) {
    rows = await db.query(
      `SELECT c.* FROM customers c
        JOIN students s ON s.customer_id = c.id
       WHERE s.id = ? ORDER BY c.id`,
      [scope.student_id]
    );
  } else {
    rows = [];
  }
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toUpperCase().includes(search.toUpperCase())
    );
  }
  return rows;
}

async function getCustomer360(scope, customerId) {
  if (!(await canSeeCustomer(db, scope, customerId))) throw notFound('Customer not found');
  const c = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!c) throw notFound('Customer not found');

  const lead = c.lead_id ? await db.get('SELECT * FROM leads WHERE id = ?', [c.lead_id]) : null;
  const followups = lead
    ? await db.query('SELECT * FROM lead_followups WHERE lead_id = ? ORDER BY created_at DESC, followup_key DESC', [c.lead_id])
    : [];

  const batches = (
    await db.query('SELECT * FROM batches WHERE customer_id = ? ORDER BY id', [customerId])
  ).map((b) => batchWithMeta(db, b)); // promises resolved below

  const batchRows = await Promise.all(batches);

  const batchIds = batchRows.map((b) => b.id);
  let students = [];
  let attendanceByBatch = [];
  if (batchIds.length) {
    const ph = batchIds.map(() => '?').join(',');
    students = await db.query(
      `SELECT DISTINCT s.* FROM students s
        JOIN enrollments e ON e.student_id = s.id
       WHERE e.batch_id IN (${ph}) ORDER BY s.id`,
      batchIds
    );
    attendanceByBatch = await db.query(
      `SELECT batch_id, COUNT(*) AS total,
              SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present
         FROM attendance WHERE batch_id IN (${ph}) GROUP BY batch_id`,
      batchIds
    );
  }

  const quotations = await db.query(
    'SELECT * FROM quotations WHERE customer_id = ? ORDER BY created_at DESC, quotation_key DESC',
    [customerId]
  );
  const invoices = await db.query(
    'SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC, invoice_key DESC',
    [customerId]
  );
  const payments = await db.query(
    `SELECT p.* FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
     WHERE i.customer_id = ? ORDER BY p.created_at DESC, p.payment_key DESC`,
    [customerId]
  );

  const revenue = round2(invoices.reduce((s, i) => s + Number(i.total || 0), 0));
  const collected = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  const outstanding = round2(invoices.reduce((s, i) => s + outstandingOf(i.total, i.paid), 0));
  const overdueDays = maxOverdueDays(invoices);

  const studentCount = students.length;
  if (scope.role === 'institution') {
    students = [];
  }

  return {
    ...c,
    lead,
    followups,
    batches: batchRows,
    students,
    attendance: attendanceByBatch,
    quotations,
    invoices,
    payments,
    summary: {
      programs: batchRows.length,
      students: studentCount,
      revenue,
      collected,
      outstanding,
      net: round2(revenue - collected),
    },
    risk: collectionRisk({ outstanding, overdueDays, invoiceCount: invoices.length }),
  };
}

module.exports = { listCustomers, getCustomer360 };
