require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Client } = require('pg');
const path = require('path');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');
const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

// Logging setup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `fetchMares_${timestamp}.log`);
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
  const line = `${new Date().toISOString()} - ${message}`;
  console.log(line);
  logStream.write(`${line}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMareWithRetries(id) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`📡 Attempting to fetch mare ${id} (Attempt ${attempt + 1})`);

      const response = await axios.get(
        `https://api.photofinish.live/pfl-pro/horse-api/${id}`,
        {
          headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      log(`✅ Successfully fetched mare ${id}`);
      return response.data;
    } catch (err) {
      const status = err.response?.status || 'NO_RESPONSE';
      const message = err.response?.data?.message || err.message;

      log(`❌ Fetch failed for ${id} — [${status}] ${message}`);

      const isRateLimit = status === 429;
      const finalAttempt = attempt === MAX_RETRIES;

      if (finalAttempt || !isRateLimit) {
        log(`🛑 Giving up on mare ${id} after ${attempt + 1} attempts.`);
        return null;
      }

      const backoffTime = BASE_DELAY * 2 ** attempt;
      log(`⏳ Retrying after ${backoffTime}ms...`);
      await delay(backoffTime);
    }
  }
  return null;
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const text = fs.readFileSync('data/mare_ids.txt', 'utf-8');
  const mareIds = text.split(',').map((id) => id.trim());

  let success = 0;
  let failed = 0;

  log(`🚀 Starting mare fetch for ${mareIds.length} IDs`);
  for (const id of mareIds) {
    const mare = await fetchMareWithRetries(id);
    if (!mare || !mare.horse) {
      log(`❌ Skipping mare ${id} — fetch returned no usable data`);
      failed++;
      continue;
    }

    try {
      await client.query(
        `INSERT INTO mares (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET raw_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [id, mare.horse]
      );
      log(`✅ Saved mare ${id} (${mare.horse.name})`);
      success++;
    } catch (err) {
      log(`❌ DB insert failed for ${id}: ${err.message}`);
      failed++;
    }

    await delay(BASE_DELAY);
  }

  log(`🎉 Done. ${success} mares saved, ${failed} failed.`);
  await client.end();
  logStream.end();
}

run();

module.exports = { fetchMareWithRetries };