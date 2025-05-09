require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const { rows: studs } = await client.query(
    `SELECT id FROM horses WHERE type = 'stud'`
  );

  console.log(`🔍 Enriching ${studs.length} studs...`);
  let enriched = 0;
  let failed = 0;

  for (const { id } of studs) {
    try {
      const response = await axios.get(
        `https://api.photofinish.live/pfl-pro/horse-api/${id}`,
        { headers: { 'x-api-key': API_KEY } }
      );

      const fullHorse = response.data?.horse;
      if (!fullHorse) {
        console.warn(`⚠️ No 'horse' found in API for stud ${id}`);
        failed++;
        continue;
      }

      await client.query(
        `UPDATE horses SET raw_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [fullHorse, id]
      );

      enriched++;
    } catch (err) {
      console.warn(`❌ Failed to enrich ${id}:`, err.message);
      failed++;
    }
  }

  await client.end();
  console.log(`✅ Enriched ${enriched} studs, ${failed} failed.`);
}

run();