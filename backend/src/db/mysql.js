const mysql = require('mysql2/promise');
const config = require('../config');

/**
 * MySQL 8 implementation of the DB facade (production target, db-prd §9).
 * A single pooled connection executes everything sequentially; transactions
 * run on their own connection from the pool. Services never see the driver.
 */
module.exports = function mysqlDialect() {
  let main = null; // serialized connection for reads/writes
  let chain = Promise.resolve(); // queues operations onto `main`
  const pool = mysql.createPool({
    host: config.db.mysql.host,
    port: config.db.mysql.port,
    user: config.db.mysql.user,
    password: config.db.mysql.password,
    database: config.db.mysql.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
    dateStrings: true, // DATE/TIME/DATETIME come back as 'YYYY-MM-DD' strings like dev
  });

  const ready = (async () => {
    main = await pool.getConnection();
    await main.query('SET SESSION sql_mode = ?, time_zone = "+00:00"', ['STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION']);
  })();

  const enqueue = (fn) => {
    chain = chain.then(fn, fn);
    return chain;
  };

  const query = (sql, params = []) =>
    enqueue(async () => {
      const [rows] = await main.query(sql, params);
      return rows;
    });

  const run = (sql, params = []) =>
    enqueue(async () => {
      const [result] = await main.query(sql, params);
      return { insertId: Number(result.insertId || 0), changes: Number(result.affectedRows || 0) };
    });

  const exec = (sql) => enqueue(async () => { await main.query(sql); });

  const begin = async () => {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    return {
      query: async (sql, params = []) => {
        const [rows] = await conn.query(sql, params);
        return rows;
      },
      run: async (sql, params = []) => {
        const [result] = await conn.query(sql, params);
        return { insertId: Number(result.insertId || 0), changes: Number(result.affectedRows || 0) };
      },
      commit: async () => { await conn.commit(); conn.release(); },
      rollback: async () => { await conn.rollback(); conn.release(); },
    };
  };

  return { query, run, exec, begin, ready };
};
