//utils/inbreedingService.js

/**
 * Checks if a given mare and stud pair is at risk of inbreeding.
 * Inbreeding is determined by checking for common ancestors in their simple family trees.
 *
 * @param {object} mareRawData The raw_data object for the mare, expected to have a simpleFamilyTree property (array of ancestor IDs).
 * @param {object} studRawData The raw_data object for the stud, expected to have a simpleFamilyTree property (array of ancestor IDs).
 * @returns {boolean} True if the pair is considered inbred (common ancestors found), false otherwise.
 *                    Returns true (considered inbred as a precaution) if lineage data is missing for either horse.
 */
function isPairInbred(mareRawData, studRawData) {
  const mareLineage = mareRawData?.simpleFamilyTree;
  const studLineage = studRawData?.simpleFamilyTree;
  //console.log('🧬 Inside isPairInbred:');
  //console.log(mareRawData);
  //console.log(studRawData);
  //console.log('Mare ID:', mareRawData?.id, 'Tree valid:', Array.isArray(studRawData?.simpleFamilyTree));
  //console.log('Stud ID:', studRawData?.id, 'Tree valid:', Array.isArray(studRawData?.simpleFamilyTree));


  // Precaution: If lineage data is missing or not an array for either, consider it potentially inbred.
  // This is a conservative approach. Alternatively, could return false or throw an error.
  if (!Array.isArray(mareLineage) || !Array.isArray(studLineage)) {
    console.warn(`Inbreeding Check: Missing or invalid simpleFamilyTree for mare ID ${mareRawData?.id} or stud ID ${studRawData?.id}. Assuming inbred as a precaution.`);
    return true; // Or handle as an error/false depending on desired behavior for missing data
  }

  if (mareLineage.length === 0 || studLineage.length === 0) {
    // If either tree is empty, they can't have common ancestors from the tree.
    return false;
  }

  const mareAncestorSet = new Set(mareLineage);

  for (const studAncestor of studLineage) {
    if (mareAncestorSet.has(studAncestor)) {
      console.log(`Inbreeding Alert: Common ancestor ${studAncestor} found for mare ${mareRawData?.id} and stud ${studRawData?.id}.`);
      return true; // Inbred
    }
  }

  return false; // Not inbred
}

module.exports = {
  isPairInbred,
};