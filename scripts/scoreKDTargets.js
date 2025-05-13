require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const KD_TRACK = 'Kentucky Derby';
const TARGET_SURFACE = 'Dirt'; // ⬅️ Make this race-specific when needed
const LOG_FILE = `logs/scoreKDTargets_log_${Date.now()}.log`;

fs.mkdirSync('logs', { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (msg) => {
  console.log(msg);
  logStream.write(msg + '\n');
};

const gradeRank = { 'S': -1, 'S+': 0, 'SS-': 1, 'SS': 2 };
function getSubgradeScore(base, traits) {
  let total = 0;
  ['heart', 'stamina', 'speed', 'start', 'finish', 'temper'].forEach(attr => {
    const value = traits?.[attr] || '';
    if (value in gradeRank) {
      total += gradeRank[value] - (gradeRank[base] || 0);
    }
  });
  return total;
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  await client.query('DELETE FROM kd_target_matches');
  log('🧹 Cleared kd_target_matches table.');

  const { rows: kdWinners } = await client.query(
    `SELECT id, raw_data FROM horses
     WHERE raw_data->'history'->'raceSummaries' @> $1`,
    [`[{"raceName": "${KD_TRACK}", "finishPosition": 1}]`]
  );

  const kdWinnerIds = new Set(kdWinners.map(w => w.id));
  const kdWinnerTraits = kdWinners.map(w => w.raw_data?.racing).filter(Boolean);

  const { rows: mares } = await client.query(`SELECT id, raw_data FROM mares`);
  const { rows: studs } = await client.query(`SELECT id, raw_data FROM horses WHERE type = 'stud'`);
  const { rows: inbreedingClean } = await client.query(`SELECT mare_id, stud_id FROM inbreeding_clean`);
  const inbreedingSafe = new Set(inbreedingClean.map(p => `${p.mare_id}-${p.stud_id}`));

  let inserted = 0;

  for (const mare of mares) {
    const mareId = mare.id;
    const mareName = mare.raw_data?.name || 'Unknown Mare';
    const mareStats = mare.raw_data?.racing;
    const mareDirection = mareStats?.direction?.value;

    if (!mareStats) continue;

    for (const stud of studs) {
      const studId = stud.id;
      const studName = stud.raw_data?.name || 'Unknown Stud';
      const studStats = stud.raw_data?.racing;
      if (!studStats) continue;

      const studDirection = studStats.direction?.value;
      if (mareDirection && studDirection && mareDirection !== studDirection) continue;

      // Surface filtering by target race
const studSurface = studStats.surface?.value;
if (studSurface !== TARGET_SURFACE) {
  log(`⛔ Skipping ${studName} (${studId}) — surface is ${studSurface}`);
  continue;
}

      const inbreedKey = `${mareId}-${studId}`;
      const isSafe = inbreedingSafe.has(inbreedKey);
      if (!isSafe) {
        log(`❌ Inbreeding risk: ${mareName} (${mareId}) x ${studName} (${studId})`);
        continue;
      }

      const wins = parseInt(stud.raw_data?.history?.raceStats?.allTime?.all?.wins || 0);
      const majors = parseInt(stud.raw_data?.history?.raceStats?.allTime?.all?.majorWins || 0);
      const grade = studStats?.grade || '-';
      const subgrade = getSubgradeScore(grade, studStats);

      const enrichedStats = {
        ...studStats,
        wins,
        majorWins: majors,
        grade,
        subgrade
      };

      let reason = '';
      if (kdWinnerIds.has(studId)) {
        reason = 'KD_WINNER';
      } else if (stud.raw_data?.sireId && kdWinnerIds.has(stud.raw_data.sireId)) {
        reason = 'PROGENY_OF_KD_WINNER';
      } else {
        const isElite =
          studStats.heart?.startsWith('SS') &&
          studStats.stamina?.startsWith('SS') &&
          studStats.speed?.startsWith('S+') &&
          (studStats.temper?.startsWith('S+') || studStats.start?.startsWith('S+'));
        if (isElite) reason = 'ELITE';
      }

      let score = 0;
      for (const winner of kdWinnerTraits) {
        if (studStats.heart?.startsWith('SS')) score += 3;
        if (studStats.stamina?.startsWith('SS')) score += 3;
        if (studStats.speed?.startsWith('S+')) score += 2;
        if (studStats.direction?.value === winner?.direction?.value) score += 2;
        if (studStats.surface?.value === winner?.surface?.value) score += 2;
      }

      if (reason === 'ELITE') score += 2;
      if (isSafe) score += 2;

      await client.query(
        `INSERT INTO kd_target_matches
         (mare_id, mare_name, stud_id, stud_name, score, reason, mare_stats, stud_stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (mare_id, stud_id) DO UPDATE
         SET score = EXCLUDED.score,
             reason = EXCLUDED.reason,
             mare_stats = EXCLUDED.mare_stats,
             stud_stats = EXCLUDED.stud_stats`,
        [
          mareId,
          mareName,
          studId,
          studName,
          score,
          reason || 'N/A',
          mareStats,
          enrichedStats,
        ]
      );
      inserted++;
    }
  }

  log(`✅ Done. Inserted ${inserted} KD-target matches with scoring pipeline.`);
  await client.end();
  log('🔒 PostgreSQL connection closed');
  logStream.end();
}

run();