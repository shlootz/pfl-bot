require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const KD_TRACK = 'Kentucky Derby';

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🚀 Connected to PostgreSQL');

  const kdWinners = await client.query(
    `SELECT raw_data FROM horses
     WHERE raw_data->'history'->'raceSummaries' @> $1`,
    [`[{"raceName": "${KD_TRACK}", "finishPosition": 1}]`]
  );

  const winnerTraits = kdWinners.rows.map(row => row.raw_data?.racing).filter(Boolean);

  function getScore(mare, stud, winnerProfiles) {
    const combined = {
      heart: stud.heart || '',
      stamina: stud.stamina || '',
      speed: stud.speed || '',
      direction: stud.direction?.value || '',
      surface: stud.surface?.value || ''
    };

    let score = 0;

    for (const winner of winnerProfiles) {
      if (combined.heart.startsWith('SS')) score += 3;
      if (combined.stamina.startsWith('SS')) score += 3;
      if (combined.speed.startsWith('S+')) score += 2;
      if (combined.direction === winner.direction?.value) score += 2;
      if (combined.surface === winner.surface?.value) score += 2;
    }

    return score;
  }

  const mares = await client.query('SELECT id, raw_data FROM mares');
  const studs = await client.query("SELECT id, raw_data FROM horses WHERE type = 'stud'");
  const inbreeding = await client.query("SELECT mare_id, stud_id FROM inbreeding_clean");

  const inbreedingPairs = new Set(inbreeding.rows.map(r => `${r.mare_id}-${r.stud_id}`));

  let inserted = 0;

  for (const mare of mares.rows) {
    const mareId = mare.id;
    const mareName = mare.raw_data?.name || 'Unknown Mare';
    const mareStats = mare.raw_data?.racing;

    for (const stud of studs.rows) {
      const studId = stud.id;
      const studName = stud.raw_data?.name || 'Unknown Stud';
      const studStats = stud.raw_data?.racing;

      if (!mareStats || !studStats) continue;

      if (
        mareStats.direction?.value &&
        studStats.direction?.value &&
        mareStats.direction.value !== studStats.direction.value
      ) {
        continue;
      }

      const inbreedingKey = `${mareId}-${studId}`;
      const isInbreedingSafe = inbreedingPairs.has(inbreedingKey);

      const eliteScore =
        (studStats.heart?.startsWith('SS') ? 3 : 0) +
        (studStats.stamina?.startsWith('SS') ? 3 : 0) +
        (studStats.speed?.startsWith('S+') ? 2 : 0) +
        ((studStats.temper?.startsWith('S+') || studStats.start?.startsWith('S+')) ? 1 : 0);

      const alignmentScore = getScore(mareStats, studStats, winnerTraits);
      const finalScore = alignmentScore + eliteScore + (isInbreedingSafe ? 2 : 0);

      await client.query(
        `INSERT INTO kd_target_matches (mare_id, mare_name, stud_id, stud_name, score, mare_stats, stud_stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (mare_id, stud_id) DO UPDATE SET score = EXCLUDED.score`,
        [mareId, mareName, studId, studName, finalScore, mareStats, studStats]
      );

      inserted++;
    }
  }

  console.log(`✅ Done. Inserted ${inserted} KD-target matches with scoring pipeline.`);
  await client.end();
}

run();