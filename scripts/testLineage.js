// /scripts/testLineage.js
require('dotenv').config();
const { Client } = require('pg');
const {
  getAncestors,
  getProgeny,
  getDirectParents,
  getDirectChildren,
  refreshLineageCache
} = require('../utils/lineageQueries');

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌ Missing DATABASE_URL in .env');
  process.exit(1);
}

const horseId = process.argv[2];
if (!horseId) {
  console.error('❌ Usage: node scripts/testLineage.js <horseId>');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: DB_URL });
  try {
    console.log('🐎 Connecting to DB...');
    await client.connect();

    console.log(`🔄 Refreshing cache for horse ${horseId}...`);
    await refreshLineageCache(client, horseId, 3, 3);

    console.log(`📜 Ancestors for ${horseId}:`);
    console.table(await getAncestors(client, horseId, { maxDepth: 3, useCache: true }));

    console.log(`📜 Progeny for ${horseId}:`);
    console.table(await getProgeny(client, horseId, { maxDepth: 3, useCache: true }));

    console.log(`📜 Direct Parents:`);
    console.table(await getDirectParents(client, horseId));

    console.log(`📜 Direct Children:`);
    console.table(await getDirectChildren(client, horseId));

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.end();
    console.log('✅ Done');
  }
})();