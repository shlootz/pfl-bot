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
const REVERSE_DETAILED_TRAIT_SCALE = Object.fromEntries(
  Object.entries(DETAILED_TRAIT_SCALE).map(([k, v]) => [v, k])
);
const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

function blendTrait(mareGrade, studGrade) {
  const mVal = DETAILED_TRAIT_SCALE[mareGrade] ?? 4;
  const sVal = DETAILED_TRAIT_SCALE[studGrade] ?? 4;
  const avg = Math.round((mVal + sVal) / 2);
  const mutation = Math.random() < 0.1 ? -1 : Math.random() >= 0.9 ? 1 : 0;
  return REVERSE_DETAILED_TRAIT_SCALE[Math.max(0, Math.min(19, avg + mutation))];
}

function getFoalOverallGrade(foal) {
  const scores = CORE_TRAITS.map(t => DETAILED_TRAIT_SCALE[foal[t]] ?? 4);
  return REVERSE_DETAILED_TRAIT_SCALE[Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)] || 'C';
}

function simulateBreeding(mare, stud, runs = 1000) {
  const results = [];
  const preferenceSums = {
    LeftTurning: 0, RightTurning: 0,
    Dirt: 0, Turf: 0,
    Firm: 0, Soft: 0
  };

  const getParentPref = (horse, key) => {
    if (!horse?.racing) return null;
    if (key === 'LeftTurning' || key === 'RightTurning') {
      const dir = horse.racing.direction;
      return dir?.value === key ? dir.weight : 0;
    }
    if (key === 'Dirt' || key === 'Turf') {
      const surf = horse.racing.surface;
      return surf?.value === key ? surf.weight : 0;
    }
    if (key === 'Firm' || key === 'Soft') {
      const cond = horse.racing.condition;
      return cond?.value === key ? cond.weight : 0;
    }
    return 0;
  };

  console.log('🐎 Mare Prefs:', mare.racing);
  console.log('🐎 Stud Prefs:', stud.racing);

  for (let i = 0; i < runs; i++) {
    const foal = {};

    for (const trait of CORE_TRAITS) {
      const m = mare.racing?.[trait] ?? 'C';
      const s = stud.racing?.[trait] ?? 'C';
      foal[trait] = blendTrait(m, s);
    }

    foal.grade = getFoalOverallGrade(foal);
    foal.subgrade = calculateSubgrade(foal.grade, foal);
    results.push(foal);

    // Handle preference inheritance
    for (const pair of [['LeftTurning', 'RightTurning'], ['Dirt', 'Turf'], ['Firm', 'Soft']]) {
      const [a, b] = pair;
      const mareA = getParentPref(mare, a);
      const mareB = getParentPref(mare, b);
      const studA = getParentPref(stud, a);
      const studB = getParentPref(stud, b);
      const totalA = mareA + studA;
      const totalB = mareB + studB;

      if (totalA === 0 && totalB === 0) continue;

      let chosen, value;
      if (totalA === totalB) {
        chosen = Math.random() < 0.5 ? a : b;
        value = ((totalA + totalB) / 2) + (Math.random() - 0.5) * 0.2;
      } else {
        const diff = Math.abs(totalA - totalB);
        chosen = totalA > totalB ? a : b;
        value = Math.max(0.5, Math.min(3, Math.max(totalA, totalB) - 0.1 * diff + (Math.random() - 0.5) * 0.2));
      }
      preferenceSums[chosen] += parseFloat(value.toFixed(2));
    }
  }

  const stats = {};
  for (const trait of CORE_TRAITS) {
    const values = results.map(r => DETAILED_TRAIT_SCALE[r[trait]]).sort((a, b) => a - b);
    stats[trait] = {
      min: REVERSE_DETAILED_TRAIT_SCALE[values[0]],
      max: REVERSE_DETAILED_TRAIT_SCALE[values[values.length - 1]],
      median: REVERSE_DETAILED_TRAIT_SCALE[values[Math.floor(values.length / 2)]],
      p75: REVERSE_DETAILED_TRAIT_SCALE[values[Math.floor(values.length * 0.75)]],
      ssOrBetterChance: Math.round(values.filter(v => v >= 15).length / values.length * 100)
    };
  }

  const subgrades = results.map(r => r.subgrade);
  stats.subgrade = {
    min: Math.min(...subgrades).toFixed(2),
    max: Math.max(...subgrades).toFixed(2),
    avg: (subgrades.reduce((a, b) => a + b, 0) / subgrades.length).toFixed(2)
  };

  const numericGrades = results.map(r => DETAILED_TRAIT_SCALE[r.grade]);
  const avgNumeric = numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length;
  stats.averageFoalGrade = REVERSE_DETAILED_TRAIT_SCALE[Math.round(avgNumeric)] || 'C';

  const weights = { start: 1.0, speed: 2.0, stamina: 1.5, heart: 1.5 };
  const maxScore = Object.values(weights).reduce((s, w) => s + w * 19, 0);
  const scores = results.map(r =>
    Object.entries(weights).reduce((sum, [t, w]) => sum + w * DETAILED_TRAIT_SCALE[r[t]], 0)
  );
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const pct = avgScore / maxScore;
  stats.expectedPodium = Math.round(pct * 100);
  stats.expectedWin = Math.round((pct ** 2) * 100);
  stats.studScore = stud.score ?? 'N/A';

  for (const k in preferenceSums) {
    stats[k] = parseFloat((preferenceSums[k] / runs).toFixed(2));
  }

  return stats;
}

module.exports = { simulateBreeding };