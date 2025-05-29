// /utils/getFleetFigureByAge.js

function updateFleetFigureByAgeMap(horse, ffMap = {}) {
  if (!horse || !horse.name) return;

  const name = horse.name;

  // Option A: Race-level FF by age (preferred)
  if (horse.birthSeason && Array.isArray(horse.history?.raceSummaries)) {
    for (const race of horse.history.raceSummaries) {
      const rating = race.fleetFigure?.rating;
      const season = race.season;
      if (!rating || typeof season !== 'number') continue;

      const age = season - horse.birthSeason;
      if (age < 0 || age > 20) continue;

      const ageKey = `${age}`;
      if (!ffMap[ageKey]) ffMap[ageKey] = {};
      if (!ffMap[ageKey][name]) ffMap[ageKey][name] = [];

      ffMap[ageKey][name].push(rating);
    }
  }

  // Option B: Fallback to averageFleetFigure at current age if no race-level data was added
  const hasData = Object.values(ffMap).some(entry => entry[name]?.length);
  if (!hasData && typeof horse.age === 'number' && typeof horse.history?.averageFleetFigure === 'number') {
    const ageKey = `${horse.age}`;
    if (!ffMap[ageKey]) ffMap[ageKey] = {};
    if (!ffMap[ageKey][name]) ffMap[ageKey][name] = [];

    ffMap[ageKey][name].push(horse.history.averageFleetFigure);
  }
}

function finalizeFleetFigureStats(ffMap = {}) {
  const statsByAge = {};

  for (const age in ffMap) {
    statsByAge[age] = {};
    for (const horse in ffMap[age]) {
      const ratings = ffMap[age][horse];
      ratings.sort((a, b) => a - b);

      const median = ratings[Math.floor(ratings.length / 2)];
      const min = Math.min(...ratings);
      const max = Math.max(...ratings);

      statsByAge[age][horse] = { min, median, max };
    }
  }

  return statsByAge;
}

module.exports = {
  updateFleetFigureByAgeMap,
  finalizeFleetFigureStats
};