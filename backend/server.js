require('dotenv').config();
const config = require('./src/config');
const db = require('./src/db');
const { initialize } = require('./src/db/seed');
const { createApp } = require('./src/app');
const automation = require('./src/services/automation.service');

/**
 * Entry point. Boots the selected driver (DB_DRIVER=sqlite|mysql), applies the
 * schema, seeds demo data on first run, then serves the API on config.port.
 *
 * The cold-mail scheduler starts here rather than in a request handler, so a
 * running campaign keeps draining its queue with nobody logged in.
 */
(async () => {
  try {
    await db.ready; // driver connected
    await initialize(db); // schema + demo data (db-prd §7)
    const app = createApp();
    app.listen(config.port, () =>
      console.log(`Mira API on http://localhost:${config.port} (driver: ${db.driver})`)
    );
    await automation.boot();
  } catch (err) {
    console.error('[boot] failed:', err.message);
    process.exit(1);
  }
})();
