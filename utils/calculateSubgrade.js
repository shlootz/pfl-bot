// utils/calculateSubgrade.js

const gradeRank = { 'S': -1, 'S+': 0, 'SS-': 1, 'SS': 2 };

function calculateSubgrade(baseGrade, traits) {
  if (!(baseGrade in gradeRank)) return null;

  let total = 0;
  const relevantTraits = ['heart', 'stamina', 'speed', 'start', 'finish', 'temper'];

  for (const trait of relevantTraits) {
    const value = traits?.[trait];
    if (value in gradeRank) {
      total += gradeRank[value] - gradeRank[baseGrade];
    }
  }

  return total;
}

module.exports = { calculateSubgrade };
