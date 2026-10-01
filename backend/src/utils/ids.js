/**
 * Business-code generators (db-prd §9: "bigint auto_increment → dev uses TEXT
 * codes (CUST-001, INV-001…); logic identical, surrogate keys swap on migration").
 * Each table keeps a hidden surrogate pk plus a unique `id` business code.
 */
function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

/**
 * Next code for a table — async because the lookup goes through the async facade.
 *
 * Derives the next code from the HIGHEST numeric suffix already present, not
 * from COUNT(*). A count-based scheme collides as soon as a row is deleted or
 * ids are non-contiguous (e.g. delete CMP-001, and COUNT+1 hands out CMP-001
 * again while it is still taken). Scanning only the prefix family keeps the
 * query bounded and stays portable across SQLite and MySQL. Caller-supplied
 * codes (e.g. batch 'AIML-2026-01') fall outside the anchored pattern and are
 * ignored.
 */
async function nid(db, prefix, table) {
  const rows = await db.query(`SELECT id FROM ${table} WHERE id LIKE ?`, [`${prefix}-%`]);
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const row of rows) {
    const m = re.exec(String(row.id || ''));
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${pad(max + 1)}`;
}

/** Timestamp-based fallback for caller-supplied codes (e.g. frontend batch IDs). */
function tempCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { nid, pad, tempCode };
