require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;

const DELAY_MS = 500;
const MAX_PAGES = 20;
const LISTINGS_LIMIT = 50;
const LOG_FILE = `logs/fetchStuds_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

const client = new Client({ connectionString: DB_URL });

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function retryWithBackoff(fn, retries = 5, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const backoff = delayMs * Math.pow(2, i);
      log(`⏳ Retry ${i + 1} failed. Waiting ${backoff}ms: ${err.message}`);
      await delay(backoff);
    }
  }
  throw new Error('Exceeded maximum retries');
}

function log(message) {
  console.log(message);
  fs.appendFileSync(LOG_FILE, message + '\n');
}

async function insertHorse(horse, type) {
  if (!horse?.id) {
    log(`⚠️ Skipping ${type} with missing ID`);
    return;
  }

  await client.query(
    `INSERT INTO horses (id, type, raw_data)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET raw_data = $3, updated_at = CURRENT_TIMESTAMP`,
    [horse.id, type, horse]
  );
}

async function fetchAllStuds() {
  let allStuds = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    log(`📦 Fetching stud page ${page + 1}...`);

    const payload = {
      limit: LISTINGS_LIMIT,
      sortParameters: { criteria: 'Price', order: 'Descending' },
    };
    if (cursor) payload.cursor = cursor;

    try {
      const response = await retryWithBackoff(() =>
        axios.post(
          'https://api.photofinish.live/pfl-pro/marketplace-api/stud-listings',
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': API_KEY,
            },
          }
        )
      );

      const listings = response?.data?.listings || [];
      if (!listings.length) {
        log(`✅ No more stud listings on page ${page + 1}.`);
        break;
      }

      let success = 0;
      let failed = 0;

      for (const entry of listings) {
        const horse = entry?.horse;
        try {
          await insertHorse(horse, 'stud');
          success++;
        } catch (err) {
          log(`❌ Failed to insert stud ${horse?.id || '[no-id]'}: ${err.message}`);
          failed++;
        }
      }

      log(`✅ Page ${page + 1} complete: ${success} saved, ${failed} failed.`);
      allStuds.push(...listings);

      cursor = response?.data?.cursor;
      if (!cursor) {
        log(`🔚 No more pages. Ending stud fetch.`);
        break;
      }

      await delay(DELAY_MS);
    } catch (err) {
      log(`❌ Error on stud page ${page + 1}: ${err.message}`);
      break;
    }
  }

  log(`🎯 Total studs imported: ${allStuds.length}`);
}

async function main() {
  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL');

    await client.query('DELETE FROM horses');
    console.log('🧹 Cleared horses table.');
    
    await fetchAllStuds();
  } catch (err) {
    log(`❌ Unexpected error: ${err.message}`);
  } finally {
    await client.end();
    log('🔒 PostgreSQL connection closed');
  }
}

main();