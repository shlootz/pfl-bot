require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;

// Set of valid Kentucky Derby race names (can be expanded)
const KD_RACE_NAMES = new Set([
  'Kentucky Derby',
  // Add variants if needed, e.g. 'Kentucky Derby v2'
]);

function hasMinStars(racing) {
  const surface = racing?.surface?.weight || 0;
  const direction = racing?.direction?.weight || 0;
  return surface >= 2 && direction >= 2;
}

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

function isKDWinner(raceSummaries = []) {
  return raceSummaries.some(
    (race) => race?.finishPosition === 1 && KD_RACE_NAMES.has(race.raceName?.trim())
  );
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  await client.query('DELETE FROM elite_matches');
  console.log('🧹 Cleared elite_matches table.');

  //const pairs = await client.query('SELECT * FROM inbreeding_clean');
  const pairs = await client.query('SELECT * FROM direction_surface_clean');
  let kept = 0;
  let checked = 0;
  let noStars = 0;
  let notKD = 0;

  for (const { mare_id, stud_id } of pairs.rows) {
    checked++;
    if (checked % 1000 === 0) console.log(`🔎 Checked ${checked} pairs...`);

    const { rows } = await client.query(
      `SELECT raw_data FROM horses WHERE id = $1`,
      [stud_id]
    );

    const stud = rows[0]?.raw_data;
    if (!stud) continue;

    const hasStars = hasMinStars(stud.racing);
    if (!hasStars) {
      noStars++;
      continue;
    }

    if (isKDWinner(stud.history?.raceSummaries)) {
      kept++;
      await client.query(
        `INSERT INTO elite_matches (mare_id, stud_id, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [mare_id, stud_id, 'KD_WINNER']
      );
      continue;
    } else {
      notKD++;
    }

    // TODO: Progeny check logic here
  }

  console.log(`✅ Done.`);
  console.log(`🎯 Total checked: ${checked}`);
  console.log(`🟢 KD winner matches kept: ${kept}`);
  console.log(`🚫 Skipped for stars: ${noStars}`);
  console.log(`➖ Not KD winners (waiting for progeny logic): ${notKD}`);

  await client.end();
}

run();
