const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

/**
 * SQLite implementation of the DB facade (dev, zero-setup).
 * node:sqlite is synchronous under the hood; it is wrapped in the same async
 * API so services are driver-agnostic. Schema is applied on boot.
 */
module.exports = function sqliteDialect() {
  const conn = new DatabaseSync(config.db.sqlite.file);
  conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec('PRAGMA foreign_keys = ON;');

  const query = async (sql, params = []) => conn.prepare(sql).all(...params);

  const run = async (sql, params = []) => {
    const info = conn.prepare(sql).run(...params);
    return { insertId: Number(info.lastInsertRowid || 0), changes: Number(info.changes || 0) };
  };

  const exec = async (sql) => { conn.exec(sql); };

  const begin = async () => {
    conn.exec('BEGIN');
    return {
      query,
      run,
      commit: async () => conn.exec('COMMIT'),
      rollback: async () => conn.exec('ROLLBACK'),
    };
  };

  return {
    query,
    run,
    exec,
    begin,
    ready: Promise.resolve(),
  };
};
