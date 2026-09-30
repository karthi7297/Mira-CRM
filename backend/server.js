require('dotenv').config();
const config = require('./src/config');
const db = require('./src/db');
const { initialize } = require('./src/db/seed');
const { createApp } = require('./src/app');

/**
 * Entry point. Boots the selected driver (DB_DRIVER=sqlite|mysql), applies the
 * schema, seeds demo data on first run, then serves the API on config.port.
 */
(async () => {
  try {
    await db.ready; // driver connected
    await initialize(db); // schema + demo data (db-prd §7)
    const app = createApp();
    app.listen(config.port, () =>
      console.log(`Mira API on http://localhost:${config.port} (driver: ${db.driver})`)
    );
  } catch (err) {
    console.error('[boot] failed:', err.message);
    process.exit(1);
  }
})();
