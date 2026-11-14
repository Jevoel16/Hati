import type { Config } from './config.js';
import type { Db } from './db.js';

// Everything a service needs from the outside world, passed in so tests can swap it.
export type Ctx = {
  db: Db;
  config: Config;
  fetch: typeof fetch;
  hashCost: number;
  // Sign-in attempts allowed per minute, per client.
  authLimit: number;
};
