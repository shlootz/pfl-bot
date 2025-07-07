/**
 * utils/bestMatchService.js
 *
 * Find the best breeding partners for a mare by simulating offspring
 * and scoring possible studs from the database or API.
 */

require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const { insertMatchesForMare } = require('../scripts/scoreKDTargets');
const { isPairInbred } = require('./inbreedingService');
const { calculateSubgrade } = require('./calculateSubgrade');
const { simulateBreeding } = require('../scripts/simulateBreeding');

// --- Constants ---
const PFL_API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const DELAY_MS = parseInt(process.env.PFL_API_DELAY_MS || '1000', 10);
const MAX_RETRIES = parseInt(process.env.PFL_API_MAX_RETRIES || '5', 10);
const PFL_HORSE_DETAIL_API_URL = 'https://api.photofinish.live/pfl-pro/horse-api/{horse_id}';

const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};
const REVERSE_DETAILED_TRAIT_SCALE = Object.fromEntries(
  Object.entries(DETAILED_TRAIT_SCALE).map(([k, v]) => [v, k])
);

const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];
const TRAIT_WEIGHTS = { heart: 0.3, speed: 0.25, stamina: 0.2, finish: 0.15, start: 0.05, temper: 0.05 };

// --- Utility Functions ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, horseIdForLog, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`API Call: Fetching data from ${url} for horse ${horseIdForLog}, attempt ${attempt}`);
      const response = await axios.get(url, {
        headers: { 'x-api-key': PFL_API_KEY },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.warn(`API Warn: Attempt ${attempt} failed for ${url} (horse ${horseIdForLog}): ${error.message}`);
      if (attempt < retries) {
        const backoff = DELAY_MS * (2 ** (attempt - 1));
        console.log(`API Retry: Retrying in ${backoff} ms...`);
        await sleep(backoff);
      } else {
        console.error(`API Error: All ${retries} retries failed for ${url} (horse ${horseIdForLog}).`);
        return null;
      }
    }
  }
}

async function getHorseDetails(horseId, dbClient) {
  let rawData;

  // Try local horses table
  try {
    const dbResultHorses = await dbClient.query("SELECT raw_data FROM horses WHERE id = $1", [horseId]);
    if (dbResultHorses.rows.length > 0 && dbResultHorses.rows[0].raw_data) {
      rawData = dbResultHorses.rows[0].raw_data;
      console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'horses' table.`);
    }
  } catch (dbError) {
    console.error(`DB Query Error (getHorseDetails): ${dbError.message}`);
  }

  // Try ancestors table if not found
  if (!rawData) {
    try {
      const dbResultAncestors = await dbClient.query("SELECT raw_data FROM ancestors WHERE id = $1", [horseId]);
      if (dbResultAncestors.rows.length > 0 && dbResultAncestors.rows[0].raw_data) {
        rawData = dbResultAncestors.rows[0].raw_data;
        console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'ancestors' table.`);
      }
    } catch (dbError) {
      console.error(`DB Query Error (getHorseDetails): ${dbError.message}`);
    }
  }

  // If still not found, fetch from API
  if (!rawData) {
    console.log(`DB Miss (getHorseDetails): Horse ${horseId} not found locally. Fetching from API.`);
    const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', horseId);
    const apiHorseData = await fetchWithRetry(detailUrl, horseId);
    await sleep(DELAY_MS);

    if (apiHorseData?.horse?.id) {
      rawData = apiHorseData.horse;
      console.log(`API Hit (getHorseDetails): Fetched horse ${horseId} from API.`);

      // Cache it
      try {
        const query = `
          INSERT INTO ancestors (id, raw_data, fetched)
          VALUES ($1, $2, NOW())
          ON CONFLICT (id) DO UPDATE
          SET raw_data = EXCLUDED.raw_data, fetched = NOW();
        `;
        await dbClient.query(query, [rawData.id, rawData]);
        console.log(`DB Cache (getHorseDetails): Cached horse ${rawData.id} in ancestors.`);
      } catch (dbError) {
        console.error(`DB Cache Error (getHorseDetails): ${dbError.message}`);
      }
    } else {
      console.log(`API Miss (getHorseDetails): Failed to fetch horse ${horseId} from API.`);
      return null;
    }
  }

  return rawData?.id ? rawData : null;
}

// --- Main Service Function ---

async function findBestBreedingPartners(mareId, topXStudsToConsider) {
  const client = new Client({ connectionString: DB_URL });

  try {
    await client.connect();
    console.log('DB Connect (BestMatch): Successfully connected.');
  } catch (err) {
    console.error('DB Connect Error (BestMatch):', err);
    throw new Error('Database connection failed.');
  }

  let mareFullDetails;

  try {
    // Look in local mares table
    const mareDbResult = await client.query("SELECT raw_data FROM mares WHERE id = $1", [mareId]);
    if (mareDbResult.rows.length > 0 && mareDbResult.rows[0].raw_data) {
      mareFullDetails = mareDbResult.rows[0].raw_data;
      console.log(`DB Hit (BestMatch/Mare): Found mare ${mareId} in 'mares' table.`);
    } else {
      // Fetch from API
      console.log(`DB Miss (BestMatch/Mare): Fetching mare ${mareId} from PFL API.`);
      const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', mareId);
      const apiHorseData = await fetchWithRetry(detailUrl, `mare ${mareId}`);
      await sleep(DELAY_MS);

      if (apiHorseData?.horse?.id) {
        mareFullDetails = apiHorseData.horse;
        console.log(`API Hit (BestMatch/Mare): Fetched mare ${mareId}.`);

        // Cache it
        try {
          const insertQuery = `
            INSERT INTO mares (id, raw_data)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE
              SET raw_data = EXCLUDED.raw_data,
                  updated_at = NOW();
          `;
          await client.query(insertQuery, [mareFullDetails.id, mareFullDetails]);
          console.log(`DB Cache (BestMatch/Mare): Cached mare ${mareFullDetails.id} (${mareFullDetails.name || 'N/A'}).`);
        } catch (dbInsertError) {
          console.error(`DB Cache Error (BestMatch/Mare): ${dbInsertError.message}`);
        }
      } else {
        console.log(`API Miss (BestMatch/Mare): Could not fetch mare ${mareId}.`);
      }
    }
  } catch (fetchError) {
    console.error(`Error fetching mare details: ${fetchError.message}`, fetchError);
  }

  if (!mareFullDetails || !mareFullDetails.id) {
    const errorMessage = `Mare ID ${mareId} not found in DB or API.`;
    console.log(`BestMatch: ${errorMessage}`);
    try { await client.end(); } catch(e) { console.error("DB Disconnect Error:", e); }
    return {
      sortedResults: [],
      mareName: `Mare ${mareId}`,
      totalSimsRun: 0,
      studsProcessedCount: 0,
      error: errorMessage
    };
  }

  const mareName = mareFullDetails.name || `Mare ${mareId}`;
  let selectedStudsForSimulation = [];

  try {
    await insertMatchesForMare(mareId);

    const kdMatchesResult = await client.query(
      `SELECT stud_id, stud_name, stud_stats, score
       FROM kd_target_matches
       WHERE mare_id = $1
       ORDER BY score DESC
       LIMIT $2`,
      [mareId, topXStudsToConsider]
    );
    selectedStudsForSimulation = kdMatchesResult.rows;
    console.log(`BestMatch: Fetched ${selectedStudsForSimulation.length} top studs for mare ${mareId}.`);
  } catch (e) {
    console.error('DB Error (BestMatch):', e);
    return { sortedResults: [], mareName, totalSimsRun: 0, studsProcessedCount: 0 };
  }

  const bestFoalsAcrossAllPairs = [];
  let studsActuallyProcessed = 0;

  for (const studData of selectedStudsForSimulation) {
    const studRawData = await getHorseDetails(studData.stud_id, client);
    if (!studRawData) {
      console.log(`BestMatch: Skipping stud ${studData.stud_id} — details unavailable.`);
      continue;
    }

    const marePref = mareFullDetails.racing || {};
    const studPref = studRawData.racing || {};
    const dirMatch = marePref.direction?.value === studPref.direction?.value;
    const surfMatch = marePref.surface?.value === studPref.surface?.value;
    const condMatch = marePref.condition?.value === studPref.condition?.value;

    if (!dirMatch || !surfMatch || !condMatch) {
      console.log(`BestMatch: Skipping stud ${studRawData.name} due to preference mismatch.`);
      continue;
    }

    if (isPairInbred(mareFullDetails, studRawData)) {
      console.log(`BestMatch: Mare ${mareName} and Stud ${studRawData.name} are INBRED. Skipping.`);
      continue;
    }

    console.log(`BestMatch: Simulating mare ${mareName} x stud ${studRawData.name}`);

    const simStats = await simulateBreeding(
      { racing: mareFullDetails.racing },
      { racing: studRawData.racing },
      1000
    );

    const medianFoalTraits = {};
    CORE_TRAITS.forEach(trait => {
      medianFoalTraits[trait] = simStats[trait]?.median || 'C';
    });

    const overallGradeString = simStats.averageFoalGrade || 'C';
    const subgrade = simStats.subgrade?.avg || 0;
    const weightedScore = Object.entries(TRAIT_WEIGHTS).reduce((sum, [trait, weight]) => {
      const traitVal = DETAILED_TRAIT_SCALE[medianFoalTraits[trait]] ?? DETAILED_TRAIT_SCALE['C'];
      return sum + traitVal * weight;
    }, 0);

    const preferences = {
      LeftTurning: simStats.LeftTurning,
      RightTurning: simStats.RightTurning,
      Turf: simStats.Turf,
      Dirt: simStats.Dirt,
      Firm: simStats.Firm,
      Soft: simStats.Soft,
      totalStars: simStats.totalStars
    };

    studsActuallyProcessed++;

    bestFoalsAcrossAllPairs.push({
      mare: mareFullDetails,
      stud: studRawData,
      bestFoal: {
        traits: medianFoalTraits,
        overallGradeString,
        weightedScore,
        subgrade,
        preferences
      },
      simStats
    });
  }

  bestFoalsAcrossAllPairs.sort((a, b) => {
    const gradeA = DETAILED_TRAIT_SCALE[a.bestFoal.overallGradeString];
    const gradeB = DETAILED_TRAIT_SCALE[b.bestFoal.overallGradeString];
    if (gradeB !== gradeA) return gradeB - gradeA;
    return b.bestFoal.weightedScore - a.bestFoal.weightedScore;
  });

  try {
    await client.end();
    console.log('DB Disconnect (BestMatch): Connection closed.');
  } catch (err) {
    console.error('DB Disconnect Error (BestMatch):', err);
  }

  return {
    sortedResults: bestFoalsAcrossAllPairs,
    mareName,
    totalSimsRun: studsActuallyProcessed * 1000,
    studsProcessedCount: studsActuallyProcessed
  };
}

module.exports = { findBestBreedingPartners };