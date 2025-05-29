// utils/getFleetFigureByAge.js

/**
 * Accepts a single horse object and updates the given aggregation map
 * (age -> [fleet figures]) with the horse's averageFleetFigure.
 *
 * This allows you to progressively build an FF distribution by age.
 */
function updateFleetFigureByAgeMap(horse, map) {
  const age = horse.age;
  const ff = horse.history?.averageFleetFigure;
  if (typeof age !== 'number' || typeof ff !== 'number') return;

  if (!map[age]) map[age] = [];
  map[age].push(ff);
}

/**
 * Converts a map of age -> [fleet figures] into a summary object
 * with min, median, and max for each age group.
 */
function finalizeFleetFigureStats(map) {
  const result = {};

  for (const age of Object.keys(map)) {
    const figures = map[age].sort((a, b) => a - b);
    const min = figures[0];
    const max = figures[figures.length - 1];
    const median = figures.length % 2 === 0
      ? (figures[figures.length / 2 - 1] + figures[figures.length / 2]) / 2
      : figures[Math.floor(figures.length / 2)];

    result[age] = { min, median, max };
  }

  return result;
}

module.exports = {
  updateFleetFigureByAgeMap,
  finalizeFleetFigureStats
};
