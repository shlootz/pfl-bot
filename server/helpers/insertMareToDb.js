// server/helpers/insertMareToDb.js
require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().catch(err => console.error('❌ DB connection error:', err));

async function insertMareToDb(mare) {
  if (!mare?.id) {
    console.error('❌ insertMareToDb: No valid mare object provided');
    return false;
  }

  try {
    const res = await client.query(
      `INSERT INTO mares (id, raw_data)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET raw_data = EXCLUDED.raw_data, updated_at = CURRENT_TIMESTAMP`,
      [mare.id, mare]
    );
    console.log(`✅ Mare inserted/updated in DB: ${mare.name} (${mare.id})`);
    return true;
  } catch (err) {
    console.error(`❌ DB insert error for mare ${mare.id}: ${err.message}`);
    return false;
  }
}

module.exports = insertMareToDb;