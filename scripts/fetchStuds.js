require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;

const DELAY_MS = 500;
const MAX_PAGES = 100;
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

async function insertHorse(horse, type) { // type is 'stud'
  if (!horse?.id) {
    log(`⚠️ Skipping ${type} with missing ID`);
    return { operation: 'skipped', isListed: false };
  }

  // The 'horse' object from stud-listings API is the horse detail itself.
  // It contains fields like horse.id, horse.name, horse.breedListingID, etc.
  // raw_data will store this 'horse' object.
  const isListed = !!horse.breedListingID;

  try {
    const res = await client.query(
      `INSERT INTO horses (id, type, raw_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         raw_data = EXCLUDED.raw_data,
         updated_at = CURRENT_TIMESTAMP
       RETURNING xmax`, // xmax = 0 for INSERT, non-zero for UPDATE
      [horse.id, type, horse]
    );

    if (res.rows[0].xmax === 0) {
      return { operation: 'inserted', isListed };
    } else {
      return { operation: 'updated', isListed };
    }
  } catch (error) {
    log(`❌ DB Error inserting/updating horse ${horse.id}: ${error.message}`);
    return { operation: 'error', isListed: false };
  }
}

async function fetchAllStuds() {
  let newStudsCount = 0;
  let updatedStudsCount = 0;
  let newlyListedStudsCount = 0; // Studs newly inserted AND listed
  let totalProcessed = 0;

  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    log(`📦 Fetching stud page ${page + 1}...`);

    const payload = {
      limit: LISTINGS_LIMIT,
      sortParameters: { criteria: 'Price', order: 'Descending' }, // Example sort
    };
    if (cursor) payload.cursor = cursor;

    try {
      const response = await retryWithBackoff(() =>
        axios.post(
          'https://api.photofinish.live/pfl-pro/marketplace-api/stud-listings',
          payload,
          { headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY } }
        )
      );

      const listings = response?.data?.listings || [];
      if (!listings.length) {
        log(`✅ No more stud listings on page ${page + 1}.`);
        break;
      }

      for (const entry of listings) {
        // entry.horse contains the actual horse data, including breedListingID
        const horseData = entry?.horse;
        if (!horseData || !horseData.id) {
            log(`⚠️ Skipping entry with missing horse data or ID on page ${page + 1}. Entry: ${JSON.stringify(entry)}`);
            continue;
        }
        
        totalProcessed++;
        const result = await insertHorse(horseData, 'stud');

        if (result.operation === 'inserted') {
          newStudsCount++;
          if (result.isListed) {
            newlyListedStudsCount++;
          }
        } else if (result.operation === 'updated') {
          updatedStudsCount++;
          // Note: Detecting a transition from not-listed to listed for an *updated* stud
          // would require fetching the old record first, which adds complexity.
          // For now, newlyListedStudsCount only tracks newly *inserted* studs that are listed.
        }
      }

      log(`✅ Page ${page + 1} complete. Processed ${listings.length} listings from this page.`);
      
      cursor = response?.data?.cursor;
      if (!cursor) {
        log(`🔚 No more pages. Ending stud fetch.`);
        break;
      }
      await delay(DELAY_MS);
    } catch (err) {
      log(`❌ Error on stud page ${page + 1}: ${err.message}`);
      // Potentially add a `break` here if errors are critical, or allow to continue to next page.
      // For now, let's allow it to try next page if one error occurs.
    }
  }

  log(`🎯 Stud Fetch Summary:`);
  log(`   Total API listings processed (approx): ${totalProcessed}`); // This is an approximation based on successful page fetches
  log(`   New studs added: ${newStudsCount}`);
  log(`   Existing studs updated: ${updatedStudsCount}`);
  log(`   New studs that are listed for breeding: ${newlyListedStudsCount}`);
  
  return {
    newStuds: newStudsCount,
    updatedStuds: updatedStudsCount,
    newlyListedStuds: newlyListedStudsCount, // "new studs listed for breeding"
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
    
    // Removed: await client.query('DELETE FROM horses');
    // console.log('🧹 Cleared horses table.'); // This line is also removed
    log('🔄 Starting stud data refresh (upsert mode)...');

    const fetchReport = await fetchAllStuds();
    report.newStuds = fetchReport.newStuds;
    report.updatedStuds = fetchReport.updatedStuds;
    report.newlyListedStuds = fetchReport.newlyListedStuds;
    report.totalProcessedFromApi = fetchReport.totalProcessedFromApi;

  } catch (err) {
    log(`❌ Unexpected error in fetchStuds main: ${err.message}`);
    report.error = err.message;
  } finally {
    if (client.ending) {
        log('🔒 PostgreSQL connection for fetchStuds was already closing or closed.');
    } else {
        try {
            await client.end();
            log('🔒 PostgreSQL connection for fetchStuds closed');
        } catch (e) {
            log(`❌ Error closing PostgreSQL connection for fetchStuds: ${e.message}`);
        }
    }
  }
  return report;
}

// Export main to be callable as a module
module.exports = { fetchStuds: main };

// To run directly (optional, for testing)
if (require.main === module) {
  main().then(report => {
    console.log("fetchStuds.js direct run complete. Report:", report);
  }).catch(error => {
    console.error("fetchStuds.js direct run failed:", error);
  });
}