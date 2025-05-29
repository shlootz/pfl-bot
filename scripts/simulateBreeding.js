
const { calculateSubgrade } = require('../utils/calculateSubgrade');

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
const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

function blendTrait(mareGrade, studGrade) {
  const mVal = DETAILED_TRAIT_SCALE[mareGrade] ?? DETAILED_TRAIT_SCALE['C'];
  const sVal = DETAILED_TRAIT_SCALE[studGrade] ?? DETAILED_TRAIT_SCALE['C'];
  const avg = Math.round((mVal + sVal) / 2);
  const roll = Math.random();
  let mutation = 0;
  if (roll < 0.1) mutation = -1;
  else if (roll >= 0.9) mutation = 1;
  const finalNumericalValue = Math.max(DETAILED_SCALE_MIN_VAL, Math.min(DETAILED_SCALE_MAX_VAL, avg + mutation));
  return REVERSE_DETAILED_TRAIT_SCALE[finalNumericalValue];
}

function getFoalOverallGrade(foalAllTraitsObject) {
  const scores = CORE_TRAITS.map(trait => DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]] ?? DETAILED_TRAIT_SCALE['C']);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const roundedAvg = Math.round(avgScore);
  return REVERSE_DETAILED_TRAIT_SCALE[roundedAvg] || 'C';
}

function calculateDirectionStars(mareDirection, studDirection) {
  const mStars = mareDirection?.stars ?? 1;
  const sStars = studDirection?.stars ?? 1;
  const mName = mareDirection?.name?.toLowerCase();
  const sName = studDirection?.name?.toLowerCase();
  let avgBase = (mStars + sStars) / 2;
  if (mName && sName && mName !== sName && ['left', 'right'].includes(mName) && ['left', 'right'].includes(sName)) {
    avgBase -= 0.5;
  }
  const delta = Math.floor(Math.random() * 3) - 1;
  return Math.max(0, Math.min(3, Math.round(avgBase + delta)));
}

function calculateSurfaceStars(mareSurface, studSurface) {
  const mStars = mareSurface?.stars ?? 1;
  const sStars = studSurface?.stars ?? 1;
  const mName = mareSurface?.name?.toLowerCase();
  const sName = studSurface?.name?.toLowerCase();
  let avgBase = (mStars + sStars) / 2;
  if (mName && sName) {
    if ((mName === 'dirt' && sName === 'firm') || (mName === 'firm' && sName === 'dirt') ||
        (mName === 'firm' && sName === 'soft') || (mName === 'soft' && sName === 'firm')) {
      avgBase -= 0.5;
    } else if ((mName === 'dirt' && sName === 'soft') || (mName === 'soft' && sName === 'dirt')) {
      avgBase -= 1.0;
    }
  }
  const delta = Math.floor(Math.random() * 3) - 1;
  return Math.max(0, Math.min(3, Math.round(avgBase + delta)));
}

function simulateBreeding(mare, stud, runs = 1000) {
  const results = [];
  const mareStats = mare.racing || {};
  const studStats = stud.racing || {};

  const preferenceFields = ['LeftTurning', 'RightTurning', 'Dirt', 'Turf', 'Firm', 'Soft'];
  const preferenceSums = Object.fromEntries(preferenceFields.map(k => [k, 0]));

  for (let i = 0; i < runs; i++) {
    const foal = {};

    for (const t of CORE_TRAITS) {
      const mareTrait = mareStats[t] ?? 'C';
      const studTrait = studStats[t] ?? 'C';
      foal[t] = blendTrait(mareTrait, studTrait);
    }

    foal.directionStars = calculateDirectionStars(mareStats.direction, studStats.direction);
    foal.surfaceStars = calculateSurfaceStars(mareStats.surface, studStats.surface);
    const foalOverallGrade = getFoalOverallGrade(foal);
    foal.grade = foalOverallGrade;
    foal.subgrade = calculateSubgrade(foalOverallGrade, foal);

    const mPrefs = mare.racing?.preference || {};
    const sPrefs = stud.racing?.preference || {};
    const pairs = [
      ['LeftTurning', 'RightTurning'],
      ['Dirt', 'Turf'],
      ['Firm', 'Soft']
    ];

    for (const [a, b] of pairs) {
      const mA = mPrefs[a]?.stars ?? 0;
      const sA = sPrefs[a]?.stars ?? 0;
      const mB = mPrefs[b]?.stars ?? 0;
      const sB = sPrefs[b]?.stars ?? 0;
      const avgA = (mA + sA) / 2;
      const avgB = (mB + sB) / 2;

      let chosen, val;
      if (avgA > avgB) {
        val = Math.max(0.5, Math.min(3, avgA - 0.05 + (Math.random() - 0.5) * 0.2));
        chosen = a;
      } else if (avgB > avgA) {
        val = Math.max(0.5, Math.min(3, avgB - 0.05 + (Math.random() - 0.5) * 0.2));
        chosen = b;
      } else {
        val = Math.max(0.5, Math.min(3, avgA + (Math.random() - 0.5) * 0.2));
        chosen = Math.random() < 0.5 ? a : b;
      }
      preferenceSums[chosen] += val;
    }

    results.push(foal);
  }

  const stats = {};
  for (const t of CORE_TRAITS) {
    const vals = results.map(r => DETAILED_TRAIT_SCALE[r[t]]).filter(v => v != null).sort((a, b) => a - b);
    if (!vals.length) continue;
    stats[t] = {
      min: REVERSE_DETAILED_TRAIT_SCALE[vals[0]],
      max: REVERSE_DETAILED_TRAIT_SCALE[vals[vals.length - 1]],
      median: REVERSE_DETAILED_TRAIT_SCALE[vals[Math.floor(vals.length / 2)]],
      p75: REVERSE_DETAILED_TRAIT_SCALE[vals[Math.floor(vals.length * 0.75)]],
      ssOrBetterChance: Math.round(vals.filter(v => v >= (DETAILED_TRAIT_SCALE['SS-'] ?? 20)).length / vals.length * 100)
    };
  }

  stats.directionStars = {
    min: Math.min(...results.map(r => r.directionStars)),
    max: Math.max(...results.map(r => r.directionStars)),
    avg: (results.reduce((sum, r) => sum + r.directionStars, 0) / results.length).toFixed(2)
  };

  stats.surfaceStars = {
    min: Math.min(...results.map(r => r.surfaceStars)),
    max: Math.max(...results.map(r => r.surfaceStars)),
    avg: (results.reduce((sum, r) => sum + r.surfaceStars, 0) / results.length).toFixed(2)
  };

  const subgrades = results.map(r => r.subgrade);
  stats.subgrade = {
    min: Math.min(...subgrades).toFixed(2),
    max: Math.max(...subgrades).toFixed(2),
    avg: (subgrades.reduce((a, b) => a + b, 0) / subgrades.length).toFixed(2)
  };

  const avgFoalGrade = results
    .map(r => DETAILED_TRAIT_SCALE[r.grade])
    .filter(v => v != null);
  stats.averageFoalGrade = avgFoalGrade.length
    ? REVERSE_DETAILED_TRAIT_SCALE[Math.round(avgFoalGrade.reduce((a, b) => a + b, 0) / avgFoalGrade.length)]
    : 'N/A';

  const weights = { start: 1.0, speed: 2.0, stamina: 1.5, heart: 1.5 };
  const totalScore = results.reduce((total, foal) => {
    return total + Object.entries(weights).reduce((s, [t, w]) => s + w * DETAILED_TRAIT_SCALE[foal[t]], 0);
  }, 0);
  const maxScore = Object.values(weights).reduce((sum, w) => sum + w * DETAILED_SCALE_MAX_VAL, 0);
  const scorePct = totalScore / (results.length * maxScore);

  stats.expectedPodium = Math.round(scorePct * 100);
  stats.expectedWin = Math.round((scorePct ** 2) * 100);
  stats.studScore = stud?.score ?? 'N/A';

  for (const k of preferenceFields) {
    stats[k] = parseFloat((preferenceSums[k] / runs).toFixed(2));
  }

  return stats;
}

module.exports = { simulateBreeding };
