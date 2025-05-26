// scripts/fetchMarketplaceAllHorses.js
require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const LOG_FILE = `logs/fetchMarketplaceAllHorses_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

const MAX_PAGES = 20;
const DELAY_MS = 500;
const LIMIT = 50;

fs.mkdirSync('logs', { recursive: true });

const client = new Client({ connectionString: DB_URL });

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function log(msg) {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  console.log(entry);
  fs.appendFileSync(LOG_FILE, entry + '\n');
}

async function gentleApiCall(payload) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await axios.post(
        'https://api.photofinish.live/pfl-pro/marketplace-api/for-sale',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
        }
      );
    } catch (err) {
      log(`⚠️ gentleFetch attempt ${attempt} failed: ${err.message}`);
      if (attempt < 5) await delay(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error('❌ Max retries exceeded.');
}

async function insertHorse(horse) {
  if (!horse?.id) return;

  await client.query(
    `INSERT INTO marketplace_horses (id, raw_data)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET raw_data = $2, updated_at = CURRENT_TIMESTAMP`,
    [horse.id, horse]
  );
}

async function fetchMarketplaceHorses() {
  let all = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    log(`📦 Fetching marketplace page ${page + 1}`);

    const payload = {
      limit: LIMIT,
      sortParameters: { criteria: 'Price', order: 'Descending' },
    };
    if (cursor) payload.cursor = cursor;

    const res = await gentleApiCall(payload);
    const listings = res?.data?.listings || [];

    if (!listings.length) {
      log(`✅ No more listings.`);
      break;
    }

    let saved = 0;
    for (const entry of listings) {
      const horse = entry?.horse;
      if (!horse?.id) continue;
      try {
        await insertHorse(horse);
        saved++;
      } catch (e) {
        log(`❌ Failed to insert horse ${horse.id}: ${e.message}`);
      }
    }

    log(`✅ Page ${page + 1} complete: ${saved} horses saved.`);
    all.push(...listings);

    cursor = res?.data?.cursor;
    if (!cursor) break;

    await delay(DELAY_MS);
  }

  log(`🎯 Total imported: ${all.length}`);
}

async function main() {
  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL');

    await fetchMarketplaceHorses();
  } catch (err) {
    log(`❌ Fatal: ${err.message}`);
  } finally {
    await client.end();
    log('🔒 PostgreSQL connection closed');
  }
}

main();