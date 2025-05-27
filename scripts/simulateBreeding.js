const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'S', 'S+', 'SS-', 'SS'];
const gradeValue = Object.fromEntries(gradeOrder.map((g, i) => [g, i]));
const valueGrade = Object.fromEntries(gradeOrder.map((g, i) => [i, g]));

const TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

function blendTrait(mareGrade, studGrade) {
  const mVal = gradeValue[mareGrade] ?? gradeValue['C'];
  const sVal = gradeValue[studGrade] ?? gradeValue['C'];

  const avg = Math.round((mVal + sVal) / 2);

  // Weighted mutation: 10% down, 60% stable, 30% up
  const roll = Math.random();
  let mutation = 0;
  if (roll < 0.1) mutation = -1;
  else if (roll > 0.9) mutation = 1;

  const final = Math.max(0, Math.min(gradeOrder.length - 1, avg + mutation));
  return valueGrade[final];
}

function rollStars(mareStars = 1, studStars = 1) {
  const avg = (mareStars + studStars) / 2;
  const delta = Math.floor(Math.random() * 3) - 1;
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

    const getStars = (val) => typeof val === 'number' ? val : 1;

    foal.directionStars = rollStars(getStars(mareStats.direction?.stars), getStars(studStats.direction?.stars));
    foal.surfaceStars = rollStars(getStars(mareStats.surface?.stars), getStars(studStats.surface?.stars));

    foal.subgrade = computeSubgrade(mareStats.grade || 'S', foal);
    results.push(foal);
  }

  // Analyze trait distributions
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

  // 🎯 Predict foal grade from average median trait value
  const medianVals = TRAITS.map(t => gradeValue[stats[t]?.median ?? 'C']);
  const medianAvg = medianVals.reduce((a, b) => a + b, 0) / medianVals.length;
  stats.grade = valueGrade[Math.round(medianAvg)];

  // 🧮 Propagate score if available
  stats.score = stud?.score ?? 'N/A';

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
      const g = foal[trait];
      if (g in gradeValue) {
        score += weights[trait] * gradeValue[g];
      }
    }
    totalScore += score;
  }

  const maxScore = Object.entries(weights).reduce((sum, [_, w]) => sum + w * 8, 0); // SS = 8
  const avgScore = totalScore / results.length;
  const scorePct = avgScore / maxScore;

  stats.expectedPodium = Math.round(scorePct * 100);             // Linear mapping
  stats.expectedWin = Math.round((scorePct ** 2) * 100);         // Quadratic decay

  return stats;
}

module.exports = { simulateBreeding };