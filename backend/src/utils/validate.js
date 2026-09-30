const { badRequest } = require('./http');
const { round2, toInt } = require('./numbers');

function str(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

/** Throw 400 listing the first missing required fields. */
function requireFields(body = {}, fields) {
  const missing = fields.filter((f) => str(body[f]) === '');
  if (missing.length) throw badRequest(`${missing.join(', ')} required`);
}

function oneOf(value, allowed, label = 'value') {
  if (!allowed.includes(value)) {
    throw badRequest(`Invalid ${label}: must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function num(v, label = 'value') {
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${label} must be a number`);
  return n;
}

/** Money amounts must be finite and > 0 (e.g. payments — db-prd §5). */
function positiveAmount(v, label = 'Amount') {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw badRequest(`${label} must be greater than 0`);
  return round2(n);
}

function isNonEmpty(v) {
  return str(v) !== '';
}

module.exports = { str, requireFields, oneOf, num, positiveAmount, isNonEmpty, toInt };
