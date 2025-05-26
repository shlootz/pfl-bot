const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'S', 'S+', 'SS-', 'SS'];
const gradeValue = Object.fromEntries(gradeOrder.map((g, i) => [g, i]));
const valueGrade = Object.fromEntries(gradeOrder.map((g, i) => [i, g]));

const TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

function blendTrait(mareGrade, studGrade) {
  const mVal = gradeValue[mareGrade] ?? null;
  const sVal = gradeValue[studGrade] ?? null;
  if (mVal === null || sVal === null) return null;

  const avg = Math.round((mVal + sVal) / 2);
  const mutation = Math.floor(Math.random() * 3) - 1;
  const final = Math.max(0, Math.min(gradeOrder.length - 1, avg + mutation));
  return valueGrade[final];
}

function rollStars(mareStars = 1, studStars = 1) {
  const avg = (mareStars + studStars) / 2;
  const delta = Math.floor(Math.random() * 3) - 1; // -1 to +1
  return Math.max(0, Math.min(3, Math.round(avg + delta)));
}

function computeSubgrade(baseGrade, traitGrades) {
  if (!(baseGrade in gradeValue)) return 0;

  const base = gradeValue[baseGrade];
  return TRAITS.reduce((sum, t) => {
    const g = gradeValue[traitGrades[t]];
    return sum + (g != null ? g - base : 0);
  }, 0);
}

function simulateBreeding(mare, stud, runs = 1000) {
  const results = [];

  const mareStats = mare.racing || {};
  const studStats = stud.racing || {};

  for (let i = 0; i < runs; i++) {
    const foal = {};

   for (const t of TRAITS) {
      const mareTrait = mareStats[t] ?? 'C';
      const studTrait = studStats[t] ?? 'C';
      foal[t] = blendTrait(mareTrait, studTrait);
  }

    const getStars = (value) => typeof value === 'number' ? value : 1;

    foal.directionStars = rollStars(getStars(mareStats.direction?.stars), getStars(studStats.direction?.stars));
    foal.surfaceStars = rollStars(getStars(mareStats.surface?.stars), getStars(studStats.surface?.stars));

    foal.subgrade = computeSubgrade(mareStats.grade || 'S', foal); // or use average grade

    results.push(foal);
  }

  // Analyze ranges
  const stats = {};
  for (const t of TRAITS) {
    const vals = results.map(r => gradeValue[r[t]]).filter(v => v != null).sort((a, b) => a - b);
    if (!vals.length) continue;

    stats[t] = {
      min: valueGrade[vals[0]],
      max: valueGrade[vals[vals.length - 1]],
      median: valueGrade[vals[Math.floor(vals.length / 2)]],
      p75: valueGrade[vals[Math.floor(vals.length * 0.75)]],
      ssOrBetterChance: Math.round(vals.filter(v => v >= gradeValue['SS-']).length / vals.length * 100)
    };
  }

  // Direction / Surface
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
    min: Math.min(...subgrades),
    max: Math.max(...subgrades),
    avg: (subgrades.reduce((a, b) => a + b, 0) / subgrades.length).toFixed(2)
  };

  return stats;
}

module.exports = { simulateBreeding };