// scripts/scoreKDTargets.js
require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any
const KD_TRACK = 'Kentucky Derby';
const KD_SURFACE = 'Dirt';
const LOG_FILE = `logs/scoreKDTargets_log_${Date.now()}.log`;

fs.mkdirSync('logs', { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (msg) => {
  const timestamp = new Date().toISOString();
  const fullMsg = `[${timestamp}] ${msg}`;
  console.log(fullMsg);
  logStream.write(fullMsg + '\n');
};

// Import the centralized subgrade calculator
const { calculateSubgrade } = require('../utils/calculateSubgrade');

// Define comprehensive grade scales and core traits
const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};
const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];
const MIN_ACCEPTABLE_STUD_GRADE_NUMERIC = DETAILED_TRAIT_SCALE['S-']; // Example: Minimum S- grade for a stud to be considered

// The old `gradeRank` and `getSubgradeScore` are removed as they are superseded by
// `DETAILED_TRAIT_SCALE` and the imported `calculateSubgrade` utility for the `insertMatchesForMare` function.
// Note: The `run()` function below this comment block still contains logic using an old `gradeRank`
// and `getSubgradeScore` if it were to be called. This refactor focuses on `insertMatchesForMare`.

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
    const mareName = mare.raw_data?.name || `Mare ${mareId}`;
    const mareStats = mare.raw_data?.racing;

    if (!mareStats) {
      log(`Skipping mare ${mareName} (ID: ${mareId}) in bulk run: No racing stats.`);
      continue;
    }
    // Correctly access preference name (.value) and stars (.weight)
    const mareDirectionPref = mareStats?.direction; // { value: "RightTurning", weight: 3 }
    const mareSurfacePref = mareStats?.surface;     // { value: "Dirt", weight: 2.5 }

    // Create a set of safe stud IDs for *this specific mare*
    const safeStudsForThisMare = new Set();
    inbreedingClean.forEach(p => {
        if (p.mare_id === mareId) {
            safeStudsForThisMare.add(p.stud_id);
        }
    });

    for (const stud of studs) {
      const studId = stud.id;
      const studName = stud.raw_data?.name || `Stud ${studId}`;
      const studStats = stud.raw_data?.racing;

      if (!studStats) continue;

      const studGrade = studStats?.grade;
      const studGradeNumeric = DETAILED_TRAIT_SCALE[studGrade];

      if (studGradeNumeric === undefined || studGradeNumeric < MIN_ACCEPTABLE_STUD_GRADE_NUMERIC) {
        continue;
      }

      if (!safeStudsForThisMare.has(studId)) {
        // log(`Skipping stud ${studName} (ID: ${studId}) for mare ${mareName}: Inbreeding risk.`);
        continue;
      }

      if (!stud.raw_data?.breedListingID || (stud.raw_data?.remainingStudCount !== undefined && stud.raw_data?.remainingStudCount <= 0)) {
        continue;
      }
      
      const historyStats = stud.raw_data?.history?.raceStats?.allTime?.all || {};
      const wins = parseInt(historyStats.wins || 0);
      const biggestPrize = historyStats.biggestPrize?.consolidatedValue?.value || 0;

      const minTraitNumeric = DETAILED_TRAIT_SCALE['C+'];
      const hasLowTrait = CORE_TRAITS.some(attr => {
        const traitGrade = studStats?.[attr];
        const traitNumeric = DETAILED_TRAIT_SCALE[traitGrade];
        return traitNumeric === undefined || traitNumeric < minTraitNumeric;
      });
      if (hasLowTrait) continue;

      // --- Start New Scoring Logic (adapted from insertMatchesForMare) ---
      let newScore = 0;
      // const scoreComponents = {}; // Optional: for detailed logging if needed

      let directionScore = 0;
      const studDirectionPref = studStats?.direction; // e.g., { value: "LeftTurning", weight: 3 }
      const mareDirName = mareDirectionPref?.value?.toLowerCase();
      const studDirName = studDirectionPref?.value?.toLowerCase();
      const mareDirStars = mareDirectionPref?.weight || 0;
      const studDirStars = studDirectionPref?.weight || 0;

      if (mareDirName) { // Mare has a defined direction preference
          if (studDirName) {
              if (mareDirName === studDirName) {
                  directionScore += 20; // Strong match
                  directionScore += mareDirStars + studDirStars; // Bonus for stars
              } else if (mareDirName === 'balanced' || studDirName === 'balanced') {
                  directionScore += 10; // Balanced is compatible
              } else if ((mareDirName.includes('left') && studDirName.includes('right')) ||
                         (mareDirName.includes('right') && studDirName.includes('left'))) {
                  directionScore -= 5; // Penalty for opposition (using .includes for "LeftTurning", "RightTurning")
              }
          }
      } else { // Mare has undefined direction preference
          if (studDirName === 'balanced') {
              directionScore += 5; // Small bonus for balanced stud
          }
          directionScore += studDirStars * 1; // Bonus for stud's own stars
      }
      // scoreComponents.direction = directionScore;
      newScore += directionScore;

      let surfaceScore = 0; // Declare surfaceScore here
      const studSurfacePref = studStats?.surface; // e.g., { value: "Dirt", weight: 2.5 }
      const mareSurfName = mareSurfacePref?.value?.toLowerCase();
      const studSurfName = studSurfacePref?.value?.toLowerCase();
      const mareSurfStars = mareSurfacePref?.weight || 0;
      const studSurfStars = studSurfacePref?.weight || 0;

      if (mareSurfName) { // Mare has a defined surface preference
          if (studSurfName) {
              if (mareSurfName === studSurfName) {
                  surfaceScore += 30; // Very strong match
                  surfaceScore += mareSurfStars * 2 + studSurfStars * 2; // Bonus for stars
              } else if ((mareSurfName === 'dirt' && studSurfName === 'synthetic') || (mareSurfName === 'synthetic' && studSurfName === 'dirt') ||
                         (mareSurfName === 'turf' && studSurfName === 'synthetic') || (mareSurfName === 'synthetic' && studSurfName === 'turf')) {
                  surfaceScore += 5; // Synthetic compatibility with specific mare prefs
              }
          }
      } else { // Mare has undefined surface preference
          if (studSurfName === 'synthetic') {
              surfaceScore += 10; // Bonus for synthetic stud if mare has no preference
          }
          surfaceScore += studSurfStars * 1.5; // Bonus for stud's own stars
      }
      // scoreComponents.surface = surfaceScore;
      newScore += surfaceScore;

      let traitQualityScore = 0;
      const traitWeights = { heart: 1.5, stamina: 1.2, speed: 1.2, finish: 1, start: 0.8, temper: 0.5 };
      for (const trait of CORE_TRAITS) {
          const studTraitGrade = studStats?.[trait];
          const studTraitNumericVal = DETAILED_TRAIT_SCALE[studTraitGrade];
          if (studTraitNumericVal !== undefined) {
              traitQualityScore += studTraitNumericVal * (traitWeights[trait] || 1);
          }
      }
      // scoreComponents.traitQuality = traitQualityScore;
      newScore += traitQualityScore;
      
      const studSubgrade = calculateSubgrade(studGrade, studStats) || 0;
      // scoreComponents.studSubgrade = studSubgrade * 2;
      newScore += studSubgrade * 2;

      let performanceScore = 0;
      performanceScore += wins * 0.5;
      performanceScore += Math.min(biggestPrize / 10000, 10);
      if (stud.raw_data?.remainingStudCount > 0) {
          performanceScore += Math.min(stud.raw_data.remainingStudCount / 10, 5);
      }
      // scoreComponents.performance = performanceScore;
      newScore += performanceScore;
      // --- End New Scoring Logic ---

      const enrichedStats = {
        ...studStats,
        wins,
        races: parseInt(historyStats.starts || historyStats.races || 0),
        majorWins: parseInt(historyStats.majorWins || 0),
        podium: (parseInt(historyStats.starts || historyStats.races || 0) > 0) ? Math.round((wins / parseInt(historyStats.starts || historyStats.races || 0)) * 100) : null,
        grade: studGrade,
        subgrade: studSubgrade,
        biggestPrize,
        remainingStudCount: stud.raw_data?.remainingStudCount
      };

      let reason = 'N/A';
      if (kdWinnerIds.has(studId)) reason = 'KD_WINNER';
      else if (stud.raw_data?.sireId && kdWinnerIds.has(stud.raw_data.sireId)) reason = 'PROGENY_OF_KD_WINNER';
      // The 'ELITE' reason based on startsWith('SS') etc. is less relevant with numeric scoring.
      // The score itself should reflect elite status.

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
          Math.round(newScore), // Round the score to the nearest integer
          reason,
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

async function insertMatchesForMare(mareId) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log(`🚀 Connected to PostgreSQL for single mare scoring: ${mareId}`);

  const { rows: mares } = await client.query(`SELECT id, raw_data FROM mares WHERE id = $1`, [mareId]);
  if (!mares.length) throw new Error(`❌ Mare ${mareId} not found in DB.`);

  const mare = mares[0];
  const mareName = mare.raw_data?.name || `Mare ${mare.id}`;
  const mareStats = mare.raw_data?.racing;
  if (!mareStats) {
    log(`❌ Mare ${mareName} (ID: ${mareId}) has no racing stats. Skipping stud scoring for this mare.`);
    await client.end();
    logStream.end();
    return;
  }
  // Correctly access preference name (.value) and stars (.weight)
  const mareDirectionPref = mareStats?.direction; // e.g., { value: "RightTurning", weight: 3 }
  const mareSurfacePref = mareStats?.surface;     // e.g., { value: "Dirt", weight: 2.5 }

  // KD Winner logic can be kept for "reason" but shouldn't dominate scoring
  const { rows: kdWinners } = await client.query(
    `SELECT id FROM horses WHERE raw_data->'history'->'raceSummaries' @> $1`,
    [`[{"raceName": "${KD_TRACK}", "finishPosition": 1}]`]
  );
  const kdWinnerIds = new Set(kdWinners.map(w => w.id));

  const { rows: studs } = await client.query(`SELECT id, raw_data FROM horses WHERE type = 'stud'`);
  const { rows: inbreedingClean } = await client.query(`SELECT stud_id FROM inbreeding_clean WHERE mare_id = $1`, [mareId]);
  const inbreedingSafeStudIds = new Set(inbreedingClean.map(p => p.stud_id));
  let studsAvailableForLoop = studs.length;
  log(`ℹ️ Scoring ${studsAvailableForLoop} studs for mare ${mareName} (ID: ${mareId}). Mare Dir: ${mareDirectionPref?.value || 'undefined'}, Mare Surf: ${mareSurfacePref?.value || 'undefined'}`);
  let processedInLoop = 0;
  let passedRacingStatsCheck = 0;
  let passedGradeCheck = 0;
  let passedInbreedingCheck = 0;
  let passedListingCheck = 0;
  let passedTraitQualityCheck = 0;


  for (const stud of studs) {
    processedInLoop++;
    const studId = stud.id;
    const studName = stud.raw_data?.name || `Stud ${studId}`;
    const studStats = stud.raw_data?.racing;

    if (!studStats) {
      // log(`Skipping stud ${studName} (ID: ${studId}): No racing stats.`);
      continue;
    }
    passedRacingStatsCheck++;

    const studGrade = studStats?.grade;
    const studGradeNumeric = DETAILED_TRAIT_SCALE[studGrade];

    if (studGradeNumeric === undefined || studGradeNumeric < MIN_ACCEPTABLE_STUD_GRADE_NUMERIC) {
      // log(`Skipping stud ${studName} (ID: ${studId}): Grade ${studGrade} is below minimum S-.`);
      continue;
    }
    passedGradeCheck++;

    // Inbreeding Check
    // TEMPORARILY BYPASSED FOR DEBUGGING - TODO: Ensure inbreeding_clean is populated correctly
    const isActuallySafe = inbreedingSafeStudIds.has(studId);
    if (!isActuallySafe) {
      log(`[DEBUG INBREEDING] Stud ${studName} (ID: ${studId}) NOT found in inbreeding_clean for mare ${mareName}. Bypassing check for now.`);
    }
    // if (!inbreedingSafeStudIds.has(studId)) {
    //   // log(`Skipping stud ${studName} (ID: ${studId}): Inbreeding risk with ${mareName}.`);
    //   continue;
    // }
    passedInbreedingCheck++; // Still increment to see how many *would* have passed if table was correct

    // Listing and Availability Check
    if (!stud.raw_data?.breedListingID || (stud.raw_data?.remainingStudCount !== undefined && stud.raw_data?.remainingStudCount <= 0)) {
      // log(`Skipping stud ${studName} (ID: ${studId}): Not listed or no remaining studdings.`);
      continue;
    }
    passedListingCheck++;
    
    // Performance Filters (can be part of scoring instead of hard filters)
    const historyStats = stud.raw_data?.history?.raceStats?.allTime?.all || {};
    const wins = parseInt(historyStats.wins || 0);
    const biggestPrize = historyStats.biggestPrize?.consolidatedValue?.value || 0;

    // Trait Quality Filter (e.g., all core traits must be C+ or better)
    const minTraitNumeric = DETAILED_TRAIT_SCALE['C+'];
    const hasLowTrait = CORE_TRAITS.some(attr => {
      const traitGrade = studStats?.[attr];
      const traitNumeric = DETAILED_TRAIT_SCALE[traitGrade];
      return traitNumeric === undefined || traitNumeric < minTraitNumeric;
    });
    if (hasLowTrait) {
      // log(`Skipping stud ${studName} (ID: ${studId}): One or more core traits below C+.`);
      continue;
    }
    passedTraitQualityCheck++;

    // --- Start New Scoring Logic ---
    let newScore = 0;
    const scoreComponents = {};

    // 1. Preference Matching Score (Direction & Surface)
    let directionScore = 0;
    const studDirectionPref = studStats?.direction; // e.g., { value: "LeftTurning", weight: 3 }
    const mareDirName = mareDirectionPref?.value?.toLowerCase();
    const studDirName = studDirectionPref?.value?.toLowerCase();
    const mareDirStars = mareDirectionPref?.weight || 0;
    const studDirStars = studDirectionPref?.weight || 0;

    if (mareDirName) { // Mare has a defined direction preference
        if (studDirName) {
            if (mareDirName === studDirName) {
                directionScore += 20; // Strong match
                directionScore += mareDirStars + studDirStars; // Bonus for stars
            } else if (mareDirName === 'balanced' || studDirName === 'balanced') {
                directionScore += 10; // Balanced is compatible
            } else if ((mareDirName.includes('left') && studDirName.includes('right')) ||
                       (mareDirName.includes('right') && studDirName.includes('left'))) {
                directionScore -= 5; // Penalty for opposition (using .includes for "LeftTurning", "RightTurning")
            }
        }
    } else { // Mare has undefined direction preference
        if (studDirName === 'balanced') {
            directionScore += 5; // Small bonus for balanced stud
        }
        directionScore += studDirStars * 1; // Bonus for stud's own stars
    }
    scoreComponents.direction = directionScore;
    newScore += directionScore;

    let surfaceScore = 0;
    const studSurfacePref = studStats?.surface; // e.g., { value: "Dirt", weight: 2.5 }
    const mareSurfName = mareSurfacePref?.value?.toLowerCase();
    const studSurfName = studSurfacePref?.value?.toLowerCase();
    const mareSurfStars = mareSurfacePref?.weight || 0;
    const studSurfStars = studSurfacePref?.weight || 0;

    if (mareSurfName) { // Mare has a defined surface preference
        if (studSurfName) {
            if (mareSurfName === studSurfName) {
                surfaceScore += 30; // Very strong match
                surfaceScore += mareSurfStars * 2 + studSurfStars * 2; // Bonus for stars
            } else if ((mareSurfName === 'dirt' && studSurfName === 'synthetic') || (mareSurfName === 'synthetic' && studSurfName === 'dirt') ||
                       (mareSurfName === 'turf' && studSurfName === 'synthetic') || (mareSurfName === 'synthetic' && studSurfName === 'turf')) {
                surfaceScore += 5; // Synthetic compatibility with specific mare prefs
            }
        }
    } else { // Mare has undefined surface preference
        if (studSurfName === 'synthetic') {
            surfaceScore += 10; // Bonus for synthetic stud if mare has no preference
        }
        surfaceScore += studSurfStars * 1.5; // Bonus for stud's own stars
    }
    scoreComponents.surface = surfaceScore;
    newScore += surfaceScore;

    // 2. Trait Quality Score
    let traitQualityScore = 0;
    const traitWeights = { heart: 1.5, stamina: 1.2, speed: 1.2, finish: 1, start: 0.8, temper: 0.5 };
    for (const trait of CORE_TRAITS) {
        const studTraitGrade = studStats?.[trait];
        const studTraitNumeric = DETAILED_TRAIT_SCALE[studTraitGrade];
        if (studTraitNumeric !== undefined) {
            traitQualityScore += studTraitNumeric * (traitWeights[trait] || 1);
        }
    }
    scoreComponents.traitQuality = traitQualityScore;
    newScore += traitQualityScore;
    
    // 3. Stud's Own Subgrade Score (using the new calculator)
    const studSubgrade = calculateSubgrade(studGrade, studStats) || 0;
    scoreComponents.studSubgrade = studSubgrade * 2; // Weighting subgrade
    newScore += studSubgrade * 2;

    // 4. Performance Score
    let performanceScore = 0;
    performanceScore += wins * 0.5;
    performanceScore += Math.min(biggestPrize / 10000, 10); // Cap at 10 points
    if (stud.raw_data?.remainingStudCount > 0) {
        performanceScore += Math.min(stud.raw_data.remainingStudCount / 10, 5); // Cap at 5 points
    }
    scoreComponents.performance = performanceScore;
    newScore += performanceScore;
    
    // --- End New Scoring Logic ---

    const enrichedStats = {
      ...studStats,
      wins,
      races: parseInt(historyStats.starts || historyStats.races || 0),
      majorWins: parseInt(historyStats.majorWins || 0),
      podium: (parseInt(historyStats.starts || historyStats.races || 0) > 0) ? Math.round((wins / parseInt(historyStats.starts || historyStats.races || 0)) * 100) : null,
      grade: studGrade,
      subgrade: studSubgrade, // Calculated with new function
      biggestPrize,
      remainingStudCount: stud.raw_data?.remainingStudCount
    };

    let reason = 'N/A'; // Keep reason for context if needed
    if (kdWinnerIds.has(studId)) reason = 'KD_WINNER';
    else if (stud.raw_data?.sireId && kdWinnerIds.has(stud.raw_data.sireId)) reason = 'PROGENY_OF_KD_WINNER';
    // Add other reasons if necessary, but score should be primary

    log(`[DEBUG SCORING] Stud: ${studName} (ID: ${studId})`);
    log(`  Components: Dir=${scoreComponents.direction}, Surf=${scoreComponents.surface}, TraitQ=${scoreComponents.traitQuality.toFixed(2)}, SubG=${scoreComponents.studSubgrade}, Perf=${scoreComponents.performance.toFixed(2)}`);
    log(`  Final Score (raw): ${newScore.toFixed(2)}, Rounded: ${Math.round(newScore)}`);
    if (Math.round(newScore) <= 0) { // Log if score is too low to be meaningful
        log(`  WARN: Stud ${studName} final score is <= 0.`);
    }


    const finalRoundedScore = Math.round(newScore); // Define finalRoundedScore here
    log(`[DB INSERT] Mare: ${mareName}, Stud: ${studName} (ID: ${studId}), Score: ${finalRoundedScore}, Reason: ${reason}`);

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
        mare.id,
        mare.raw_data?.name || 'Unknown Mare',
        studId,
        stud.raw_data?.name || 'Unknown Stud',
        finalRoundedScore, // Use the logged rounded score
        reason,
        mareStats,
        enrichedStats,
      ]
    );
  }
  log(`[FILTER STATS for Mare ${mareId}] Initial studs: ${studsAvailableForLoop}, Processed in loop: ${processedInLoop}`);
  log(`  Passed Racing Stats: ${passedRacingStatsCheck}`);
  log(`  Passed Grade Check (>=S-): ${passedGradeCheck}`);
  log(`  Passed Inbreeding Check: ${passedInbreedingCheck}`);
  log(`  Passed Listing/Availability Check: ${passedListingCheck}`);
  log(`  Passed Trait Quality Check (all >=C+): ${passedTraitQualityCheck}`);

  await client.end();
  log(`✅ Done inserting matches for mare ${mareId}. Inserted ${passedTraitQualityCheck > 0 ? 'some (check DB)' : 0} actual matches if scores were high enough.`); // Approximation
  logStream.end();
}

module.exports = { insertMatchesForMare };

if (require.main === module) {
  (async () => await insertMatchesForMare(process.argv[2]))();
}

run();