require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;
const DELAY_MS = 1000;
const MAX_RETRIES = 5;
const LOG_FILE = `logs/fillUnlistedSires_${Date.now()}.log`;

fs.mkdirSync('logs', { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
  console.log(message);
  logStream.write(message + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHorseWithBackoff(id, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`📡 Fetching sire ${id}, attempt ${attempt}`);
      const res = await axios.get(`https://api.photofinish.live/pfl-pro/horse-api/${id}`, {
        headers: { 'x-api-key': API_KEY },
      });
      return res.data?.horse;
    } catch (err) {
      log(`⚠️ Attempt ${attempt} failed for ${id}: ${err.message}`);
      if (attempt < retries) {
        const delay = DELAY_MS * 2 ** (attempt - 1);
        log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        log(`❌ All attempts failed for ${id}`);
        return null;
      }
    }
  }
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  const { rows: unknownSires } = await client.query(`
    SELECT DISTINCT sire_id FROM family_tree
    WHERE sire_id IS NOT NULL AND sire_id NOT IN (SELECT id FROM horses)
    AND sire_id NOT IN (SELECT id FROM unlisted_sires)
  `);

  let inserted = 0;
  for (const { sire_id } of unknownSires) {
    const horse = await fetchHorseWithBackoff(sire_id);
    if (!horse?.id) continue;

    try {
      await client.query(
        `INSERT INTO unlisted_sires (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [horse.id, horse]
      );
      inserted++;
      log(`✅ Inserted ${horse.name || horse.id}`);
    } catch (err) {
      log(`❌ DB error for ${sire_id}: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  log(`✅ Done. Inserted ${inserted} unlisted sires.`);
  await client.end();
  log('🔒 PostgreSQL connection closed');
  logStream.end();
}

run();
