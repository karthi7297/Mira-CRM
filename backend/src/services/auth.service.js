/**
 * Auth — the 4-role Rampex login (userflow FLOW A / db-prd §0).
 * Returns the logged-in user plus the scope keys the frontend sends back as
 * x-role / x-customer / x-trainer / x-student headers on every request.
 * Passwords verified against salted SHA-256 (utils/password).
 */
const db = require('../db');
const { unauthorized, conflict, notFound, badRequest } = require('../utils/http');
const { verifyPassword, hashPassword } = require('../utils/password');
const { requireFields, oneOf, str } = require('../utils/validate');
const { nid } = require('../utils/ids');

const USER_ROLES = ['ORGANIZATION', 'INSTITUTION', 'TRAINER', 'STUDENT'];
const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED'];

const SCOPE_BY_LINK = {
  INSTITUTION: 'customer_id',
  TRAINER: 'trainer_id',
  STUDENT: 'student_id',
};

async function login({ email, password } = {}) {
  if (!email || !password) throw unauthorized('Email and password required');
  const user = await db.get(
    'SELECT id, name, email, role, customer_id, password_hash, must_change_password FROM users WHERE email = ?',
    [String(email).trim().toLowerCase()]
  );
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    throw unauthorized('Invalid credentials');
  }
  // INSTITUTION scope = users.customer_id; TRAINER = the trainers.id row linked
  // to this user; STUDENT = the students.id row linked to this user.
  const scope = {};
  if (user.role === 'INSTITUTION') scope.customer_id = user.customer_id;
  if (user.role === 'TRAINER') {
    const t = await db.get('SELECT id FROM trainers WHERE user_id = ?', [user.id]);
    scope.trainer_id = t ? t.id : null;
  }
  if (user.role === 'STUDENT') {
    const s = await db.get('SELECT id FROM students WHERE user_id = ?', [user.id]);
    scope.student_id = s ? s.id : null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: String(user.role).toLowerCase(),
    // Accounts issued with a temporary password must change it on first login.
    mustChangePassword: user.must_change_password === 1 || user.must_change_password === true,
    ...scope,
    token: `demo-${user.id}`,
  };
}

async function listUsers() {
  return db.query('SELECT id, name, email, phone, role, status, customer_id, created_at FROM users ORDER BY id');
}

/** Create a login (organization only). New users start ACTIVE. */
async function createUser(body = {}) {
  requireFields(body, ['name', 'email', 'role']);
  const email = str(body.email).toLowerCase();
  const role = oneOf(str(body.role).toUpperCase(), USER_ROLES, 'role');
  const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
  if (existing) throw conflict(`A user with email ${email} already exists`);
  const password = str(body.password) || 'changeme123';
  if (password.length < 6) throw badRequest('Password must be at least 6 characters');
  const id = await nid(db, 'U', 'users');
  await db.run(
    'INSERT INTO users (id,name,email,phone,password_hash,role,customer_id,status) VALUES (?,?,?,?,?,?,?,?)',
    [id, str(body.name), email, str(body.phone) || null, hashPassword(password), role, str(body.customer_id) || null, 'ACTIVE']
  );
  return db.get('SELECT id, name, email, phone, role, status, customer_id FROM users WHERE id = ?', [id]);
}

/** Update a login: name/email/phone/role/status and optional password reset. */
async function updateUser(id, body = {}) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  const name = body.name !== undefined ? str(body.name) : user.name;
  const phone = body.phone !== undefined ? (str(body.phone) || null) : user.phone;
  const role = body.role !== undefined ? oneOf(str(body.role).toUpperCase(), USER_ROLES, 'role') : user.role;
  const status = body.status !== undefined ? oneOf(str(body.status).toUpperCase(), USER_STATUSES, 'status') : user.status;
  let email = user.email;
  if (body.email !== undefined) {
    email = str(body.email).toLowerCase();
    const clash = await db.get('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', [email, id]);
    if (clash) throw conflict(`A user with email ${email} already exists`);
  }
  if (body.password) {
    if (str(body.password).length < 6) throw badRequest('Password must be at least 6 characters');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(str(body.password)), id]);
  }
  await db.run(
    'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [name, email, phone, role, status, id]
  );
  return db.get('SELECT id, name, email, phone, role, status, customer_id FROM users WHERE id = ?', [id]);
}

/** The signed-in user's own record (audit B2 — profile/settings). */
async function getProfile(userId) {
  if (!userId) throw unauthorized('Not signed in');
  const u = await db.get(
    'SELECT id, name, email, phone, role, status, customer_id, created_at FROM users WHERE id = ?',
    [userId]
  );
  if (!u) throw notFound('User not found');
  return u;
}

/**
 * Self-service profile update. A user may change their own name, phone, email
 * and password — never their role, status or linked customer (that stays with
 * the organization through updateUser).
 */
async function updateProfile(userId, body = {}) {
  if (!userId) throw unauthorized('Not signed in');
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw notFound('User not found');
  const name = body.name !== undefined ? str(body.name) : user.name;
  if (!name) throw badRequest('Name is required');
  const phone = body.phone !== undefined ? (str(body.phone) || null) : user.phone;
  let email = user.email;
  if (body.email !== undefined) {
    email = str(body.email).toLowerCase();
    const clash = await db.get('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', [email, userId]);
    if (clash) throw conflict(`A user with email ${email} already exists`);
  }
  if (body.password) {
    if (str(body.password).length < 6) throw badRequest('Password must be at least 6 characters');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(str(body.password)), userId]);
  }
  await db.run(
    "UPDATE users SET name = ?, email = ?, phone = ?, updated_at = datetime('now') WHERE id = ?",
    [name, email, phone, userId]
  );
  return getProfile(userId);
}

module.exports = { login, listUsers, createUser, updateUser, getProfile, updateProfile, SCOPE_BY_LINK };
