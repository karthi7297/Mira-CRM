const { badRequest, unauthorized, forbidden } = require('../utils/http');
const { str } = require('../utils/validate');

/**
 * Validation middleware — a thin, declarative layer over utils/validate.js so
 * every mutating endpoint validates shape before it hits a service. Services
 * keep their own domain checks; this catches structural garbage early and
 * returns 400 with a field-level message the frontend can show inline.
 *
 * Usage:
 *   router.post('/x', requireAuth, validate({ body: { name: 'string', qty: 'int' } }), handler)
 *
 * Supported field specs:
 *   'string'   non-empty string (trimmed)
 *   'email'    non-empty string with a sane email shape
 *   'phone'    optional-shape check: digits/spaces/+-() only, 7-15 digits
 *   'int'      integer (string or number form)
 *   'number'   finite number
 *   'amount'   finite number > 0
 *   'date'     YYYY-MM-DD
 *   'bool'     boolean
 *   'array'    Array (of anything, min length 1)
 *   '?string'  optional string — if present must be a string
 *   '?number'  optional finite number
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkField(value, spec) {
  const optional = spec.startsWith('?');
  const kind = optional ? spec.slice(1) : spec;
  const empty = value === undefined || value === null || str(value) === '';

  if (empty) {
    if (optional) return null;
    return 'is required';
  }

  switch (kind) {
    case 'string':
      return (typeof value === 'string' || typeof value === 'number') ? null : 'must be text';
    case 'email':
      return EMAIL_RE.test(str(value)) ? null : 'must be a valid email';
    case 'phone':
      return PHONE_RE.test(str(value)) ? null : 'must be a valid phone number';
    case 'int': {
      const n = Number(value);
      return Number.isInteger(n) ? null : 'must be a whole number';
    }
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? null : 'must be a number';
    }
    case 'amount': {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? null : 'must be a number greater than 0';
    }
    case 'date':
      return DATE_RE.test(str(value)) ? null : 'must be a date (YYYY-MM-DD)';
    case 'bool':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'array':
      return Array.isArray(value) && value.length > 0 ? null : 'must be a non-empty list';
    default:
      return null;
  }
}

/**
 * validate({ body: {...}, query: {...} }) → middleware.
 * On failure: 400 { success:false, error: '"field" message' }.
 */
function validate(rules = {}) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, spec] of Object.entries(rules.body || {})) {
      const msg = checkField(req.body?.[field], spec);
      if (msg) errors.push(`${field} ${msg}`);
    }
    for (const [field, spec] of Object.entries(rules.query || {})) {
      const msg = checkField(req.query?.[field], spec);
      if (msg) errors.push(`${field} ${msg}`);
    }
    if (errors.length) return next(badRequest(errors[0]));
    return next();
  };
}

/** Reject oversized strings anywhere in a body (cheap deep sanitizer). */
function sanitizeBody(req, res, next) {
  const MAX_STR = 4000;
  const walk = (v, depth = 0) => {
    if (depth > 6) return v;
    if (typeof v === 'string') return v.slice(0, MAX_STR);
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[str(k).slice(0, 100)] = walk(val, depth + 1);
      return out;
    }
    return v;
  };
  if (req.body && typeof req.body === 'object') req.body = walk(req.body);
  return next();
}

module.exports = { validate, sanitizeBody };
