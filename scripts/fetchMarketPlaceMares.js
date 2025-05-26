// scripts/fetchMarketPlaceMares.js
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

const DB_URL = process.env.DATABASE_URL;
const LOG_FILE = `logs/fetchMarketPlaceMares_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
fs.mkdirSync('logs', { recursive: true });

const client = new Client({ connectionString: DB_URL });

function log(message) {
  const fullMsg = `[${new Date().toISOString()}] ${message}`;
  console.log(fullMsg);
  fs.appendFileSync(LOG_FILE, fullMsg + '\n');
}

async function insertMare(mare) {
  if (!mare?.id) {
    log(`⚠️ Skipping mare with missing ID`);
    return;
  }

  const query = `
    INSERT INTO marketplace_mares (id, raw_data)
    VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE
    SET raw_data = $2, updated_at = CURRENT_TIMESTAMP
  `;
  log(`📥 Inserting mare ${mare.id}`);

  try {
    await client.query(query, [mare.id, mare]);
  } catch (err) {
    log(`❌ SQL INSERT error for ${mare.id}: ${err.message}`);
    throw err;
  }
}

async function fetchAndInsertMaresFromMarketplace() {
  const { rows } = await client.query(`
    SELECT id, raw_data
    FROM marketplace_horses
    WHERE (raw_data->>'gender')::int = 0
  `);

  log(`🎯 Found ${rows.length} mares in marketplace_horses`);

  let inserted = 0;
  for (const row of rows) {
    try {
      await insertMare(row.raw_data);
      inserted++;
    } catch (err) {
      log(`❌ Failed to insert mare ${row.id}: ${err.message}`);
    }
  }

  log(`✅ Total mares inserted: ${inserted}`);
}

async function main() {
  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL');

    const whoami = await client.query(`SELECT current_user, current_schema, current_setting('search_path')`);
    log(`🧾 Session Info: ${JSON.stringify(whoami.rows[0])}`);

    const test = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'marketplace_mares'
      ) AS found;
    `);
    log(`🔍 Table check: ${JSON.stringify(test.rows[0])}`);
    if (!test.rows[0]?.found) {
      throw new Error('Table "marketplace_mares" does not exist');
    }

    await client.query('DELETE FROM marketplace_mares');
    log('🧹 Cleared marketplace_mares table.');

    await fetchAndInsertMaresFromMarketplace();
  } catch (err) {
    log(`❌ Unexpected error: ${err.message}`);
  } finally {
    await client.end();
    log('🔒 PostgreSQL connection closed');
  }
}

main();