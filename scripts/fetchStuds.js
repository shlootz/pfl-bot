require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

// ✅ Updated credentials
const API_KEY = process.env.PFL_API_KEY;
const ACCESS_TOKEN = process.env.PFL_ACCESS_TOKEN;
const DB_URL = process.env.DATABASE_URL;

const DELAY_MS = 500;
const MAX_PAGES = 1000;
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
    return { operation: 'skipped', isListed: false };
  }

  const isListed = !!horse.breedListingID;

  try {
    const res = await client.query(
      `INSERT INTO horses (id, type, raw_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         raw_data = EXCLUDED.raw_data,
         updated_at = CURRENT_TIMESTAMP
       RETURNING xmax`,
      [horse.id, type, horse]
    );

    return {
      operation: res.rows[0].xmax === 0 ? 'inserted' : 'updated',
      isListed
    };
  } catch (error) {
    log(`❌ DB Error inserting/updating horse ${horse.id}: ${error.message}`);
    return { operation: 'error', isListed: false };
  }
}

async function fetchAllStuds() {
  let newStudsCount = 0;
  let updatedStudsCount = 0;
  let newlyListedStudsCount = 0;
  let totalProcessed = 0;
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
              'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
          }
        )
      );

      const listings = response?.data?.listings || [];
      if (!listings.length) {
        log(`✅ No more stud listings on page ${page + 1}.`);
        break;
      }

      for (const entry of listings) {
        const horseData = entry?.horse;
        if (!horseData || !horseData.id) {
          log(`⚠️ Skipping entry with missing horse data on page ${page + 1}.`);
          continue;
        }

        totalProcessed++;
        const result = await insertHorse(horseData, 'stud');

        if (result.operation === 'inserted') {
          newStudsCount++;
          if (result.isListed) newlyListedStudsCount++;
        } else if (result.operation === 'updated') {
          updatedStudsCount++;
        }
      }

      log(`✅ Page ${page + 1} complete. Processed ${listings.length} listings.`);
      cursor = response?.data?.cursor;
      if (!cursor) {
        log(`🔚 No more pages. Ending stud fetch.`);
        break;
      }
      await delay(DELAY_MS);
    } catch (err) {
      log(`❌ Error on stud page ${page + 1}: ${err.message}`);
    }
  }

  log(`🎯 Stud Fetch Summary:
   Total API listings processed: ${totalProcessed}
   New studs added: ${newStudsCount}
   Existing studs updated: ${updatedStudsCount}
   New studs listed for breeding: ${newlyListedStudsCount}`);

  return {
    newStuds: newStudsCount,
    updatedStuds: updatedStudsCount,
    newlyListedStuds: newlyListedStudsCount,
    totalProcessedFromApi: totalProcessed
  };
}

async function main() {
  let report = {
    newStuds: 0,
    updatedStuds: 0,
    newlyListedStuds: 0,
    totalProcessedFromApi: 0,
    error: null
  };

  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL for fetchStuds');
    log('🔄 Starting stud data refresh (upsert mode)...');

    const fetchReport = await fetchAllStuds();
    Object.assign(report, fetchReport);

  } catch (err) {
    log(`❌ Unexpected error in fetchStuds main: ${err.message}`);
    report.error = err.message;
  } finally {
    try {
      await client.end();
      log('🔒 PostgreSQL connection for fetchStuds closed');
    } catch (e) {
      log(`❌ Error closing PostgreSQL connection: ${e.message}`);
    }
  }
  return report;
}

module.exports = { fetchStuds: main };

if (require.main === module) {
  main().then(report => {
    console.log("fetchStuds.js direct run complete. Report:", report);
  }).catch(error => {
    console.error("fetchStuds.js direct run failed:", error);
  });
}