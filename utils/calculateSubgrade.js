// utils/calculateSubgrade.js

// Defines the numerical rank for each grade, covering the full scale.
const gradeRank = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
  // Add SSS+ if it becomes a grade, e.g., 'SSS+': 20
};

const CORE_TRAITS = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

/**
 * Calculates the subgrade of a foal based on its overall grade and individual core traits.
 * The subgrade is the sum of differences between each core trait's numerical rank and the base grade's numerical rank.
 *
 * @param {string} baseGrade The overall grade of the foal (e.g., 'A+', 'S').
 * @param {object} traits An object containing the foal's core traits and their grades (e.g., { heart: 'S', speed: 'A', ... }).
 * @returns {number|null} The calculated subgrade, or null if the baseGrade is not recognized.
 */
function calculateSubgrade(baseGrade, traits) {
  if (!(baseGrade in gradeRank)) {
    console.warn(`calculateSubgrade: Unrecognized baseGrade "${baseGrade}". Returning null.`);
    return null;
  }

  let totalSubgradePoints = 0;
  const baseGradeNumeric = gradeRank[baseGrade];

  for (const traitName of CORE_TRAITS) {
    const traitGrade = traits?.[traitName];
    if (traitGrade && traitGrade in gradeRank) {
      totalSubgradePoints += gradeRank[traitGrade] - baseGradeNumeric;
    } else {
      // Optional: Log if a core trait is missing or has an unrecognized grade.
      // console.warn(`calculateSubgrade: Trait "${traitName}" grade "${traitGrade}" not found in gradeRank or trait missing for baseGrade ${baseGrade}. Skipping.`);
    }
  }

  return totalSubgradePoints;
}

module.exports = {
  calculateSubgrade,
  // Optionally export gradeRank and CORE_TRAITS if they might be useful elsewhere,
  // but for now, they are kept internal to this module's primary function.
};
