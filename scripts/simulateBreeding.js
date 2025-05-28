const { calculateSubgrade } = require('../utils/calculateSubgrade'); // Import the new subgrade calculator

// Comprehensive Grade Scales (D- to SSS)
const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};
const REVERSE_DETAILED_TRAIT_SCALE = Object.fromEntries(Object.entries(DETAILED_TRAIT_SCALE).map(([k, v]) => [v, k]));
const DETAILED_SCALE_MIN_VAL = 0;
const DETAILED_SCALE_MAX_VAL = 19;

const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper']; // Renamed from TRAITS for clarity

function blendTrait(mareGrade, studGrade) {
  const mVal = DETAILED_TRAIT_SCALE[mareGrade] ?? DETAILED_TRAIT_SCALE['C'];
  const sVal = DETAILED_TRAIT_SCALE[studGrade] ?? DETAILED_TRAIT_SCALE['C'];

  const avg = Math.round((mVal + sVal) / 2);

  // Weighted mutation: 10% down, 80% stable, 10% up (consistent with bestMatchService)
  const roll = Math.random();
  let mutation = 0;
  if (roll < 0.1) mutation = -1;      // 10% chance down
  else if (roll >= 0.9) mutation = 1; // 10% chance up
  // 80% chance for no mutation

  const finalNumericalValue = Math.max(DETAILED_SCALE_MIN_VAL, Math.min(DETAILED_SCALE_MAX_VAL, avg + mutation));
  return REVERSE_DETAILED_TRAIT_SCALE[finalNumericalValue];
}

// Helper function to get foal's overall grade (needed for subgrade calculation)
function getFoalOverallGrade(foalAllTraitsObject) {
  const scores = CORE_TRAITS.map(trait => DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]] ?? DETAILED_TRAIT_SCALE['C']);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const roundedAvg = Math.round(avgScore);
  return REVERSE_DETAILED_TRAIT_SCALE[roundedAvg] || 'C'; // Default to 'C' if somehow out of bounds
}


// --- New Star Calculation Logic ---

function calculateDirectionStars(mareDirection, studDirection) {
  const mStars = mareDirection?.stars ?? 1; // Default to 1 star if undefined
  const sStars = studDirection?.stars ?? 1;
  const mName = mareDirection?.name?.toLowerCase();
  const sName = studDirection?.name?.toLowerCase();

  let avgBase = (mStars + sStars) / 2;

  if (mName && sName) {
    if (mName === sName) { // Match (e.g., left/left)
      // No change to avgBase, direct average
    } else if ((mName === 'left' && sName === 'right') || (mName === 'right' && sName === 'left')) { // Opposition
      avgBase -= 0.5; // Penalty
    } else if (mName === 'balanced' || sName === 'balanced') { // One is balanced
      // No change, treat balanced as compatible
    }
    // Other combinations (e.g. specific vs missing) are treated as neutral for now
  }

  const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
  return Math.max(0, Math.min(3, Math.round(avgBase + delta)));
}

function calculateSurfaceStars(mareSurface, studSurface) {
  const mStars = mareSurface?.stars ?? 1;
  const sStars = studSurface?.stars ?? 1;
  const mName = mareSurface?.name?.toLowerCase();
  const sName = studSurface?.name?.toLowerCase();

  let avgBase = (mStars + sStars) / 2;

  if (mName && sName) {
    if (mName === sName) { // Direct match (dirt/dirt, firm/firm, etc.)
      // No change
    } else if (
      (mName === 'dirt' && sName === 'firm') || (mName === 'firm' && sName === 'dirt') ||
      (mName === 'firm' && sName === 'soft') || (mName === 'soft' && sName === 'firm')
    ) { // Adjacent mismatch
      avgBase -= 0.5;
    } else if (
      (mName === 'dirt' && sName === 'soft') || (mName === 'soft' && sName === 'dirt')
    ) { // Opposite mismatch
      avgBase -= 1.0;
    } else if (mName === 'synthetic' || sName === 'synthetic') {
        // If one is synthetic, consider it compatible with others for now (no penalty/bonus)
        // More nuanced logic could be added if synthetic has specific interactions
    }
    // Other combinations (e.g. specific vs missing, or unlisted pairings) are neutral
  }

  const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
  return Math.max(0, Math.min(3, Math.round(avgBase + delta)));
}


function simulateBreeding(mare, stud, runs = 1000) {
  const results = [];

  const mareStats = mare.racing || {};
  const studStats = stud.racing || {};

  for (let i = 0; i < runs; i++) {
    const foal = {};

    for (const t of CORE_TRAITS) {
      const mareTrait = mareStats[t] ?? 'C'; // Default to 'C' if trait missing
      const studTrait = studStats[t] ?? 'C';
      foal[t] = blendTrait(mareTrait, studTrait);
    }

    // Use new star calculation functions
    foal.directionStars = calculateDirectionStars(mareStats.direction, studStats.direction);
    foal.surfaceStars = calculateSurfaceStars(mareStats.surface, studStats.surface);

    // Calculate foal's overall grade first, then subgrade
    const foalOverallGrade = getFoalOverallGrade(foal);
    foal.grade = foalOverallGrade; // Store the foal's actual grade
    foal.subgrade = calculateSubgrade(foalOverallGrade, foal); // Use the imported function

    results.push(foal);
  }

  // Analyze trait distributions
  const stats = {};

  for (const t of CORE_TRAITS) {
    const vals = results.map(r => DETAILED_TRAIT_SCALE[r[t]]).filter(v => v != null).sort((a, b) => a - b);
    if (!vals.length) continue;

    stats[t] = {
      min: REVERSE_DETAILED_TRAIT_SCALE[vals[0]],
      max: REVERSE_DETAILED_TRAIT_SCALE[vals[vals.length - 1]],
      median: REVERSE_DETAILED_TRAIT_SCALE[vals[Math.floor(vals.length / 2)]],
      p75: REVERSE_DETAILED_TRAIT_SCALE[vals[Math.floor(vals.length * 0.75)]],
      // Ensure 'SS-' is a valid key in DETAILED_TRAIT_SCALE for this calculation
      ssOrBetterChance: Math.round(vals.filter(v => v >= (DETAILED_TRAIT_SCALE['SS-'] ?? DETAILED_SCALE_MAX_VAL + 1)).length / vals.length * 100)
    };
  }

  const dirVals = results.map(r => r.directionStars);
  const surfVals = results.map(r => r.surfaceStars);
  const subgrades = results.map(r => r.subgrade);

  stats.directionStars = {
    min: Math.min(...dirVals),
    max: Math.max(...dirVals),
    avg: (dirVals.reduce((a, b) => a + b, 0) / dirVals.length).toFixed(2)
  };

  stats.surfaceStars = {
    min: Math.min(...surfVals),
    max: Math.max(...surfVals),
    avg: (surfVals.reduce((a, b) => a + b, 0) / surfVals.length).toFixed(2)
  };

  stats.subgrade = {
    min: Math.min(...subgrades).toFixed(2),
    max: Math.max(...subgrades).toFixed(2),
    avg: (subgrades.reduce((a, b) => a + b, 0) / subgrades.length).toFixed(2)
  };

  // 🎯 Foal grade is now directly calculated per foal, so we can average that.
  // Or, keep the median-based prediction as a different type of "expected" grade.
  // For now, let's report the average of the calculated foal grades.
  const foalActualGradesNumeric = results.map(r => DETAILED_TRAIT_SCALE[r.grade]).filter(v => v != null);
  if (foalActualGradesNumeric.length > 0) {
    const avgFoalGradeNumeric = foalActualGradesNumeric.reduce((a,b) => a+b, 0) / foalActualGradesNumeric.length;
    stats.averageFoalGrade = REVERSE_DETAILED_TRAIT_SCALE[Math.round(avgFoalGradeNumeric)] || 'C';
  } else {
    stats.averageFoalGrade = 'N/A';
  }
  // The old stats.grade was a prediction based on medians. The new foal.grade is per-simulation.

  // 🧮 Propagate score if available (stud's score, not foal's)
  stats.studScore = stud?.score ?? 'N/A'; // Clarify this is stud's score

  // 🏁 Estimate podium/win probability from weighted trait score
  const weights = {
    start: 1.0,
    speed: 2.0,
    stamina: 1.5,
    heart: 1.5
  };

  let totalScore = 0;

  for (const foal of results) {
    let score = 0;
    for (const trait in weights) {
      const g = foal[trait]; // Grade string like 'A+'
      if (g in DETAILED_TRAIT_SCALE) {
        score += weights[trait] * DETAILED_TRAIT_SCALE[g];
      }
    }
    totalScore += score;
  }

  // Max possible score based on SSS (value 19) for weighted traits
  const maxPossibleTraitValue = DETAILED_SCALE_MAX_VAL; // SSS = 19
  const maxScore = Object.values(weights).reduce((sum, w) => sum + w * maxPossibleTraitValue, 0);
  const avgScore = results.length > 0 ? totalScore / results.length : 0;
  const scorePct = maxScore > 0 ? avgScore / maxScore : 0;

  stats.expectedPodium = Math.round(scorePct * 100);             // Linear mapping
  stats.expectedWin = Math.round((scorePct ** 2) * 100);         // Quadratic decay

  return stats;
}

module.exports = { simulateBreeding };