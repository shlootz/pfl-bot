require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const { rows: studs } = await client.query(
    `SELECT raw_data FROM horses WHERE type = 'stud'`
  );

  const winCounts = {};

  for (const row of studs) {
    const races = row.raw_data?.history?.raceSummaries || [];
    for (const race of races) {
      if (race?.finishPosition === 1) {
        const name = race.raceName?.trim() || 'Unnamed';
        winCounts[name] = (winCounts[name] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(winCounts)
    .sort((a, b) => b[1] - a[1]);

  console.log('🏁 Tracks with winning studs:\n');
  for (const [track, count] of sorted) {
    console.log(`${track}: ${count} studs`);
  }

  await client.end();
}

run();