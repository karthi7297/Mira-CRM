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
    const server = app.listen(config.port, () =>
      console.log(`Mira API on http://localhost:${config.port} (driver: ${db.driver})`)
    );
    // A second `npm start` while one is already running used to die with a
    // raw EADDRINUSE stack trace ("backend crashing"). Fail loud and clear.
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(
          `[boot] Port ${config.port} is already in use — another Mira backend is running. ` +
          `Stop it first (or reuse it), then start again.`
        );
        process.exit(1);
      }
      throw err;
    });
    // The Vite dev proxy reuses keep-alive sockets. Node's 5s default
    // keepAliveTimeout races that reuse and the proxy surfaces it as
    // ECONNRESET — almost always on /api/assistant/chat, the only endpoint
    // slow enough (upstream LLM latency) to lose the race. Longer timeouts
    // on both sides close the window. requestTimeout covers the worst case:
    // primary model (45s) + fallback model (45s) + snapshot queries.
    // NOTE: headersTimeout must stay larger than keepAliveTimeout.
    server.keepAliveTimeout = 30000;
    server.headersTimeout = 35000;
    server.requestTimeout = 120000;
    await automation.boot();
  } catch (err) {
    console.error('[boot] failed:', err.message);
    process.exit(1);
  }
})();
