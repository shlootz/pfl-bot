require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL;
const KD_TRACK = 'Kentucky Derby';
const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, `scoreKDTargets_log_${Date.now()}.log`);

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, ''); // Clear log

function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

function getReason(studId, kdWinners, kdProgeny, studStats) {
  if (kdWinners.has(studId)) return 'KD_WINNER';
  if (kdProgeny.has(studId)) return 'KD_PROGENY';
  const elite =
    (studStats.heart?.startsWith('SS') ? 1 : 0) +
    (studStats.stamina?.startsWith('SS') ? 1 : 0) +
    (studStats.speed?.startsWith('S+') ? 1 : 0);
  return elite >= 2 ? 'ELITE_STUD' : '';
}

function getScore(mareStats, studStats, winnerProfiles) {
  let score = 0;

  for (const winner of winnerProfiles) {
    if (studStats.heart?.startsWith('SS')) score += 3;
    if (studStats.stamina?.startsWith('SS')) score += 3;
    if (studStats.speed?.startsWith('S+')) score += 2;
    if (
      studStats.direction?.value &&
      studStats.direction.value === winner.direction?.value
    )
      score += 2;
    if (
      studStats.surface?.value &&
      studStats.surface.value === winner.surface?.value
    )
      score += 2;
  }

  return score;
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  const kdWinnersRes = await client.query(
    `SELECT id, raw_data FROM horses
     WHERE raw_data->'history'->'raceSummaries' @> $1`,
    [`[{"raceName": "${KD_TRACK}", "finishPosition": 1}]`]
  );
  const kdWinners = new Set(kdWinnersRes.rows.map((r) => r.id));
  const kdWinnerTraits = kdWinnersRes.rows.map((r) => r.raw_data?.racing).filter(Boolean);

  const kdProgenyRes = await client.query(
    `SELECT id FROM horses WHERE raw_data->>'sireId' = ANY($1)`,
    [Array.from(kdWinners)]
  );
  const kdProgeny = new Set(kdProgenyRes.rows.map((r) => r.id));

  const inbreedingRes = await client.query(`SELECT mare_id, stud_id FROM inbreeding_clean`);
  const inbreedingPairs = new Set(inbreedingRes.rows.map(r => `${r.mare_id}-${r.stud_id}`));

  const mares = await client.query(`SELECT id, raw_data FROM mares`);
  const studs = await client.query(`SELECT id, raw_data FROM horses WHERE type = 'stud'`);

  let inserted = 0;

  for (const mare of mares.rows) {
    const mareId = mare.id;
    const mareName = mare.raw_data?.name || 'Unknown Mare';
    const mareStats = mare.raw_data?.racing;
    if (!mareStats) continue;

    for (const stud of studs.rows) {
      const studId = stud.id;
      const studName = stud.raw_data?.name || 'Unknown Stud';
      const studStats = stud.raw_data?.racing;
      if (!studStats) continue;

      // Direction mismatch
      if (
        mareStats.direction?.value &&
        studStats.direction?.value &&
        mareStats.direction.value !== studStats.direction.value
      ) continue;

      const inbreedKey = `${mareId}-${studId}`;
      const isSafe = !inbreedingPairs.has(inbreedKey);

      const reason = getReason(studId, kdWinners, kdProgeny, studStats);
      const score =
        getScore(mareStats, studStats, kdWinnerTraits) +
        (reason === 'KD_WINNER' ? 3 : 0) +
        (reason === 'KD_PROGENY' ? 2 : 0) +
        (reason === 'ELITE_STUD' ? 2 : 0) +
        (isSafe ? 2 : 0);

      // Add win stats
      studStats.wins =
        stud.raw_data?.history?.raceStats?.allTime?.all?.wins || 0;
      studStats.majorWins =
        stud.raw_data?.history?.raceStats?.allTime?.all?.majorWins || 0;

      await client.query(
        `INSERT INTO kd_target_matches
          (mare_id, mare_name, stud_id, stud_name, score, reason, mare_stats, stud_stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (mare_id, stud_id) DO UPDATE
         SET score = EXCLUDED.score,
             reason = EXCLUDED.reason,
             stud_stats = EXCLUDED.stud_stats`,
        [mareId, mareName, studId, studName, score, reason, mareStats, studStats]
      );

      inserted++;
    }
  }

  log(`✅ Done. Inserted/updated ${inserted} matches.`);
  await client.end();
  log('🔒 PostgreSQL connection closed');
}

run();