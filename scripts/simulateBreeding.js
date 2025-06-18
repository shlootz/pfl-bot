//scripts/simulateBreeding.js

const { calculateSubgrade } = require('../utils/calculateSubgrade');
const { isPairInbred } = require('../utils/inbreedingService');

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

const traitMutationProfile = {
  start:   { plus3: 0.002, plus2: 0.015, plus1: 0.08, minus1: 0.03, minus2: 0.01 },
  speed:   { plus3: 0.001, plus2: 0.01,  plus1: 0.07, minus1: 0.03, minus2: 0.005 },
  stamina: { plus3: 0.005, plus2: 0.02,  plus1: 0.10, minus1: 0.05, minus2: 0.01 },
  finish:  { plus3: 0.001, plus2: 0.01,  plus1: 0.07, minus1: 0.03, minus2: 0.005 },
  heart:   { plus3: 0.004, plus2: 0.02,  plus1: 0.10, minus1: 0.04, minus2: 0.01 },
  temper:  { plus3: 0.0005, plus2: 0.005, plus1: 0.03, minus1: 0.02, minus2: 0.005 }
};

function blendTrait(mareGrade, studGrade, trait) {
  const mVal = DETAILED_TRAIT_SCALE[mareGrade] ?? 4;
  const sVal = DETAILED_TRAIT_SCALE[studGrade] ?? 4;

  // Randomly inherit one allele from each parent
  const allele1 = Math.random() < 0.5 ? mVal : sVal;
  const allele2 = Math.random() < 0.5 ? mVal : sVal;

  // Base trait value from average + small Gaussian-style noise
  const avg = (allele1 + allele2) / 2;
  const noise = (Math.random() - 0.5) * 0; // gives approx ±0.75 swing
  let base = Math.round(avg + noise);

  // Trait-specific mutation chance
  const profile = traitMutationProfile[trait];
  if (!profile) {
    console.warn(`⚠️ Unknown trait passed to blendTrait: ${trait}`);
    return REVERSE_DETAILED_TRAIT_SCALE[Math.max(0, Math.min(19, base))];
  }

  const roll = Math.random();
  let mutation = 0;
  const thresholds = [
    profile.plus3 ?? 0,
    profile.plus2 ?? 0,
    profile.plus1 ?? 0,
    profile.minus1 ?? 0,
    profile.minus2 ?? 0,
  ];

  // Upward mutation
  if (roll < thresholds[0]) mutation = +2;
  else if (roll < thresholds[0] + thresholds[1]) mutation = +2;
  else if (roll < thresholds[0] + thresholds[1] + thresholds[2]) mutation = +1;
  // Downward mutation
  else if (roll > 1 - thresholds[3]) mutation = -1;
  else if (roll > 1 - thresholds[3] - thresholds[4]) mutation = -2;

  const final = Math.max(0, Math.min(19, base + mutation));
  return REVERSE_DETAILED_TRAIT_SCALE[final];
}

function quantileInterpolated(arr, q) {
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
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
    const r = horse?.racing;
    if (!r) return 0;
    if (['LeftTurning', 'RightTurning'].includes(key)) {
      return r.direction?.value === key ? r.direction.weight : 0;
    }
    if (['Dirt', 'Turf'].includes(key)) {
      return r.surface?.value === key ? r.surface.weight : 0;
    }
    if (['Firm', 'Soft'].includes(key)) {
      return r.condition?.value === key ? r.condition.weight : 0;
    }
    return 0;
  };

  for (let i = 0; i < runs; i++) {
    const foal = {};
    for (const trait of CORE_TRAITS) {
      const m = mare.racing?.[trait] ?? 'C';
      const s = stud.racing?.[trait] ?? 'C';
      foal[trait] = blendTrait(m, s, trait);
    }
    foal.grade = getFoalOverallGrade(foal);
    foal.subgrade = calculateSubgrade(foal.grade, foal);
    results.push(foal);

    for (const pair of [['LeftTurning', 'RightTurning'], ['Dirt', 'Turf'], ['Firm', 'Soft']]) {
      const [a, b] = pair;
      const totalA = getParentPref(mare, a) + getParentPref(stud, a);
      const totalB = getParentPref(mare, b) + getParentPref(stud, b);
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

    const min = values[0];
    const p10 = Math.round(quantileInterpolated(values, 0.10));
    const median = Math.round(quantileInterpolated(values, 0.50));
    const p90 = Math.round(quantileInterpolated(values, 0.90));
    const max = values[values.length - 1];
    const p25 = values[Math.floor(values.length * 0.25)];
    const p75 = values[Math.floor(values.length * 0.75)];

    stats[trait] = {
      min: REVERSE_DETAILED_TRAIT_SCALE[values[0]],
      p10: REVERSE_DETAILED_TRAIT_SCALE[p10],
      p25: REVERSE_DETAILED_TRAIT_SCALE[p25],
      median: REVERSE_DETAILED_TRAIT_SCALE[values[Math.floor(values.length * 0.5)]],
      p75: REVERSE_DETAILED_TRAIT_SCALE[p75],
      p90: REVERSE_DETAILED_TRAIT_SCALE[p90],
      max: REVERSE_DETAILED_TRAIT_SCALE[values[values.length - 1]],
      ssOrBetterChance: Math.round(values.filter(v => v >= 15).length / values.length * 100)
    };

    console.log(`🧬 ${trait.toUpperCase()} → Min: ${stats[trait].min}, P10: ${stats[trait].p10}, Median: ${stats[trait].median}, P90: ${stats[trait].p90}, Max: ${stats[trait].max}, SS%: ${stats[trait].ssOrBetterChance}`);
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

  // 🔴 Inbreeding Check
  stats.inbred = isPairInbred(mare.raw_data, stud.raw_data);

  return stats;
}

module.exports = { simulateBreeding };