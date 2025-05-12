require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;

// Delay in milliseconds between API calls
const DELAY_MS = 1000;

function hasEliteTraits(h) {
  const heart = h?.heart || '';
  const stamina = h?.stamina || '';
  const speed = h?.speed || '';
  const temper = h?.temper || '';
  const start = h?.start || '';

  return (
    [heart, stamina].every((v) => v && v.startsWith('SS')) &&
    speed.startsWith('S+') &&
    ([temper, start].some((v) => v && v.startsWith('S+')))
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHorseProfile(id) {
  try {
    console.log('Calling PFL API to fetch horse ${id}');
    const res = await axios.get(
      `https://api.photofinish.live/pfl-pro/horse-api/${id}`,
      { headers: { 'x-api-key': API_KEY } }
    );
    return res.data?.horse;
  } catch (err) {
    console.warn(`⚠️ Failed to fetch horse ${id}:`, err.message);
    return null;
  }
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const { rows: pairs } = await client.query(
    `SELECT * FROM inbreeding_clean WHERE stud_id NOT IN (
      SELECT stud_id FROM elite_matches
    )`
  );

  let kept = 0;
  let checked = 0;

  for (const { mare_id, stud_id } of pairs) {
    checked++;
    if (checked % 500 === 0) console.log(`🔎 Checked ${checked} pairs...`);

    const { rows } = await client.query(`SELECT raw_data FROM horses WHERE id = $1`, [stud_id]);
    const stud = rows[0]?.raw_data;
    if (!stud?.id) continue;

    const { rows: children } = await client.query(
      `SELECT id FROM horses WHERE raw_data->>'sireId' = $1`,
      [stud.id]
    );

   for (let i = 0; i < children.length; i++) {
  const childId = children[i].id;
  process.stdout.write(`\r🔬 Checking child ${i + 1}/${children.length}: ${childId}       `);

  const childData = await fetchHorseProfile(childId);
  await sleep(DELAY_MS); // Throttle

  if (!childData) continue;

  const traits = childData?.racing || {};
  if (hasEliteTraits(traits)) {
    kept++;
    await client.query(
      `INSERT INTO elite_matches (mare_id, stud_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [mare_id, stud_id, 'ELITE_PROGENY']
    );
    break;
  }
}
  }

  console.log(`✅ Done.`);
  console.log(`🧬 Elite progeny matches stored: ${kept}`);

  await client.end();
}

run();