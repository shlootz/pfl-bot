require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');
const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;

const DELAY_MS = 500;
const MAX_PAGES = 20;
const LISTINGS_LIMIT = 50;
const LOG_FILE = `logs/fetchMarketPlaceMares_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
fs.mkdirSync('logs', { recursive: true });

const client = new Client({ connectionString: DB_URL });

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function log(message) {
  const fullMsg = `[${new Date().toISOString()}] ${message}`;
  console.log(fullMsg);
  fs.appendFileSync(LOG_FILE, fullMsg + '\n');
}

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

async function fetchAllMarketplaceMares() {
  let allMares = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    log(`📦 Fetching mare page ${page + 1}...`);

    const payload = {
      limit: LISTINGS_LIMIT,
      sortParameters: { criteria: 'Price', order: 'Descending' },
      sexes: [1], // 1 = female (mare)
    };
    if (cursor) payload.cursor = cursor;

    try {
      const response = await retryWithBackoff(() =>
        axios.post(
          'https://api.photofinish.live/pfl-pro/marketplace-api/for-sale',
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
        log(`✅ No more mare listings on page ${page + 1}.`);
        break;
      }

      let success = 0;
      let failed = 0;

      for (const entry of listings) {
        const mare = entry?.horse;
        try {
          await insertMare(mare);
          success++;
        } catch (err) {
          log(`❌ Failed to insert mare ${mare?.id || '[no-id]'}: ${err.message}`);
          failed++;
        }
      }

      log(`✅ Page ${page + 1} complete: ${success} saved, ${failed} failed.`);
      allMares.push(...listings);

      cursor = response?.data?.cursor;
      if (!cursor) {
        log(`🔚 No more pages. Ending mare fetch.`);
        break;
      }

      await delay(DELAY_MS);
    } catch (err) {
      log(`❌ Error on mare page ${page + 1}: ${err.message}`);
      break;
    }
  }

  log(`🎯 Total mares imported: ${allMares.length}`);
}

async function main() {
  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL');

    await client.query('DELETE FROM marketplace_mares');
    log('🧹 Cleared marketplace_mares table.');

    await fetchAllMarketplaceMares();
  } catch (err) {
    log(`❌ Unexpected error: ${err.message}`);
  } finally {
    await client.end();
    log('🔒 PostgreSQL connection closed');
  }
}

main();