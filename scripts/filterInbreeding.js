require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Load all mares
  const maresRes = await client.query(`SELECT id, raw_data FROM mares`);
  const mares = maresRes.rows.map((r) => ({
    id: r.id,
    lineage: r.raw_data?.simpleFamilyTree || [],
  }));

  // Load all studs
  const studsRes = await client.query(`SELECT id, raw_data FROM horses WHERE type = 'stud'`);
  const studs = studsRes.rows.map((r) => ({
    id: r.id,
    lineage: r.raw_data?.simpleFamilyTree || [],
  }));

  let safePairs = 0;

  for (const mare of mares) {
    const mareSet = new Set(mare.lineage);

    for (const stud of studs) {
      const hasOverlap = stud.lineage.some((ancestor) => mareSet.has(ancestor));
      if (!hasOverlap) {
        // Safe pair → store
        await client.query(
          `INSERT INTO inbreeding_clean (mare_id, stud_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [mare.id, stud.id]
        );
        safePairs++;
      }
    }
  }
  console.log(`Loaded ${mares.length} mares and ${studs.length} studs`);
  console.log('Sample mare lineage:', mares[0]?.lineage);
  console.log('Sample stud lineage:', studs[0]?.lineage);
  console.log(`✅ Stored ${safePairs} safe (non-inbred) mare-stud pairs`);
  await client.end();
}

run();