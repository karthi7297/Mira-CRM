/**
 * Auth — the 4-role Rampex login (userflow FLOW A / db-prd §0).
 * Returns the logged-in user plus the scope keys the frontend sends back as
 * x-role / x-customer / x-trainer / x-student headers on every request.
 * Passwords verified against salted SHA-256 (utils/password).
 */
const db = require('../db');
const { unauthorized } = require('../utils/http');
const { verifyPassword } = require('../utils/password');

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
  return db.query('SELECT id, name, email, role FROM users ORDER BY id');
}

module.exports = { login, listUsers, SCOPE_BY_LINK };
