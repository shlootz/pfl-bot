// scripts/fetchMarketPlaceMares.js
require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');
const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;

const DELAY_MS = 500;
const MAX_PAGES = 100;
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

async function insertMare(mareData) { // mareData is the horse object from the API, potentially with listing info merged
  if (!mareData?.id) {
    log(`⚠️ Skipping marketplace mare with missing ID`);
    return { operation: 'skipped' };
  }

  // The raw_data column will store the full mareData object (horse details + listing info)
  try {
    const res = await client.query(
      `INSERT INTO marketplace_mares (id, raw_data)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET
         raw_data = EXCLUDED.raw_data,
         updated_at = CURRENT_TIMESTAMP
       RETURNING xmax`, // xmax = 0 for INSERT, non-zero for UPDATE
      [mareData.id, mareData]
    );

    if (res.rows[0].xmax === 0) {
      return { operation: 'inserted' };
    } else {
      return { operation: 'updated' };
    }
  } catch (error) {
    log(`❌ DB Error inserting/updating marketplace mare ${mareData.id}: ${error.message}`);
    return { operation: 'error' };
  }
}

async function fetchAllMarketPlaceMares() {
  let newMarketplaceMaresCount = 0;
  let updatedMarketplaceMaresCount = 0;
  let totalProcessed = 0;
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    log(`📦 Fetching marketplace mares page ${page + 1}...`);

    const payload = {
      limit: LISTINGS_LIMIT,
      sortParameters: { criteria: 'Price', order: 'Descending' }, // Example sort
      sexes: [1], // 1 = Female (Mare)
    };
    if (cursor) payload.cursor = cursor;

    try {
      const response = await retryWithBackoff(() =>
        axios.post(
          'https://api.photofinish.live/pfl-pro/marketplace-api/for-sale',
          payload,
          { headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY } }
        )
      );

      const listings = response?.data?.listings || [];
      if (!listings.length) {
        log(`✅ No more mare listings on page ${page + 1}.`);
        break;
      }

      for (const entry of listings) {
        const mareHorseData = entry?.horse;
        if (!mareHorseData || !mareHorseData.id) {
            log(`⚠️ Skipping marketplace entry with missing horse data or ID on page ${page + 1}. Entry: ${JSON.stringify(entry)}`);
            continue;
        }
        
        // Merge listing information into the horse data object if present
        if (entry?.listing) {
          mareHorseData.listing_details = entry.listing; // Store under a distinct key
        }
        
        totalProcessed++;
        const result = await insertMare(mareHorseData);

        if (result.operation === 'inserted') {
          newMarketplaceMaresCount++;
        } else if (result.operation === 'updated') {
          updatedMarketplaceMaresCount++;
        }
      }

      log(`✅ Page ${page + 1} complete. Processed ${listings.length} listings from this page.`);
      
      cursor = response?.data?.cursor;
      if (!cursor) {
        log(`🔚 No more pages. Ending marketplace mare fetch.`);
        break;
      }
      await delay(DELAY_MS);
    } catch (err) {
      log(`❌ Error on marketplace mare page ${page + 1}: ${err.message}`);
      // Allow to continue to next page if one error occurs.
    }
  }

  log(`🎯 Marketplace Mare Fetch Summary:`);
  log(`   Total API listings processed (approx): ${totalProcessed}`);
  log(`   New marketplace mares added/listed: ${newMarketplaceMaresCount}`);
  log(`   Existing marketplace mares updated: ${updatedMarketplaceMaresCount}`);
  
  return {
    newMarketplaceMares: newMarketplaceMaresCount,
    updatedMarketplaceMares: updatedMarketplaceMaresCount,
    totalProcessedFromApi: totalProcessed
  };
}

async function main() {
  let report = {
    newMarketplaceMares: 0,
    updatedMarketplaceMares: 0,
    totalProcessedFromApi: 0,
    error: null
  };

  try {
    await client.connect();
    log('🚀 Connected to PostgreSQL for fetchMarketPlaceMares');

    // Check if table exists (optional, good for robustness)
    const tableCheck = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_mares')`);
    if (!tableCheck.rows[0].exists) {
        const errMsg = 'Table "marketplace_mares" does not exist. Please create it first.';
        log(`❌ ${errMsg}`);
        report.error = errMsg;
        return report; // Exit early
    }
    log('✔️ Table "marketplace_mares" confirmed to exist.');

    // Removed: await client.query('DELETE FROM marketplace_mares');
    log('🔄 Starting marketplace mare data refresh (upsert mode)...');

    const fetchReport = await fetchAllMarketPlaceMares();
    report.newMarketplaceMares = fetchReport.newMarketplaceMares;
    report.updatedMarketplaceMares = fetchReport.updatedMarketplaceMares;
    report.totalProcessedFromApi = fetchReport.totalProcessedFromApi;

  } catch (err) {
    log(`❌ Unexpected error in fetchMarketPlaceMares main: ${err.message}`);
    report.error = err.message;
  } finally {
    if (client.ending) {
        log('🔒 PostgreSQL connection for fetchMarketPlaceMares was already closing or closed.');
    } else {
        try {
            await client.end();
            log('🔒 PostgreSQL connection for fetchMarketPlaceMares closed');
        } catch (e) {
            log(`❌ Error closing PostgreSQL connection for fetchMarketPlaceMares: ${e.message}`);
        }
    }
  }
  return report;
}

// Export main to be callable as a module
module.exports = { fetchMarketPlaceMares: main };

// To run directly (optional, for testing)
if (require.main === module) {
  main().then(report => {
    console.log("fetchMarketPlaceMares.js direct run complete. Report:", report);
  }).catch(error => {
    console.error("fetchMarketPlaceMares.js direct run failed:", error);
  });
}