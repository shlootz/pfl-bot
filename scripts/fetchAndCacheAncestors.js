// scripts/fetchAndCacheAncestors.js
require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');
const axios = require('axios');

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;
const ACCESS_TOKEN = process.env.PFL_ACCESS_TOKEN;
const LOG_FILE = `logs/fetchAncestors_${Date.now()}.log`;

fs.mkdirSync('logs', { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (msg) => {
  console.log(msg);
  logStream.write(msg + '\n');
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHorseWithBackoff(id, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`📡 Fetching ${id}, attempt ${attempt}`);
      const res = await axios.get(`https://api.photofinish.live/pfl-pro/horse-api/${id}`, {
        headers: { 'x-api-key': API_KEY, 'Authorization': `Bearer ${ACCESS_TOKEN}` },
      });
      return res.data?.horse;
    } catch (err) {
      log(`⚠️ Attempt ${attempt} failed for ${id}: ${err.message}`);
      if (attempt < retries) {
        const delay = 1000 * 2 ** (attempt - 1);
        log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        log(`❌ All attempts failed for ${id}`);
        return null;
      }
    }
  }
}

async function run(ids) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  for (const id of ids) {
    const { rows } = await client.query('SELECT 1 FROM ancestors WHERE id = $1', [id]);
    if (rows.length > 0) {
      log(`✅ Skipped existing: ${id}`);
      continue;
    }

    const horse = await fetchHorseWithBackoff(id);
    if (horse?.id) {
      try {
        await client.query(
          `INSERT INTO ancestors (id, raw_data) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET raw_data = EXCLUDED.raw_data, updated_at = CURRENT_TIMESTAMP`,
          [horse.id, horse]
        );
        log(`✅ Cached ${horse.name || horse.id}`);
      } catch (err) {
        log(`❌ DB error for ${id}: ${err.message}`);
      }
    }
  }

  await client.end();
  log('🔒 PostgreSQL connection closed');
  logStream.end();
}

// Export for external invocation
module.exports = { run };

// If run directly, allow for test input from CLI
if (require.main === module) {
  const inputIds = process.argv.slice(2);
  if (inputIds.length === 0) {
    console.error('❌ Provide horse IDs to fetch.');
    process.exit(1);
  }
  run(inputIds);
}