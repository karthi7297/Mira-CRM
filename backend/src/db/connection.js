const config = require('../config');

/**
 * Dialect-aware database facade.
 *
 * Every service speaks ONLY this async API — never a driver directly — so the
 * whole backend runs on SQLite (dev, zero-setup) or MySQL 8 (production),
 * selected purely by DB_DRIVER. Both dialects use the same column layout
 * (db-prd §9 porting notes), so service queries are shared verbatim.
 *
 *   query(sql, params)  → rows array
 *   get(sql, params)    → first row or undefined
 *   run(sql, params)    → { insertId } (rowid / insertId when applicable)
 *   exec(sql)           → raw statement (DDL / multi-statement scripts)
 *   count(sql, params)  → number (first column of first row)
 *   transaction(fn)     → runs fn(getDb) inside BEGIN…COMMIT (rolls back on throw)
 *   driver              → 'sqlite' | 'mysql'
 */

const dialects = {
  sqlite: require('./sqlite'),
  mysql: require('./mysql'),
};

const driver = config.db.driver;
if (!dialects[driver]) {
  throw new Error(`Unknown DB_DRIVER "${driver}" (expected sqlite or mysql)`);
}
const impl = dialects[driver]();

const query = (sql, params = []) => impl.query(sql, params);
const get = async (sql, params = []) => (await impl.query(sql, params))[0];
const run = (sql, params = []) => impl.run(sql, params);
const exec = (sql) => impl.exec(sql);
const count = async (sql, params = []) => {
  const row = await get(sql, params);
  return Number(Object.values(row || {})[0] || 0);
};

/** fn receives the same facade (query/get/run/count); errors roll back. */
async function transaction(fn) {
  const tx = await impl.begin();
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

const db = {
  driver,
  query,
  get,
  run,
  exec,
  count,
  transaction,
  /** Promise that resolves when the driver is ready (schema applied for sqlite). */
  ready: impl.ready,
};

module.exports = db;
