/**
 * Cross-role visibility helpers — db-prd §0 scope rule:
 *   ORGANIZATION sees all · INSTITUTION via customer_id · TRAINER via assigned
 *   batches (dev port: batches.trainer_id) · STUDENT via own enrollments.
 * Every scoped query routes through here. Async throughout (facade).
 */
const { forbidden } = require('../utils/http');

const trainerBatchIds = (db, trainerId) =>
  db.query('SELECT id FROM batches WHERE trainer_id = ?', [trainerId]).then((rows) => rows.map((r) => r.id));

const studentBatchIds = (db, studentId) =>
  db.query('SELECT batch_id AS id FROM enrollments WHERE student_id = ?', [studentId]).then((rows) => rows.map((r) => r.id));

/**
 * Batch ids visible to a scope.
 * @returns {Promise<string[]|null>} null = unrestricted (organization), [] = nothing visible
 */
async function visibleBatchIds(db, scope) {
  if (scope.role === 'organization') return null;
  if (scope.role === 'institution' && scope.customer_id) {
    const rows = await db.query('SELECT id FROM batches WHERE customer_id = ?', [scope.customer_id]);
    return rows.map((r) => r.id);
  }
  if (scope.role === 'trainer' && scope.trainer_id) return trainerBatchIds(db, scope.trainer_id);
  if (scope.role === 'student' && scope.student_id) return studentBatchIds(db, scope.student_id);
  return [];
}

async function canSeeBatch(db, scope, batchId) {
  const v = await visibleBatchIds(db, scope);
  return v === null || v.includes(batchId);
}

/** Guard for batch-scoped reads; 403 per FLOW I (trainer blocked from other batches). */
async function assertBatchVisible(db, scope, batchId) {
  if (!(await canSeeBatch(db, scope, batchId))) {
    throw forbidden('You are not authorized to access this batch');
  }
}

async function canSeeCustomer(db, scope, customerId) {
  if (scope.role === 'organization') return true;
  if (scope.role === 'institution') return scope.customer_id === customerId;
  if (scope.role === 'trainer' && scope.trainer_id) {
    const row = await db.get(
      'SELECT 1 AS ok FROM batches WHERE trainer_id = ? AND customer_id = ?',
      [scope.trainer_id, customerId]
    );
    return row != null;
  }
  if (scope.role === 'student' && scope.student_id) {
    const row = await db.get(
      'SELECT 1 AS ok FROM students WHERE id = ? AND customer_id = ?',
      [scope.student_id, customerId]
    );
    return row != null;
  }
  return false;
}

/** Enrich batch rows with the joins every list/detail screen renders. */
async function batchWithMeta(db, row) {
  if (!row) return row;
  const program = await db.get('SELECT name FROM programs WHERE id = ?', [row.program_id]);
  const customer = await db.get('SELECT name FROM customers WHERE id = ?', [row.customer_id]);
  const trainer = row.trainer_id
    ? await db.get('SELECT name FROM trainers WHERE id = ?', [row.trainer_id])
    : null;
  const c = await db.count('SELECT COUNT(*) FROM enrollments WHERE batch_id = ?', [row.id]);
  return {
    ...row,
    program_name: program ? program.name : null,
    customer_name: customer ? customer.name : null,
    trainer_name: trainer ? trainer.name : null,
    student_count: c,
  };
}

module.exports = {
  visibleBatchIds,
  canSeeBatch,
  assertBatchVisible,
  canSeeCustomer,
  assertCustomerVisible: async (db, scope, customerId) => {
    if (!(await canSeeCustomer(db, scope, customerId))) throw forbidden('Not authorized for this institution');
  },
  trainerBatchIds,
  studentBatchIds,
  batchWithMeta,
};
