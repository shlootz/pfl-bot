require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const client = new Client({ connectionString: DB_URL });

function hasKDAlignment(stats) {
  if (!stats) return false;
  return (
    stats.direction?.value === 'LeftTurning' &&
    stats.surface?.value === 'Dirt'
  );
}

function scoreHorse(stats) {
  if (!stats) return 0;
  let score = 0;
  if (["S+", "SS-", "SS", "SS+"].includes(stats.grade)) score += 2;
  if ((stats.heart || '').startsWith('SS')) score += 3;
  if ((stats.stamina || '').startsWith('SS')) score += 3;
  if ((stats.speed || '').startsWith('S+')) score += 2;
  return score;
}

async function run() {
  await client.connect();
  console.log("🐎 Connected to DB");

  const maresRes = await client.query("SELECT id, raw_data FROM mares");
  const studsRes = await client.query("SELECT id, raw_data FROM horses WHERE type = 'stud'");
  const inbreedingRes = await client.query("SELECT mare_id, stud_id FROM inbreeding_clean");

  const avoidMap = new Set(inbreedingRes.rows.map(r => `${r.mare_id}:${r.stud_id}`));
  let inserted = 0;

  for (const mare of maresRes.rows) {
    const mareStats = mare.raw_data?.racing;
    if (!hasKDAlignment(mareStats)) continue;

    for (const stud of studsRes.rows) {
      const studStats = stud.raw_data?.racing;
      if (!hasKDAlignment(studStats)) continue;

      const key = `${mare.id}:${stud.id}`;
      if (avoidMap.has(key)) continue;

      const mareScore = scoreHorse(mareStats);
      const studScore = scoreHorse(studStats);
      const totalScore = mareScore + studScore;

      const matchedTraits = [];
      if ((mareStats.heart || '').startsWith('SS') && (studStats.heart || '').startsWith('SS')) matchedTraits.push('heart');
      if ((mareStats.stamina || '').startsWith('SS') && (studStats.stamina || '').startsWith('SS')) matchedTraits.push('stamina');
      if ((mareStats.speed || '').startsWith('S+') && (studStats.speed || '').startsWith('S+')) matchedTraits.push('speed');

      await client.query(
        `INSERT INTO kd_target_matches (
          mare_id, stud_id, mare_name, stud_name,
          mare_stats, stud_stats, score, matched_traits
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (mare_id, stud_id) DO UPDATE
          SET score = EXCLUDED.score,
              matched_traits = EXCLUDED.matched_traits,
              mare_stats = EXCLUDED.mare_stats,
              stud_stats = EXCLUDED.stud_stats,
              mare_name = EXCLUDED.mare_name,
              stud_name = EXCLUDED.stud_name,
              updated_at = CURRENT_TIMESTAMP`,
        [
          mare.id,
          stud.id,
          mare.raw_data?.name || '-',
          stud.raw_data?.name || '-',
          mareStats,
          studStats,
          totalScore,
          matchedTraits
        ]
      );
      inserted++;
    }
  }

  console.log(`✅ Inserted ${inserted} KD target matches.`);
  await client.end();
}

run();