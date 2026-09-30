/**
 * Uniform HTTP helpers. Every JSON response is { success, data } or { success, error }
 * — the shape the frontend expects (uiux.md §18: never fake success).
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);
const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
const forbidden = (message = 'Not authorized') => new HttpError(403, message);
const notFound = (message = 'Not found') => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

function ok(res, data) {
  res.json({ success: true, data });
}

function fail(res, error, status = 400) {
  return res.status(status).json({ success: false, error });
}

/** Wrap async route handlers so thrown/rejected errors hit the central error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/** Map driver constraint failures to 400s so bad input never becomes a 500. */
function dbClientError(err) {
  if (!err || typeof err !== 'object') return false;
  // SQLite (node:sqlite) surfaces code/message with SQLITE_* prefixes
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_')) return true;
  // MySQL duplicate / FK / CHECK violations (mysql2 error codes)
  if (err.errno === 1062 || err.errno === 1451 || err.errno === 1452 || err.errno === 3819) return true;
  if (typeof err.code === 'string' && ['ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(err.code)) return true;
  return false;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return fail(res, err.message, err.status);
  if (dbClientError(err)) return fail(res, `Invalid request: ${err.message}`, 400);
  console.error('[unhandled]', err);
  return fail(res, 'Internal server error', 500);
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  ok,
  fail,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};
