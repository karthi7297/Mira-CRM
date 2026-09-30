/**
 * Business-code generators (db-prd §9: "bigint auto_increment → dev uses TEXT
 * codes (CUST-001, INV-001…); logic identical, surrogate keys swap on migration").
 * Each table keeps a hidden surrogate pk plus a unique `id` business code.
 */
function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

/** Next code for a table — async because COUNT goes through the async facade. */
async function nid(db, prefix, table) {
  const c = await db.count(`SELECT COUNT(*) FROM ${table}`);
  return `${prefix}-${pad(c + 1)}`;
}

/** Timestamp-based fallback for caller-supplied codes (e.g. frontend batch IDs). */
function tempCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { nid, pad, tempCode };
