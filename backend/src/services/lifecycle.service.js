/**
 * Record lifecycle (audit D8): soft archive / restore, and duplicate merge.
 *
 * Delete already existed (hard DELETE, FK-guarded). This adds the two missing
 * lifecycle operations:
 *   - archive  : stamp `archived_at`; the row disappears from list reads but
 *                keeps every FK pointing at it, so history stays intact.
 *   - restore  : clear `archived_at`.
 *   - merge    : fold a duplicate into a primary — fill the primary's blank
 *                fields, re-point dependent rows, then archive the duplicate.
 *                Never hard-deletes, so the audit trail survives a merge.
 *
 * Table and column names are whitelisted (never taken from user input), so the
 * dynamic SQL below cannot be used for injection.
 *
 * Async facade throughout.
 */
const db = require('../db');
const { badRequest, notFound, forbidden } = require('../utils/http');
const { str } = require('../utils/validate');

const nowIso = () => new Date().toISOString();

/**
 * Archivable entities. `roles` mirrors the existing DELETE guards (org owns the
 * platform; students additionally belong to trainer/institution).
 */
const ENTITIES = {
  leads: { label: 'Lead', roles: ['organization'] },
  customers: { label: 'Customer', roles: ['organization'] },
  students: { label: 'Student', roles: ['trainer', 'institution', 'organization'] },
  batches: { label: 'Batch', roles: ['organization'] },
  quotations: { label: 'Quotation', roles: ['organization'] },
  invoices: { label: 'Invoice', roles: ['organization'] },
  expenses: { label: 'Expense', roles: ['organization'] },
  trainers: { label: 'Trainer', roles: ['organization'] },
  programs: { label: 'Program', roles: ['organization'] },
};

/**
 * Merge rules per entity.
 *   fill           : columns copied from the duplicate when the primary is blank
 *   repoint        : [table, column] pairs re-pointed at the primary
 *   beforeRepoint  : optional hook to de-duplicate UNIQUE child rows first
 */
const MERGE = {
  leads: {
    fill: ['email', 'phone', 'requirement', 'program', 'source', 'owner', 'assigned_to', 'expected_students', 'expected_value'],
    repoint: [['lead_followups', 'lead_id']],
    beforeRepoint: async (tx, primaryId, duplicateId) => {
      // customers.lead_id is UNIQUE: adopt the duplicate's customer only when
      // the primary has none, otherwise leave it pointing at the archived lead.
      const dupCust = await tx.get('SELECT id FROM customers WHERE lead_id = ?', [duplicateId]);
      if (!dupCust) return;
      const hasCust = await tx.get('SELECT id FROM customers WHERE lead_id = ?', [primaryId]);
      if (!hasCust) await tx.run('UPDATE customers SET lead_id = ? WHERE id = ?', [primaryId, dupCust.id]);
    },
  },
  customers: {
    fill: ['contact_person', 'email', 'phone', 'type', 'lead_id'],
    repoint: [
      ['batches', 'customer_id'],
      ['students', 'customer_id'],
      ['quotations', 'customer_id'],
      ['invoices', 'customer_id'],
      ['payments', 'customer_id'],
      ['customer_contacts', 'customer_id'],
      ['support_tickets', 'customer_id'],
      ['announcements', 'customer_id'],
      ['expenses', 'customer_id'],
      ['users', 'customer_id'],
    ],
  },
  students: {
    fill: ['email', 'phone', 'user_id'],
    repoint: [
      ['enrollments', 'student_id'],
      ['attendance', 'student_id'],
      ['scores', 'student_id'],
      ['certificates', 'student_id'],
      ['interests', 'student_id'],
    ],
    // enrollments / attendance / scores carry UNIQUE(student…, …) constraints,
    // so drop the duplicate's colliding rows before re-pointing the rest.
    beforeRepoint: async (tx, primaryId, duplicateId) => {
      const dedupe = async (table, keyCols) => {
        const rows = await tx.query(`SELECT ${keyCols.join(', ')} FROM ${table} WHERE student_id = ?`, [duplicateId]);
        for (const row of rows) {
          const where = keyCols.map((c) => `${c} = ?`).join(' AND ');
          const vals = keyCols.map((c) => row[c]);
          const clash = await tx.get(
            `SELECT 1 AS x FROM ${table} WHERE student_id = ? AND ${where}`,
            [primaryId, ...vals]
          );
          if (clash) await tx.run(`DELETE FROM ${table} WHERE student_id = ? AND ${where}`, [duplicateId, ...vals]);
        }
      };
      await dedupe('enrollments', ['batch_id']);
      await dedupe('attendance', ['batch_id', 'date']);
      await dedupe('scores', ['assessment_id']);
    },
  },
};

function entityOf(entity) {
  const e = ENTITIES[entity];
  if (!e) throw badRequest(`Unknown entity "${entity}"`);
  return e;
}

function assertRole(scope, e) {
  if (!e.roles.includes(scope.role)) {
    throw forbidden(`Requires ${e.roles.join(' or ')} role`);
  }
}

/** Extra ownership guard so a trainer cannot archive another trainer's student. */
async function assertCanTouch(scope, entity, row) {
  if (entity !== 'students') return;
  if (scope.role === 'institution' && row.customer_id !== scope.customer_id) {
    throw forbidden('Not authorized for this student');
  }
  if (scope.role === 'trainer' && scope.trainer_id) {
    const owned = await db.get(
      `SELECT 1 AS x FROM enrollments e JOIN batches b ON b.id = e.batch_id
        WHERE e.student_id = ? AND b.trainer_id = ?`,
      [row.id, scope.trainer_id]
    );
    if (!owned) throw forbidden('Not authorized for this student');
  }
}

async function archive(scope, entity, id) {
  const e = entityOf(entity);
  assertRole(scope, e);
  const row = await db.get(`SELECT * FROM ${entity} WHERE id = ?`, [id]);
  if (!row) throw notFound(`${e.label} not found`);
  await assertCanTouch(scope, entity, row);
  if (row.archived_at) return { id, archived: true, already: true };
  await db.run(`UPDATE ${entity} SET archived_at = ? WHERE id = ?`, [nowIso(), id]);
  return { id, archived: true };
}

async function restore(scope, entity, id) {
  const e = entityOf(entity);
  assertRole(scope, e);
  const row = await db.get(`SELECT * FROM ${entity} WHERE id = ?`, [id]);
  if (!row) throw notFound(`${e.label} not found`);
  await assertCanTouch(scope, entity, row);
  await db.run(`UPDATE ${entity} SET archived_at = NULL WHERE id = ?`, [id]);
  return { id, archived: false };
}

/** Fold `duplicateId` into `primaryId`, then archive the duplicate. */
async function merge(scope, entity, primaryId, duplicateId) {
  const e = entityOf(entity);
  assertRole(scope, e);
  if (!str(primaryId) || !str(duplicateId)) throw badRequest('primary_id and duplicate_id are required');
  if (primaryId === duplicateId) throw badRequest('Cannot merge a record with itself');
  const rule = MERGE[entity];
  if (!rule) throw badRequest(`${e.label} does not support merging`);

  return db.transaction(async (tx) => {
    const primary = await tx.get(`SELECT * FROM ${entity} WHERE id = ?`, [primaryId]);
    const dup = await tx.get(`SELECT * FROM ${entity} WHERE id = ?`, [duplicateId]);
    if (!primary) throw notFound(`Primary ${e.label} ${primaryId} not found`);
    if (!dup) throw notFound(`Duplicate ${e.label} ${duplicateId} not found`);
    if (dup.archived_at) throw badRequest(`Duplicate ${e.label} ${duplicateId} is already archived`);

    // 1. Fill blank fields on the primary from the duplicate.
    for (const f of rule.fill) {
      const pv = primary[f];
      const dv = dup[f];
      const blank = pv === null || pv === undefined || pv === '';
      if (blank && dv !== null && dv !== undefined && dv !== '') {
        await tx.run(`UPDATE ${entity} SET ${f} = ? WHERE id = ?`, [dv, primaryId]);
      }
    }

    // 2. De-duplicate UNIQUE child rows (entity-specific).
    if (rule.beforeRepoint) await rule.beforeRepoint(tx, primaryId, duplicateId);

    // 3. Re-point dependent rows at the primary.
    for (const [table, col] of rule.repoint) {
      await tx.run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [primaryId, duplicateId]);
    }

    // 4. Archive the duplicate (never hard-delete).
    await tx.run(`UPDATE ${entity} SET archived_at = ? WHERE id = ?`, [nowIso(), duplicateId]);
    return tx.get(`SELECT * FROM ${entity} WHERE id = ?`, [primaryId]);
  });
}

module.exports = { archive, restore, merge, ENTITIES };
