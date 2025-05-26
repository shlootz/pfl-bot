// scripts/simulateBreeding.js

const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'S', 'S+', 'SS-', 'SS'];
const gradeValue = Object.fromEntries(gradeOrder.map((g, i) => [g, i]));
const valueGrade = Object.fromEntries(gradeOrder.map((g, i) => [i, g]));

const TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

/**
 * Blends two parent traits with mutation
 */
function blendTrait(mareGrade, studGrade) {
  const mVal = gradeValue[mareGrade] ?? null;
  const sVal = gradeValue[studGrade] ?? null;
  if (mVal === null || sVal === null) return null;

  const avg = Math.round((mVal + sVal) / 2);
  const mutation = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  const final = Math.max(0, Math.min(gradeOrder.length - 1, avg + mutation));

  return valueGrade[final];
}

/**
 * Simulates N foals and returns trait range stats
 */
function simulateBreeding(mare, stud, runs = 1000) {
  const results = [];

  for (let i = 0; i < runs; i++) {
    const foal = {};
    for (const trait of TRAITS) {
      const mareTrait = mare?.racing?.[trait];
      const studTrait = stud?.racing?.[trait];
      const childTrait = blendTrait(mareTrait, studTrait);
      foal[trait] = childTrait;
    }
    results.push(foal);
  }

  // Aggregate trait stats
  const summary = {};
  for (const trait of TRAITS) {
    const grades = results.map(r => r[trait]).filter(Boolean);
    const numeric = grades.map(g => gradeValue[g]).sort((a, b) => a - b);

    if (numeric.length === 0) continue;

    summary[trait] = {
      min: valueGrade[numeric[0]],
      max: valueGrade[numeric[numeric.length - 1]],
      median: valueGrade[numeric[Math.floor(numeric.length / 2)]],
      p75: valueGrade[numeric[Math.floor(numeric.length * 0.75)]],
      ssOrBetterChance: Math.round(
        (numeric.filter(n => n >= gradeValue['SS-']).length / numeric.length) * 100
      )
    };
  }

  return summary;
}

module.exports = { simulateBreeding };