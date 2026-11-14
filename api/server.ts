import { createServer } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { connect } from '../server/src/db.js';

// Vercel Function entry: Vercel serves HTTP and WebSocket upgrades from the exported server.
const config = loadConfig(process.env);

export default createServer({
  db: connect(config.databaseUrl),
  config,
  fetch,
  hashCost: 12,
  authLimit: 10,
}).server;
