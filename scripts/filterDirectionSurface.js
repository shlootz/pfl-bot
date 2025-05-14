require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;

// Simple match by exact direction and surface strings
function directionSurfaceAligned(mare, stud) {
  const mareDir = mare?.racing?.direction?.value;
  const mareSurf = mare?.racing?.surface?.value;
  const studDir = stud?.racing?.direction?.value;
  const studSurf = stud?.racing?.surface?.value;

  return mareDir && studDir && mareDir === studDir &&
         mareSurf && studSurf && mareSurf === studSurf;
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  await client.query('DELETE FROM direction_surface_clean');
  console.log('🧹 Cleared direction_surface_clean table.');

  const pairs = await client.query('SELECT * FROM inbreeding_clean');
  let passed = 0;
  let checked = 0;

  for (const { mare_id, stud_id } of pairs.rows) {
    checked++;
    if (checked % 1000 === 0) console.log(`🔎 Checked ${checked} pairs...`);

    // Try to fetch mare from horses table first, then mares table
    let mareRes = await client.query('SELECT raw_data FROM horses WHERE id = $1', [mare_id]);
    if (mareRes.rows.length === 0) {
      mareRes = await client.query('SELECT raw_data FROM mares WHERE id = $1', [mare_id]);
    }

    const studRes = await client.query('SELECT raw_data FROM horses WHERE id = $1', [stud_id]);

    const mare = mareRes.rows[0]?.raw_data;
    const stud = studRes.rows[0]?.raw_data;

    if (!mare || !stud) {
      console.warn(`⚠️ Missing mare or stud: mare=${mare_id}, stud=${stud_id}`);
      continue;
    }

    if (directionSurfaceAligned(mare, stud)) {
      passed++;
      await client.query(
        `INSERT INTO direction_surface_clean (mare_id, stud_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [mare_id, stud_id]
      );
    }
  }

  console.log(`✅ Done.`);
  console.log(`🌟 Total checked: ${checked}`);
  console.log(`🟢 Direction & Surface matches stored: ${passed}`);

  await client.end();
}

run();
