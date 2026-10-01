/**
 * Credential lifecycle for accounts created through the CRM (Nodemailer flow):
 *
 *   create Trainer/Student → provision users row (hashed temp password,
 *   must_change_password=1) → link trainers.user_id / students.user_id →
 *   email the login details → report emailSent so the UI can offer a resend.
 *
 * Invariants (§8, §10):
 *   - the temp password exists only in memory for the email; the DB stores
 *     hashPassword(temp) — never plaintext;
 *   - email delivery is best-effort and happens AFTER the account exists: a
 *     failure reports emailSent:false and can never duplicate the user;
 *   - resend is limited to Organization admins and to an Institution's own
 *     students; changePassword verifies the current password first.
 */
const db = require('../db');
const { badRequest, forbidden, notFound, unauthorized } = require('../utils/http');
const { hashPassword, verifyPassword, generateTempPassword } = require('../utils/password');
const { nid } = require('../utils/ids');
const config = require('../config');
const { sendTrainerCredentialsEmail, sendStudentCredentialsEmail } = require('./emailService');

const KIND_ROLE = { trainer: 'TRAINER', student: 'STUDENT' };
const KIND_LABEL = { trainer: 'Trainer', student: 'Student' };

/** Display name of the Rampex org admin — "created by [Organization Name]". */
async function organizationName() {
  const row = await db.get(
    "SELECT name FROM users WHERE role = 'ORGANIZATION' ORDER BY user_key LIMIT 1"
  );
  return (row && row.name) || config.mail.appName;
}

/** Duplicate-email detection across the SQLite and MySQL drivers. */
function isDuplicateEmail(err) {
  const msg = String((err && err.message) || err);
  return /UNIQUE constraint failed: users\.email|duplicate entry|1060|1062/i.test(msg);
}

/**
 * Create the login account for a newly added trainer/student.
 * Returns { ok, reason?, user?, tempPassword? } — never throws for expected
 * outcomes (missing/duplicate email). tempPassword is for the email only.
 */
async function provisionAccount({ role, name, email, phone, customerId }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { ok: false, reason: 'no-email' };

  const tempPassword = generateTempPassword();
  try {
    const id = await nid(db, 'U', 'users');
    await db.run(
      `INSERT INTO users (id,name,email,phone,password_hash,role,customer_id,must_change_password)
       VALUES (?,?,?,?,?,?,?,1)`,
      [id, String(name || '').trim() || cleanEmail, cleanEmail, String(phone || '').trim() || null,
        hashPassword(tempPassword), role, customerId || null]
    );
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    return { ok: true, user, tempPassword };
  } catch (err) {
    if (isDuplicateEmail(err)) return { ok: false, reason: 'email-exists' };
    // Never fail the trainer/student creation because the login row failed.
    console.error(`[credentials] account insert failed (${role} ${cleanEmail}): ${err.message}`);
    return { ok: false, reason: 'account-failed' };
  }
}

/** The message shown in the UI (§8 / §11) — never contains the password. */
function creationMessage(kind, { email, emailSent, reason }) {
  const label = KIND_LABEL[kind];
  if (emailSent) return `${label} created successfully. Login credentials have been sent to ${email}.`;
  if (reason === 'no-email') {
    return `${label} created successfully. No email address was provided, so login credentials were not sent.`;
  }
  if (reason === 'email-exists') {
    return `${label} created successfully, but an account with this email already exists — credentials were not sent.`;
  }
  return `Account created successfully, but the login email could not be sent. Please use "Resend Credentials" to try again.`;
}

/**
 * Full post-creation step for a trainer/student row: create + link the login
 * account, send the credentials email, and build the API response extras.
 * Returns { emailSent, message } — call with the fresh row, after it is stored.
 */
async function issueCredentials(kind, { row, linkTable, customerId } = {}) {
  const role = KIND_ROLE[kind];
  const email = row && row.email;
  const orgName = kind === 'trainer' ? await organizationName() : null;

  const provisioned = await provisionAccount({
    role,
    name: row.name,
    email,
    phone: row.phone,
    customerId,
  });

  if (provisioned.ok) {
    await db.run(`UPDATE ${linkTable} SET user_id = ? WHERE id = ?`, [provisioned.user.id, row.id]);
    const username = provisioned.user.email; // login username, lowercased on insert
    const result = kind === 'trainer'
      ? await sendTrainerCredentialsEmail({
        to: username, name: row.name, username,
        tempPassword: provisioned.tempPassword, orgName,
      })
      : await sendStudentCredentialsEmail({
        to: username, name: row.name, username,
        tempPassword: provisioned.tempPassword, orgName,
      });
    const emailSent = Boolean(result && result.sent);
    return { emailSent, message: creationMessage(kind, { email: username, emailSent }) };
  }

  return { emailSent: false, message: creationMessage(kind, { email, emailSent: false, reason: provisioned.reason }) };
}

/** Resolve a target user from a users.id, trainers.id or students.id. */
async function resolveTargetUser(id) {
  let user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) {
    user = await db.get(
      'SELECT u.* FROM users u JOIN trainers t ON t.user_id = u.id WHERE t.id = ?', [id]
    );
  }
  if (!user) {
    user = await db.get(
      'SELECT u.* FROM users u JOIN students s ON s.user_id = u.id WHERE s.id = ?', [id]
    );
  }
  return user;
}

/**
 * POST /api/users/:id/resend-credentials — rotate the temporary password and
 * re-send the credentials email. Organization may resend for any trainer or
 * student; an Institution only for its own students.
 */
async function resendCredentials(scope, targetId) {
  const user = await resolveTargetUser(String(targetId || '').trim());
  if (!user) throw notFound('No login account is linked to that user');
  if (!['TRAINER', 'STUDENT'].includes(user.role)) {
    throw forbidden('Credentials can only be resent for trainer and student accounts');
  }
  if (scope.role !== 'organization') {
    if (scope.role !== 'institution') throw forbidden('Only Rampex or the institution admin can resend credentials');
    const own = user.role === 'STUDENT' && await db.get(
      'SELECT 1 AS ok FROM students WHERE user_id = ? AND customer_id = ?',
      [user.id, scope.customer_id]
    );
    if (!own) throw forbidden('You can only resend credentials for your own students');
  }

  const tempPassword = generateTempPassword();
  await db.run(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?",
    [hashPassword(tempPassword), user.id]
  );

  const kind = user.role === 'TRAINER' ? 'trainer' : 'student';
  const orgName = kind === 'trainer' ? await organizationName() : null;
  const result = kind === 'trainer'
    ? await sendTrainerCredentialsEmail({
      to: user.email, name: user.name, username: user.email, tempPassword, orgName,
    })
    : await sendStudentCredentialsEmail({
      to: user.email, name: user.name, username: user.email, tempPassword, orgName,
    });
  const emailSent = Boolean(result && result.sent);
  const label = KIND_LABEL[kind];
  const message = emailSent
    ? `Login credentials have been sent to ${user.email}.`
    : `The credentials email could not be sent to ${user.email}. Please try again later.`;
  return { emailSent, message, email: user.email, label, role: user.role };
}

/** The signed-in user's users row, resolved from the demo scope headers. */
async function currentUserRow(scope) {
  if (scope.role === 'student' && scope.student_id) {
    return db.get('SELECT u.* FROM users u JOIN students s ON s.user_id = u.id WHERE s.id = ?', [scope.student_id]);
  }
  if (scope.role === 'trainer' && scope.trainer_id) {
    return db.get('SELECT u.* FROM users u JOIN trainers t ON t.user_id = u.id WHERE t.id = ?', [scope.trainer_id]);
  }
  if (scope.role === 'institution' && scope.customer_id) {
    return db.get("SELECT * FROM users WHERE role = 'INSTITUTION' AND customer_id = ?", [scope.customer_id]);
  }
  if (scope.role === 'organization') {
    return db.get("SELECT * FROM users WHERE role = 'ORGANIZATION' ORDER BY user_key LIMIT 1");
  }
  return null;
}

/**
 * POST /api/auth/change-password — first-login password change for accounts
 * issued with a temporary password (and available to everyone later).
 */
async function changePassword(scope, { currentPassword, newPassword } = {}) {
  const user = await currentUserRow(scope);
  if (!user) throw unauthorized('Sign in to continue');
  if (!currentPassword || !newPassword) throw badRequest('Current and new password are required');
  if (!verifyPassword(String(currentPassword), user.password_hash)) {
    throw unauthorized('Current password is incorrect');
  }
  if (String(newPassword).length < 6) throw badRequest('New password must be at least 6 characters');
  if (String(newPassword) === String(currentPassword)) {
    throw badRequest('New password must be different from the current password');
  }
  await db.run(
    "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?",
    [hashPassword(String(newPassword)), user.id]
  );
  return { changed: true };
}

module.exports = { issueCredentials, resendCredentials, changePassword, organizationName };
