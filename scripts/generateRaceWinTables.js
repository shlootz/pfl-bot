require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

// Helper to sanitize table names
const sanitizeName = (name) =>
  'race_' +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);

async function generateRaceWinTables() {
  await client.connect();
  console.log('✅ Connected to database');

  // 1. Fetch all horses from both tables
  const tables = ['horses', 'marketplace_mares'];
  let horses = [];

  for (const table of tables) {
    const res = await client.query(`SELECT raw_data FROM ${table}`);
    horses = horses.concat(res.rows);
  }

  console.log(`📦 Loaded ${horses.length} horse entries`);

  // 2. Map: raceName -> {horseId: {name, gender, count}}
  const raceMap = {};

  for (const row of horses) {
    const horse = row.raw_data;
    if (!horse?.history?.raceSummaries || !Array.isArray(horse.history.raceSummaries)) continue;

    for (const race of horse.history.raceSummaries) {
      if (race.finishPosition === 1) {
        const raceName = race.raceName?.trim();
        if (!raceName) continue;

        if (!raceMap[raceName]) raceMap[raceName] = {};
        if (!raceMap[raceName][horse.id]) {
          raceMap[raceName][horse.id] = {
            name: horse.name || 'Unknown',
            gender: horse.gender ?? null,
            count: 0
          };
        }
        raceMap[raceName][horse.id].count += 1;
      }
    }
  }

  console.log(`🏇 Identified ${Object.keys(raceMap).length} unique race names`);

  // 3. Create/Update tables
  for (const [raceName, winners] of Object.entries(raceMap)) {
    const tableName = sanitizeName(raceName);
    console.log(`⚙️ Processing race: ${raceName} -> table ${tableName}`);

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        horse_id TEXT PRIMARY KEY,
        horse_name TEXT,
        gender INT,
        win_count INT
      )
    `);

    // Clear table before inserting fresh data
    await client.query(`TRUNCATE ${tableName}`);

    // Insert data
    for (const [horseId, data] of Object.entries(winners)) {
      await client.query(
        `INSERT INTO ${tableName} (horse_id, horse_name, gender, win_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (horse_id) DO UPDATE SET
           horse_name = EXCLUDED.horse_name,
           gender = EXCLUDED.gender,
           win_count = EXCLUDED.win_count`,
        [horseId, data.name, data.gender, data.count]
      );
    }
  }

  console.log('✅ Race win tables generated successfully');
  await client.end();
}

generateRaceWinTables().catch((err) => {
  console.error('❌ Error generating race win tables:', err);
  client.end();
});