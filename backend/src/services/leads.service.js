/**
 * CRM leads — operated ONLY by ORGANIZATION (db-prd §2).
 * Lifecycle per master-prd §8:
 *   NEW → CONTACTED → QUALIFIED → PROPOSAL → CONVERTED · terminal: LOST, CLOSED
 * Conversion (userflow FLOW E): customer created from the lead, lead_id preserved,
 * lead marked CONVERTED — never a duplicate unrelated customer.
 */
const db = require('../db');
const { badRequest, conflict, notFound } = require('../utils/http');
const { requireFields, oneOf, str, toInt } = require('../utils/validate');
const { nid } = require('../utils/ids');

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CONVERTED', 'LOST', 'CLOSED'];
const PROGRESSABLE = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL'];
const CONVERTIBLE = ['QUALIFIED', 'PROPOSAL'];

async function listLeads({ search = '', status = '' } = {}) {
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (organization LIKE ? OR contact_person LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  return db.query(`${sql} ORDER BY created_at DESC, id DESC`, params);
}

async function getLead(leadId) {
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) throw notFound('Lead not found');
  lead.followups = await db.query(
    'SELECT * FROM lead_followups WHERE lead_id = ? ORDER BY created_at DESC, followup_key DESC',
    [leadId]
  );
  lead.customer = (await db.get('SELECT id, name FROM customers WHERE lead_id = ?', [leadId])) || null;
  return lead;
}

async function createLead(body = {}) {
  requireFields(body, ['organization', 'contact_person']);
  const id = await nid(db, 'LEAD', 'leads');
  await db.run(
    `INSERT INTO leads (id, assigned_to, lead_type, organization, contact_person, email, phone, requirement,
                        program, expected_students, expected_value, source, owner, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?)`,
    [
      id,
      str(body.assigned_to) || null,
      body.lead_type === 'DIRECT' ? 'DIRECT' : 'INSTITUTION',
      str(body.organization),
      str(body.contact_person),
      str(body.email) || null,
      str(body.phone) || null,
      str(body.requirement) || null,
      str(body.program) || null,
      toInt(body.expected_students, 0),
      Number(body.expected_value) || 0,
      str(body.source) || null,
      str(body.owner) || 'Sales Exec',
    ]
  );
  return getLead(id);
}

async function updateLead(leadId, body = {}) {
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) throw notFound('Lead not found');

  if (body.status !== undefined) {
    const status = oneOf(String(body.status), LEAD_STATUSES, 'lead status');
    if (lead.status === 'CONVERTED' && status !== 'CONVERTED') {
      throw conflict('Converted leads cannot move back in the pipeline');
    }
    if (lead.status === 'CONVERTED' && status === 'CONVERTED') {
      throw conflict('Lead already converted');
    }
    if (!PROGRESSABLE.includes(lead.status) && status !== lead.status) {
      throw conflict(`Lead is ${lead.status} (terminal) and cannot change status`);
    }
    await db.run('UPDATE leads SET status = ? WHERE id = ?', [status, leadId]);
  }

  const fields = ['organization', 'contact_person', 'email', 'phone', 'requirement', 'program', 'source', 'owner'];
  for (const f of fields) {
    if (body[f] !== undefined) {
      await db.run(`UPDATE leads SET ${f} = ? WHERE id = ?`, [str(body[f]) || null, leadId]);
    }
  }
  if (body.expected_students !== undefined) {
    await db.run('UPDATE leads SET expected_students = ? WHERE id = ?', [toInt(body.expected_students, 0), leadId]);
  }
  if (body.expected_value !== undefined) {
    await db.run('UPDATE leads SET expected_value = ? WHERE id = ?', [Number(body.expected_value) || 0, leadId]);
  }
  return getLead(leadId);
}

async function addFollowup(leadId, body = {}, actorUserId = null) {
  const lead = await db.get('SELECT id FROM leads WHERE id = ?', [leadId]);
  if (!lead) throw notFound('Lead not found');
  requireFields(body, ['method']);
  await db.run(
    'INSERT INTO lead_followups (lead_id, date, method, notes, next_action, created_by) VALUES (?,?,?,?,?,?)',
    [
      leadId,
      str(body.date) || new Date().toISOString().slice(0, 10),
      str(body.method),
      str(body.notes) || null,
      str(body.next_action) || null,
      actorUserId,
    ]
  );
  const row = await db.get(
    'SELECT * FROM lead_followups WHERE lead_id = ? ORDER BY followup_key DESC LIMIT 1',
    [leadId]
  );
  return row;
}

/** FLOW E — the critical conversion. Idempotent, preserves lead_id. Runs in one transaction. */
async function convertLead(leadId) {
  return db.transaction(async (tx) => {
    const lead = await tx.get('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) throw notFound('Lead not found');
    if (lead.status === 'CONVERTED') throw conflict('Lead already converted');
    if (!CONVERTIBLE.includes(lead.status)) {
      throw badRequest(`Only QUALIFIED or PROPOSAL leads can convert (current: ${lead.status})`);
    }

    const existing = await tx.get('SELECT * FROM customers WHERE lead_id = ?', [leadId]);
    if (existing) {
      await tx.run("UPDATE leads SET status = 'CONVERTED' WHERE id = ?", [leadId]);
      return existing;
    }

    const id = await nid(tx, 'CUST', 'customers');
    await tx.run(
      'INSERT INTO customers (id, lead_id, name, contact_person, email, phone, type) VALUES (?,?,?,?,?,?,?)',
      [id, leadId, lead.organization, lead.contact_person, lead.email, lead.phone, 'Enterprise']
    );
    await tx.run("UPDATE leads SET status = 'CONVERTED' WHERE id = ?", [leadId]);
    return tx.get('SELECT * FROM customers WHERE id = ?', [id]);
  });
}

module.exports = { listLeads, getLead, createLead, updateLead, addFollowup, convertLead, LEAD_STATUSES };
