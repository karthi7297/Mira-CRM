const crypto = require('crypto');

/**
 * DEMO-GRADE password hashing so the backend stays dependency-free
 * (userflow.md: "No extra libs"). Salted SHA-256 is fine for the demo
 * dataset; swap this module for bcrypt/argon2 before real deployments.
 */

/** Pepper mixed into every digest. */
const PEPPER = 'mira';

/**
 * Pepper used before the app was renamed. KEEP THIS VALUE AS-IS: it is only
 * here so hashes written under the old name still verify, letting existing
 * logins work without a forced password reset. Changing it breaks those rows.
 */
const LEGACY_PEPPER = 'edunexus';

const digest = (pepper, salt, plain) =>
  crypto.createHash('sha256').update(`${pepper}:${salt}:${plain}`).digest('hex');

/** Length-safe constant-time compare (timingSafeEqual throws on length mismatch). */
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(8).toString('hex');
  return `sha$${salt}$${digest(PEPPER, salt, plain)}`;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  // Legacy plaintext rows (pre-migration seed) still verify, then can be re-hashed on login
  if (!stored.startsWith('sha$')) return stored === plain;
  const [, salt, hash] = stored.split('$');
  // Hashes written before the rename still verify against the legacy pepper, so
  // existing logins keep working without a forced password reset.
  return safeEqual(digest(PEPPER, salt, plain), hash)
    || safeEqual(digest(LEGACY_PEPPER, salt, plain), hash);
}

module.exports = { hashPassword, verifyPassword };
