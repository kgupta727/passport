import { replaceDB, db } from './db.js';
import { seed } from './seed.js';
import { refreshTrust } from './logic.js';
import './rarity.js';

replaceDB(seed());
db.users.forEach((u) => refreshTrust(u.id));
replaceDB(db);
console.log(`Seeded ${db.tenants.length} campuses, ${db.users.length} users, ${db.listings.length} listings, ${db.trades.length} trades.`);
