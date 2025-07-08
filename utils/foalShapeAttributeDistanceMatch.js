/**
 * foalShapeAttributeDistanceMatch.js
 *
 * Given a foal simulation result object,
 * determine likely racing distances based on the shape → distance map.
 */

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

const shapeDistanceMap = {
  "start, speed, stamina": { "4": 29.3, "5": 20.5, "6": 20.9, "7": 16.7, "8": 7.1, "9": 3.8, "10": 0.8, "11": 0.8, "12": 0.0 },
  "start, speed": { "4": 28.1, "5": 25.7, "6": 23.4, "7": 13.4, "8": 5.5, "9": 2.5, "10": 0.4, "11": 0.8, "12": 0.4 },
  "start, temper": { "4": 27.7, "5": 25.5, "6": 18.7, "7": 8.5, "8": 2.1, "9": 1.7, "10": 0.9, "11": 2.1, "12": 2.1 },
  "start, heart": { "4": 27.3, "5": 23.0, "6": 19.0, "7": 7.7, "8": 3.8, "9": 1.9, "10": 0.8, "11": 0.8, "12": 0.8 },
  "start": { "4": 26.7, "5": 23.0, "6": 20.0, "7": 14.0, "8": 7.0, "9": 3.8, "10": 1.9, "11": 0.8, "12": 0.8 },
  "start, speed, finish": { "4": 21.3, "5": 20.3, "6": 20.8, "7": 15.8, "8": 13.4, "9": 3.5, "10": 4.0, "11": 3.5, "12": 0.5 },
  "speed": { "4": 15.8, "5": 16.3, "6": 17.8, "7": 17.2, "8": 8.1, "9": 5.1, "10": 3.8, "11": 3.0, "12": 3.0 },
  "speed, heart": { "4": 14.6, "5": 16.2, "6": 18.1, "7": 12.8, "8": 8.6, "9": 5.1, "10": 3.2, "11": 2.7, "12": 2.7 },
  "start, stamina": { "4": 13.9, "5": 13.6, "6": 18.7, "7": 17.0, "8": 16.0, "9": 10.0, "10": 5.1, "11": 3.9, "12": 1.7 },
  "speed, temper": { "4": 12.6, "5": 21.0, "6": 16.8, "7": 15.3, "8": 15.6, "9": 8.8, "10": 4.2, "11": 4.6, "12": 1.1 },
  "temper": { "4": 11.9, "5": 12.0, "6": 10.8, "7": 11.4, "8": 13.4, "9": 12.5, "10": 9.3, "11": 8.9, "12": 9.5 },
  "speed, stamina": { "4": 10.8, "5": 11.0, "6": 12.0, "7": 11.0, "8": 11.3, "9": 7.2, "10": 9.6, "11": 9.6, "12": 9.6 },
  "heart": { "4": 9.9, "5": 9.7, "6": 13.1, "7": 11.5, "8": 13.9, "9": 9.2, "10": 9.8, "11": 10.0, "12": 10.0 },
  "start, finish": { "4": 6.2, "5": 12.2, "6": 10.8, "7": 13.7, "8": 18.2, "9": 9.6, "10": 9.4, "11": 7.0, "12": 7.0 },
  "stamina, heart": { "4": 4.9, "5": 3.1, "6": 1.7, "7": 7.6, "8": 16.4, "9": 16.8, "10": 14.3, "11": 17.4, "12": 12.7 },
  "start, stamina, finish": { "4": 4.3, "5": 1.7, "6": 6.5, "7": 9.1, "8": 18.7, "9": 18.3, "10": 12.6, "11": 15.7, "12": 10.7 },
  "speed, finish": { "4": 4.3, "5": 8.0, "6": 8.7, "7": 12.3, "8": 13.3, "9": 10.5, "10": 13.5, "11": 11.2, "12": 9.4 },
  "speed, finish, heart": { "4": 4.3, "5": 5.3, "6": 14.2, "7": 13.3, "8": 16.4, "9": 14.2, "10": 4.2, "11": 9.6, "12": 10.7 },
  "stamina": { "4": 3.5, "5": 7.3, "6": 9.7, "7": 9.8, "8": 16.4, "9": 16.9, "10": 13.2, "11": 11.5, "12": 11.5 },
  "stamina, temper": { "4": 3.2, "5": 2.9, "6": 8.8, "7": 9.7, "8": 15.6, "9": 14.9, "10": 13.3, "11": 17.5, "12": 14.1 },
  "finish, temper": { "4": 1.8, "5": 1.8, "6": 2.9, "7": 5.8, "8": 10.4, "9": 12.2, "10": 15.5, "11": 25.5, "12": 24.1 },
  "finish, heart": { "4": 1.3, "5": 1.3, "6": 2.9, "7": 4.4, "8": 5.0, "9": 12.4, "10": 14.8, "11": 21.8, "12": 23.7 },
  "finish": { "4": 1.5, "5": 2.3, "6": 3.2, "7": 5.7, "8": 10.5, "9": 12.5, "10": 18.3, "11": 23.3, "12": 26.5 },
  "speed, stamina, finish": { "4": 1.4, "5": 3.6, "6": 5.9, "7": 9.0, "8": 18.6, "9": 15.8, "10": 19.9, "11": 20.4, "12": 20.4 },
  "stamina, finish": { "4": 0.8, "5": 1.1, "6": 2.0, "7": 4.7, "8": 15.6, "9": 16.1, "10": 25.7, "11": 26.5, "12": 26.6 },
  "stamina, finish, heart": { "4": 0.5, "5": 0.5, "6": 0.0, "7": 4.7, "8": 9.4, "9": 11.8, "10": 20.8, "11": 28.3, "12": 24.1 }
};

function getShapeDistanceProbabilities(foalResult) {
  const traitScores = [];

  for (const trait of ['start', 'speed', 'stamina', 'finish', 'heart', 'temper']) {
    if (!foalResult[trait]) continue;

    const median = foalResult[trait].median;
    const traitValue = median || '';
    const traitScore = DETAILED_TRAIT_SCALE[traitValue] ?? 0;

    traitScores.push({ trait, score: traitScore });
  }

  if (traitScores.length === 0) {
    console.log(`⚠️ No traits found in foalResult object.`);
    return {
      shapeString: '',
      distances: []
    };
  }

  traitScores.sort((a, b) => b.score - a.score);

  const shapeAttempts = [];

  for (let n = 3; n >= 1; n--) {
    if (traitScores.length < n) continue;

    const selectedTraits = traitScores.slice(0, n).map(t => t.trait).sort();
    const shapeString = selectedTraits.join(', ');
    shapeAttempts.push(shapeString);
  }

  for (const shapeString of shapeAttempts) {
    const shapeDistances = shapeDistanceMap[shapeString];
    if (shapeDistances) {
      const distancesSorted = Object.entries(shapeDistances)
        .map(([dist, prob]) => ({
          distance: parseInt(dist, 10),
          probability: prob
        }))
        .sort((a, b) => b.probability - a.probability);

      console.log(`✅ Matched foal shape to shape key: "${shapeString}"`);
      return {
        shapeString,
        distances: distancesSorted
      };
    }
  }

  console.log(`⚠️ No shape match found for foal shape: "${shapeAttempts[0] || ''}"`);
  return {
    shapeString: shapeAttempts[0] || '',
    distances: []
  };
}

module.exports = { getShapeDistanceProbabilities };