require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

const DB_URL = process.env.DATABASE_URL;
const KD_WINNERS_FILE = path.join(__dirname, '../data/kd_winners.txt');

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🚀 Connected to PostgreSQL');

  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS family_tree (
      horse_id TEXT PRIMARY KEY,
      sire_id TEXT,
      dam_id TEXT,
      race_grade TEXT,
      is_kd_winner BOOLEAN DEFAULT false
    );
  `);

  // Read list of known KD winner IDs (manual list)
  const txtList = fs.readFileSync(KD_WINNERS_FILE, 'utf-8')
    .split('\n')
    .map(id => id.trim())
    .filter(Boolean);

  const kdSet = new Set(txtList);

  const horses = await client.query(`SELECT id, raw_data FROM horses`);
  let inserted = 0;

  for (const { id, raw_data } of horses.rows) {
    const horse = raw_data;
    const horseId = id;
    const sireId = horse?.sireId || null;
    const damId = horse?.damId || null;
    const raceGrade = horse?.racing?.grade || null;

    const isWinner = kdSet.has(horseId);

    await client.query(
      `INSERT INTO family_tree (horse_id, sire_id, dam_id, race_grade, is_kd_winner)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (horse_id) DO UPDATE SET 
         sire_id = EXCLUDED.sire_id,
         dam_id = EXCLUDED.dam_id,
         race_grade = EXCLUDED.race_grade,
         is_kd_winner = EXCLUDED.is_kd_winner`,
      [horseId, sireId, damId, raceGrade, isWinner]
    );

    inserted++;
    if (inserted % 1000 === 0) {
      console.log(`🔄 Processed ${inserted} horses...`);
    }
  }

  console.log(`✅ Done. Inserted/updated ${inserted} entries in family_tree.`);

  await client.end();
  console.log('🔒 PostgreSQL connection closed');
}

run();