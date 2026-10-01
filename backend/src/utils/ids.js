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
 * Uses one past the highest existing code rather than COUNT + 1: rows are
 * deletable (a removed trainer/student would otherwise hand its code to the
 * next insert and collide), so COUNT can leave gaps that COUNT + 1 walks into.
 * Non-caller-supplied codes (e.g. batch 'AIML-2026-01') are ignored.
 */
async function nid(db, prefix, table) {
  const rows = await db.query(`SELECT id FROM ${table}`);
  let max = 0;
  for (const row of rows) {
    const code = String(row.id);
    if (!code.startsWith(`${prefix}-`)) continue;
    const n = Number(code.slice(prefix.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}-${pad(max + 1)}`;
}

/** Timestamp-based fallback for caller-supplied codes (e.g. frontend batch IDs). */
function tempCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { nid, pad, tempCode };
