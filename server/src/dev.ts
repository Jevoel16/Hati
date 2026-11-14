import { createServer } from './app.js';
import { loadConfig } from './config.js';
import { connect } from './db.js';
import { migrate } from './migrate.js';

// Local entry point (`npm run dev:api`). Production uses api/server.ts on Vercel.
const config = loadConfig(process.env);
const db = connect(config.databaseUrl);
const ran = await migrate(db);
if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);

const { server } = createServer({ db, config, fetch, hashCost: 12, authLimit: 10 });
server.listen(config.port, () => console.log(`Hati API on http://localhost:${config.port}`));
