require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Client } = require('pg');

const API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;

async function fetchMare(id) {
  try {
    const response = await axios.get(
      `https://api.photofinish.live/pfl-pro/horse-api/${id}`,
      {
        headers: { 'x-api-key': API_KEY },
      }
    );
    return response.data;
  } catch (err) {
    console.warn(`❌ Failed to fetch mare ${id}:`, err.message);
    return null;
  }
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const text = fs.readFileSync('data/mare_ids.txt', 'utf-8');
  const mareIds = text.split(',').map((id) => id.trim());

  let success = 0;
  let failed = 0;

  for (const id of mareIds) {
    const mare = await fetchMare(id);
    if (!mare) {
      failed++;
      continue;
    }
  console.log(`Fetched mare ${id}`, JSON.stringify(mare, null, 2));
    try {
      await client.query(
        `INSERT INTO mares (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET raw_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [id, mare.horse]
      );
      success++;
    } catch (err) {
      console.warn(`❌ DB insert failed for ${id}:`, err.message);
      failed++;
    }
  }

  console.log(`✅ Done. ${success} mares saved, ${failed} failed.`);
  await client.end();
}

run();