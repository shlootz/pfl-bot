require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const { insertMatchesForMare } = require('../scripts/scoreKDTargets'); // Adjusted path
const { isPairInbred } = require('./inbreedingService');
const { calculateSubgrade } = require('./calculateSubgrade');

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
  'SSS-': 18, 'SSS': 19 // Assuming SSS is 19, SSS+ would be 20 if it exists
};
const REVERSE_DETAILED_TRAIT_SCALE = Object.fromEntries(Object.entries(DETAILED_TRAIT_SCALE).map(([k, v]) => [v, k]));
const DETAILED_SCALE_MIN_VAL = 0;
const DETAILED_SCALE_MAX_VAL = 19; // Adjust if SSS+ or higher exists and is used

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
      const response = await axios.get(url, { headers: { 'x-api-key': PFL_API_KEY }, timeout: 10000 });
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
  try {
    const dbResultHorses = await dbClient.query("SELECT raw_data FROM horses WHERE id = $1", [horseId]);
    if (dbResultHorses.rows.length > 0 && dbResultHorses.rows[0].raw_data) {
      rawData = dbResultHorses.rows[0].raw_data;
      console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'horses' table.`);
    }
  } catch (dbError) { console.error(`DB Query Error (getHorseDetails): Failed to query 'horses' for ${horseId}: ${dbError.message}`); }

  if (!rawData) {
    try {
      const dbResultAncestors = await dbClient.query("SELECT raw_data FROM ancestors WHERE id = $1", [horseId]);
      if (dbResultAncestors.rows.length > 0 && dbResultAncestors.rows[0].raw_data) {
        rawData = dbResultAncestors.rows[0].raw_data;
        console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'ancestors' table.`);
      }
    } catch (dbError) { console.error(`DB Query Error (getHorseDetails): Failed to query 'ancestors' for ${horseId}: ${dbError.message}`); }
  }

  if (!rawData) {
    console.log(`DB Miss (getHorseDetails): Horse ${horseId} not in local tables. Fetching from API.`);
    const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', horseId);
    const apiHorseData = await fetchWithRetry(detailUrl, horseId);
    await sleep(DELAY_MS);
    if (apiHorseData && apiHorseData.horse) {
      rawData = apiHorseData.horse;
      console.log(`API Hit (getHorseDetails): Fetched horse ${horseId} from API.`);
      if (rawData.id) {
        try {
          const query = `INSERT INTO ancestors (id, raw_data, fetched) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET raw_data = EXCLUDED.raw_data, fetched = NOW();`;
          await dbClient.query(query, [rawData.id, rawData]);
          console.log(`DB Cache (getHorseDetails): Cached/Updated horse ${rawData.id} in ancestors.`);
        } catch (dbError) { console.error(`DB Cache Error (getHorseDetails): Failed to cache ${rawData.id}: ${dbError.message}`); }
      }
    } else {
      console.log(`API Miss (getHorseDetails): Failed to fetch horse ${horseId} from API.`);
      return null;
    }
  }
  return rawData && rawData.id ? rawData : null;
}

function adaptBlendTrait(mareTraitGradeString, studTraitGradeString) {
  const mVal = DETAILED_TRAIT_SCALE[mareTraitGradeString] ?? DETAILED_TRAIT_SCALE['C']; // Default to 'C' if undefined
  const sVal = DETAILED_TRAIT_SCALE[studTraitGradeString] ?? DETAILED_TRAIT_SCALE['C'];

  const avg = Math.round((mVal + sVal) / 2);
  const roll = Math.random();
  let mutation = 0;
  if (roll < 0.1) mutation = -1;      // 10% chance down
  else if (roll >= 0.9) mutation = 1; // 10% chance up (0.9 to 0.999...)
  // 80% chance for no mutation (roll between 0.1 and < 0.9)

  const finalNumericalValue = Math.max(DETAILED_SCALE_MIN_VAL, Math.min(DETAILED_SCALE_MAX_VAL, avg + mutation));
  return REVERSE_DETAILED_TRAIT_SCALE[finalNumericalValue];
}

function adaptRollStars(mareStars = 1, studStars = 1) { // Default to 1 star if undefined
  const m = typeof mareStars === 'number' ? mareStars : 1;
  const s = typeof studStars === 'number' ? studStars : 1;
  const avg = (m + s) / 2;
  const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
  return Math.max(0, Math.min(3, Math.round(avg + delta)));
}

function getOverallFoalGrade(foalAllTraitsObject) {
  const scores = CORE_TRAITS.map(trait => DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]] ?? DETAILED_TRAIT_SCALE['C']);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const roundedAvg = Math.round(avg);
  return REVERSE_DETAILED_TRAIT_SCALE[roundedAvg] || 'C'; // Default to 'C' if somehow out of bounds
}

function calculateWeightedTraitScore(foalAllTraitsObject) {
  let totalWeightedScore = 0;
  for (const trait of CORE_TRAITS) { // Ensure iteration order matches TRAIT_WEIGHTS if it's an array
    const numericalValue = DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]] ?? DETAILED_TRAIT_SCALE['C'];
    totalWeightedScore += numericalValue * (TRAIT_WEIGHTS[trait] || 0);
  }
  return totalWeightedScore;
}

// --- Simulation Logic ---
async function simulateSingleBestFoalOutOfN(mareFullDetails, studFullDetails, numRuns) {
  const mareRacingTraits = mareFullDetails?.raw_data?.racing || {};
  const studRacingTraits = studFullDetails?.raw_data?.racing || {};

  let bestSimulatedFoalData = null;
  let bestFoalOverallGradeNumeric = -1;
  let bestFoalWeightedScore = -Infinity;

  for (let i = 0; i < numRuns; i++) {
    const currentSimulatedFoalTraits = {};
    CORE_TRAITS.forEach(trait => {
      currentSimulatedFoalTraits[trait] = adaptBlendTrait(mareRacingTraits[trait], studRacingTraits[trait]);
    });

    const currentFoalOverallGradeString = getOverallFoalGrade(currentSimulatedFoalTraits);
    const currentFoalOverallGradeNumeric = DETAILED_TRAIT_SCALE[currentFoalOverallGradeString];
    const currentFoalWeightedScore = calculateWeightedTraitScore(currentSimulatedFoalTraits);

    if (currentFoalOverallGradeNumeric > bestFoalOverallGradeNumeric) {
      bestFoalOverallGradeNumeric = currentFoalOverallGradeNumeric;
      bestFoalWeightedScore = currentFoalWeightedScore;
      bestSimulatedFoalData = { traits: currentSimulatedFoalTraits, overallGradeString: currentFoalOverallGradeString, weightedScore: currentFoalWeightedScore };
    } else if (currentFoalOverallGradeNumeric === bestFoalOverallGradeNumeric && currentFoalWeightedScore > bestFoalWeightedScore) {
      bestFoalWeightedScore = currentFoalWeightedScore;
      bestSimulatedFoalData = { traits: currentSimulatedFoalTraits, overallGradeString: currentFoalOverallGradeString, weightedScore: currentFoalWeightedScore };
    }
  }
  return bestSimulatedFoalData;
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

  let mareFullDetails; // This will store the raw_data of the mare

  // --- START NEW MARE FETCHING LOGIC ---
  try {
    // 1. Attempt to query the `mares` table
    const mareDbResult = await client.query("SELECT raw_data FROM mares WHERE id = $1", [mareId]);
    if (mareDbResult.rows.length > 0 && mareDbResult.rows[0].raw_data) {
      mareFullDetails = mareDbResult.rows[0].raw_data;
      console.log(`DB Hit (BestMatch/Mare): Found mare ${mareId} in 'mares' table.`);
    } else {
      // 2. Mare not found in `mares` table, try PFL API
      console.log(`DB Miss (BestMatch/Mare): Mare ${mareId} not in 'mares' table. Fetching from PFL API.`);
      const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', mareId);
      const apiHorseData = await fetchWithRetry(detailUrl, `mare ${mareId}`); // Pass context for logging
      await sleep(DELAY_MS); // Respect API rate limits

      if (apiHorseData && apiHorseData.horse && apiHorseData.horse.id) {
        mareFullDetails = apiHorseData.horse; // This is the raw_data
        console.log(`API Hit (BestMatch/Mare): Fetched mare ${mareId} from PFL API.`);

        // 3. Store fetched mare data into the `mares` table
        try {
          const insertQuery = `
            INSERT INTO mares (id, raw_data)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `;
          // The 'name' column does not exist in the 'mares' table based on the helper script.
          // The 'updated_at' field is used instead of 'fetched_at'.
          await client.query(insertQuery, [mareFullDetails.id, mareFullDetails]);
          console.log(`DB Cache (BestMatch/Mare): Cached/Updated mare ${mareFullDetails.id} (${mareFullDetails.name || 'N/A'}) in 'mares' table.`);
        } catch (dbInsertError) {
          console.error(`DB Cache Error (BestMatch/Mare): Failed to cache mare ${mareFullDetails.id} into 'mares' table: ${dbInsertError.message}`);
          // Continue with mareFullDetails even if caching fails, but log the error.
        }
      } else {
        console.log(`API Miss (BestMatch/Mare): Failed to fetch mare ${mareId} from PFL API. API response:`, apiHorseData);
        // mareFullDetails remains undefined
      }
    }
  } catch (fetchError) {
    console.error(`Error fetching mare details for ${mareId} in BestMatch: ${fetchError.message}`, fetchError);
    // mareFullDetails remains undefined or in an error state
  }
  // --- END NEW MARE FETCHING LOGIC ---

  if (!mareFullDetails || !mareFullDetails.id) { // Check if mareFullDetails was successfully populated
    const errorMessage = `Mare ID ${mareId} not found in local 'mares' DB and could not be fetched from PFL API.`;
    console.log(`BestMatch: ${errorMessage}`);
    try { await client.end(); } catch(e) { console.error("DB Disconnect Error (BestMatch):", e); }
    return {
      sortedResults: [],
      mareName: `Mare ${mareId}`,
      totalSimsRun: 0,
      studsProcessedCount: 0,
      error: errorMessage
    };
  }
  // mareFullDetails is the actual raw data object for the mare
  const mareName = mareFullDetails.name || `Mare ${mareId}`;
  // const mareRacingStats = mareFullDetails.racing || {}; // Not directly used here anymore, passed via object to simulation

  let selectedStudsForSimulation = [];
  try {
    // Step 1: Ensure kd_target_matches is up-to-date for this mare
    // Note: insertMatchesForMare handles its own DB connection.
    // If it were to use the existing `client`, the call would be `await insertMatchesForMare(mareId, client);`
    console.log(`BestMatch: Updating KD target matches for mare ${mareId}...`);
    await insertMatchesForMare(mareId);
    console.log(`BestMatch: KD target matches updated for mare ${mareId}.`);

    // Step 2: Query the kd_target_matches table for the top studs for this mare
    const kdMatchesResult = await client.query(
      `SELECT stud_id, stud_name, stud_stats, score
       FROM kd_target_matches
       WHERE mare_id = $1
       ORDER BY score DESC
       LIMIT $2`,
      [mareId, topXStudsToConsider]
    );
    selectedStudsForSimulation = kdMatchesResult.rows;
    console.log(`BestMatch: Fetched ${selectedStudsForSimulation.length} top studs from kd_target_matches for mare ${mareId}.`);

    if (selectedStudsForSimulation.length === 0) {
      console.log(`BestMatch: No suitable studs found in kd_target_matches for mare ${mareId}.`);
      // No need to end client here, will be ended in finally block or after processing
    }
  } catch (e) {
    console.error('DB Error (BestMatch): Failed during stud selection for mare', mareId, e);
    // No need to end client here, will be ended in finally block
    // Return early as we can't proceed without studs
    return { sortedResults: [], mareName, totalSimsRun: 0, studsProcessedCount: 0 };
  }

  const bestFoalsAcrossAllPairs = [];
  let studsActuallyProcessed = 0;

  for (const studDataFromDB of selectedStudsForSimulation) {
    // studDataFromDB contains: stud_id, stud_name, stud_stats (enrichedRacingStats), score

    // Fetch full stud details to get simpleFamilyTree for inbreeding check
    // getHorseDetails returns the raw_data object directly, or null
    const studRawData = await getHorseDetails(studDataFromDB.stud_id, client);

    if (!studRawData) {
      console.log(`BestMatch: Stud ${studDataFromDB.stud_id} details not found by getHorseDetails. Skipping.`);
      continue;
    }

    // ✅ Preference match check
    const marePref = mareFullDetails.racing || {};
    const studPref = studRawData.racing || {};

    const dirMatch = marePref.direction?.value === studPref.direction?.value;
    const surfMatch = marePref.surface?.value === studPref.surface?.value;
    const condMatch = marePref.condition?.value === studPref.condition?.value;

    if (!dirMatch || !surfMatch || !condMatch) {
      console.log(`BestMatch: Skipping stud ${studRawData.name} due to preference mismatch.`);
      continue;
    }

    // Perform inbreeding check
    // mareFullDetails is already the raw_data object for the mare
    if (isPairInbred(mareFullDetails, studRawData)) {
      console.log(`BestMatch: Mare ${mareName} (ID: ${mareId}) and Stud ${studRawData.name} (ID: ${studRawData.id}) are INBRED. Skipping simulation.`);
      continue; // Skip this stud
    }

    // Construct the object expected by simulateSingleBestFoalOutOfN
    // It needs a raw_data property which then contains racing traits.
    // The stud_stats from kd_target_matches are enriched, but simulation uses standard racing traits.
    // We will use studRawData.racing from the full details.
    const studDetailsForSim = { raw_data: studRawData };


    console.log(`BestMatch: Simulating mare ${mareName} (ID: ${mareId}) with stud ${studRawData.name} (ID: ${studRawData.id})`);
    // Pass mareFullDetails (which is raw_data) wrapped in an object, and studDetailsForSim
    const bestFoalDataForPair = await simulateSingleBestFoalOutOfN({ raw_data: mareFullDetails }, studDetailsForSim, 1000);

    if (bestFoalDataForPair) {
      studsActuallyProcessed++;
      const subgrade = calculateSubgrade(bestFoalDataForPair.overallGradeString, bestFoalDataForPair.traits);
      bestFoalsAcrossAllPairs.push({
        mare: mareFullDetails, // mareFullDetails is already the raw_data object
        stud: studRawData,     // Store the full studRawData
        bestFoal: { ...bestFoalDataForPair, subgrade }
      });
    }
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