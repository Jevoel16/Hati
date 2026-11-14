import { loadConfig } from './config.js';
import { connect } from './db.js';
import { DEMO_ACCOUNT, resetDemo } from './services/demo.js';

// `npm run seed`: (re)creates the demo account and its sample group.
const config = loadConfig(process.env);
const db = connect(config.databaseUrl);
await resetDemo({ db, config, fetch, hashCost: 12, authLimit: 10 });
console.log(`Demo account ready: ${DEMO_ACCOUNT.email}`);
await db.close();
