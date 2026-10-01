/**
 * Support, requests, announcements and customer contacts.
 *   - support_tickets : institution/trainer/student raise SUPPORT or REQUEST
 *                       tickets; the organization triages, responds and closes.
 *   - announcements   : org/trainer broadcast to ALL / a customer / a batch.
 *   - customer_contacts: multiple named contacts per customer (org-managed).
 * Async facade throughout.
 */
const db = require('../db');
const { badRequest, notFound, forbidden, conflict } = require('../utils/http');
const { requireFields, oneOf, str } = require('../utils/validate');
const { nid } = require('../utils/ids');

const TICKET_KINDS = ['SUPPORT', 'REQUEST'];
const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const REQUEST_CATEGORIES = [
  'Schedule change', 'Trainer change', 'Student transfer', 'Billing query', 'Access / account', 'Other',
];
const ANNOUNCEMENT_AUDIENCES = ['ALL', 'CUSTOMER', 'BATCH'];

/* ---------- Support tickets / requests ---------- */

async function listTickets(scope) {
  let sql = `SELECT t.*, c.name AS customer_name, b.id AS batch_id
               FROM support_tickets t
               LEFT JOIN customers c ON c.id = t.customer_id
               LEFT JOIN batches b ON b.id = t.batch_id
              WHERE 1=1`;
  const params = [];
  if (scope.role === 'organization') {
    // sees everything
  } else {
    // Everyone else sees the tickets they raised.
    sql += ' AND t.created_by = ?';
    params.push(scope.user_id || '');
  }
  sql += ' ORDER BY t.created_at DESC, t.ticket_key DESC';
  return db.query(sql, params);
}

async function createTicket(scope, body = {}) {
  requireFields(body, ['subject']);
  const kind = oneOf(str(body.kind).toUpperCase() || 'SUPPORT', TICKET_KINDS, 'ticket kind');
  const priority = oneOf(str(body.priority).toUpperCase() || 'NORMAL', TICKET_PRIORITIES, 'priority');
  const id = await nid(db, 'TKT', 'support_tickets');
  await db.run(
    `INSERT INTO support_tickets (id,kind,category,subject,body,priority,status,created_by,created_role,customer_id,batch_id)
     VALUES (?,?,?,?,?,?, 'OPEN', ?,?,?,?)`,
    [id, kind, str(body.category) || null, str(body.subject), str(body.body) || null, priority,
      scope.user_id || null, scope.role, scope.customer_id || null, str(body.batch_id) || null]
  );
  return db.get('SELECT * FROM support_tickets WHERE id = ?', [id]);
}

async function updateTicket(scope, id, body = {}) {
  const t = await db.get('SELECT * FROM support_tickets WHERE id = ?', [id]);
  if (!t) throw notFound('Ticket not found');
  const isOwner = scope.user_id && t.created_by === scope.user_id;
  if (scope.role !== 'organization' && !isOwner) throw forbidden('Not authorized for this ticket');
  const status = body.status !== undefined
    ? oneOf(str(body.status).toUpperCase(), TICKET_STATUSES, 'ticket status')
    : t.status;
  const response = body.response !== undefined ? str(body.response) : t.response;
  await db.run(
    'UPDATE support_tickets SET status = ?, response = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [status, response, id]
  );
  return db.get('SELECT * FROM support_tickets WHERE id = ?', [id]);
}

/* ---------- Announcements ---------- */

async function listAnnouncements(scope) {
  let sql = `SELECT a.*, c.name AS customer_name FROM announcements a
               LEFT JOIN customers c ON c.id = a.customer_id WHERE 1=1`;
  const params = [];
  if (scope.role === 'organization') {
    // sees everything
  } else if (scope.role === 'institution' && scope.customer_id) {
    sql += " AND (a.audience = 'ALL' OR (a.audience = 'CUSTOMER' AND a.customer_id = ?))";
    params.push(scope.customer_id);
  } else if (scope.role === 'trainer' && scope.trainer_id) {
    sql += ` AND (a.audience = 'ALL' OR a.batch_id IN (SELECT id FROM batches WHERE trainer_id = ?))`;
    params.push(scope.trainer_id);
  } else if (scope.role === 'student' && scope.student_id) {
    sql += ` AND (a.audience = 'ALL'
              OR a.batch_id IN (SELECT batch_id FROM enrollments WHERE student_id = ?)
              OR (a.audience = 'CUSTOMER' AND a.customer_id = (SELECT customer_id FROM students WHERE id = ?)))`;
    params.push(scope.student_id, scope.student_id);
  } else {
    sql += " AND a.audience = 'ALL'";
  }
  sql += ' ORDER BY a.created_at DESC, a.announcement_key DESC';
  return db.query(sql, params);
}

async function createAnnouncement(scope, body = {}) {
  if (!['organization', 'trainer'].includes(scope.role)) {
    throw forbidden('Only Rampex or a trainer can post announcements');
  }
  requireFields(body, ['title']);
  const audience = oneOf(str(body.audience).toUpperCase() || 'ALL', ANNOUNCEMENT_AUDIENCES, 'audience');
  if (audience === 'CUSTOMER' && !str(body.customer_id)) throw badRequest('customer_id required for a CUSTOMER announcement');
  if (audience === 'BATCH' && !str(body.batch_id)) throw badRequest('batch_id required for a BATCH announcement');
  const id = await nid(db, 'ANN', 'announcements');
  await db.run(
    'INSERT INTO announcements (id,title,body,audience,customer_id,batch_id,created_by) VALUES (?,?,?,?,?,?,?)',
    [id, str(body.title), str(body.body) || null, audience,
      audience === 'CUSTOMER' ? str(body.customer_id) : null,
      audience === 'BATCH' ? str(body.batch_id) : null, scope.user_id || null]
  );
  return db.get('SELECT * FROM announcements WHERE id = ?', [id]);
}

/* ---------- Customer contacts ---------- */

async function listContacts(scope, customerId) {
  if (scope.role === 'organization') {
    return db.query('SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY is_primary DESC, name', [customerId]);
  }
  if (scope.role === 'institution' && scope.customer_id === customerId) {
    return db.query('SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY is_primary DESC, name', [customerId]);
  }
  throw forbidden('Not authorized for these contacts');
}

async function createContact(scope, customerId, body = {}) {
  if (scope.role !== 'organization') throw forbidden('Organization access only');
  requireFields(body, ['name']);
  const customer = await db.get('SELECT id FROM customers WHERE id = ?', [str(customerId)]);
  if (!customer) throw notFound('Customer not found');
  const em = str(body.email) || null;
  // Duplicate guard (audit E7): no two contacts with the same email at one customer.
  const dupe = em
    ? await db.get('SELECT id, name FROM customer_contacts WHERE customer_id = ? AND LOWER(email) = LOWER(?) LIMIT 1', [str(customerId), em])
    : null;
  if (dupe) throw conflict(`Duplicate contact — ${dupe.name} (${dupe.id}) already uses this email`);
  const id = await nid(db, 'CON', 'customer_contacts');
  const primary = body.is_primary ? 1 : 0;
  if (primary) await db.run('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?', [str(customerId)]);
  await db.run(
    'INSERT INTO customer_contacts (id,customer_id,name,title,email,phone,is_primary) VALUES (?,?,?,?,?,?,?)',
    [id, str(customerId), str(body.name), str(body.title) || null, em, str(body.phone) || null, primary]
  );
  return db.get('SELECT * FROM customer_contacts WHERE id = ?', [id]);
}

async function deleteContact(scope, id) {
  if (scope.role !== 'organization') throw forbidden('Organization access only');
  const row = await db.get('SELECT * FROM customer_contacts WHERE id = ?', [id]);
  if (!row) throw notFound('Contact not found');
  await db.run('DELETE FROM customer_contacts WHERE id = ?', [id]);
  return { deleted: true, id };
}

module.exports = {
  listTickets, createTicket, updateTicket,
  listAnnouncements, createAnnouncement,
  listContacts, createContact, deleteContact,
  TICKET_KINDS, TICKET_STATUSES, TICKET_PRIORITIES, REQUEST_CATEGORIES, ANNOUNCEMENT_AUDIENCES,
};
