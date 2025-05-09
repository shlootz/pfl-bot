require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');
const path = require('path');

const DB_URL = process.env.DATABASE_URL;
const WINNERS_FILE = path.join(__dirname, '../data/kd_winners.txt');

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const winnerIds = fs.readFileSync(WINNERS_FILE, 'utf-8')
    .split('\n')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  console.log(`🏇 Loaded ${winnerIds.length} known KD winner IDs`);

  const { rows } = await client.query(
    `SELECT id, raw_data FROM horses
     WHERE raw_data->>'sireId' = ANY($1)
     AND raw_data->>'gender' = '0'`, // must be stud
    [winnerIds]
  );

  const eliteProgeny = rows.filter(row => {
    const r = row.raw_data.racing || {};
    return (
      (r.heart || '').startsWith('SS') ||
      (r.stamina || '').startsWith('SS') ||
      (r.speed || '').startsWith('S+')
    );
  });

  console.log(`🎯 Found ${eliteProgeny.length} elite progeny of known winners`);

  for (const horse of eliteProgeny) {
    try {
      await client.query(
        `INSERT INTO elite_matches (mare_id, stud_id, reason)
         VALUES (NULL, $1, 'ELITE_PROGENY_KNOWN')
         ON CONFLICT DO NOTHING`,
        [horse.id]
      );
    } catch (err) {
      console.warn(`⚠️ Failed to insert ${horse.id}: ${err.message}`);
    }
  }

  console.log(`✅ Done. Tagged ${eliteProgeny.length} elite progeny from known winners.`);
  await client.end();
}

run();
