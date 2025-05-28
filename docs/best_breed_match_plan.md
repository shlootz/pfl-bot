# Plan: "Best Breed Match" Discord Command

**Project Goal:** Create a new Discord command `/bestbreedmatch` that takes a mare ID and a number `top_x_studs`. It identifies suitable studs for the mare, simulates 1000 breeding outcomes for each mare-stud pair, determines the single "best" foal from each set of simulations, and then presents the top overall best foal/stud pairings to the user.

## Phase 1: Command Definition & Setup

1.  **Define Slash Command:**
    *   In `discord/registerCommands.js`:
        *   Add a new `SlashCommandBuilder` for the command `/bestbreedmatch`.
        *   Define a required string option for `mare_id`.
        *   Define a required integer option for `top_x_studs` (e.g., "Number of top studs to simulate against").
2.  **Create Command Handler:**
    *   Create a new file: `discord/handlers/bestBreedMatch.js`.
    *   This handler will:
        *   Parse `mare_id` and `top_x_studs`.
        *   Call the main service function from `utils/bestMatchService.js`.
        *   Format and display the results in a Discord embed.

## Phase 2: Core Logic in `utils/bestMatchService.js`

This new file will contain the primary logic.

### A. Constants and Scales:

1.  **`DETAILED_TRAIT_SCALE`**: A 19-point scale mapping trait grades to numerical values.
    ```javascript
    // Example:
    const DETAILED_TRAIT_SCALE = {
      'D-': 0, 'D': 1, 'D+': 2,
      'C-': 3, 'C': 4, 'C+': 5,
      'B-': 6, 'B': 7, 'B+': 8,
      'A-': 9, 'A': 10, 'A+': 11,
      'S-': 12, 'S': 13, 'S+': 14,
      'SS-': 15, 'SS': 16, 'SS+': 17,
      'SSS-': 18, 'SSS': 19 // Assuming SSS is max, adjust if SSS+ exists
    };
    ```
2.  **`REVERSE_DETAILED_TRAIT_SCALE`**: Inverse of `DETAILED_TRAIT_SCALE`.
3.  **`CORE_TRAITS`**: `['start', 'speed', 'stamina', 'finish', 'heart', 'temper']`.
4.  **`TRAIT_WEIGHTS`** (for tie-breaking best foal):
    *   Heart: 0.3
    *   Speed: 0.25
    *   Stamina: 0.2
    *   Finish: 0.15
    *   Start: 0.05
    *   Temper: 0.05

### B. Helper Functions:

1.  **`getHorseDetails(horseId, dbClient)`**:
    *   Fetches horse `raw_data` by checking `horses` table, then `ancestors` table, then PFL API (`horse-api/{horseId}`).
    *   Caches API results into `ancestors` table.
    *   Returns the full `raw_data` object or `null`. (Adapted from `progenyService.js`).
2.  **`adaptBlendTrait(mareTraitGradeString, studTraitGradeString)`**:
    *   Inputs are trait grade strings (e.g., 'S+', 'A').
    *   Convert `mareTraitGradeString` and `studTraitGradeString` to numerical values using `DETAILED_TRAIT_SCALE`. Handle unknown/default grades gracefully (e.g., map 'C' or a mid-range value if a trait is missing/undefined).
    *   Calculate `avg = Math.round((mareNumericalValue + studNumericalValue) / 2)`.
    *   Apply weighted mutation: 10% chance for -1, 10% chance for +1 (on the numerical scale), 80% chance for 0 mutation. (Adjusted from user's 60% stable, 30% up, as 0.9 roll was for +1).
    *   `finalNumericalValue = Math.max(0, Math.min(Object.keys(DETAILED_TRAIT_SCALE).length - 1, avg + mutation))`.
    *   Return `REVERSE_DETAILED_TRAIT_SCALE[finalNumericalValue]`.
3.  **`adaptRollStars(mareStars, studStars)`**:
    *   Uses user-provided `rollStars` logic (defaulting input stars to 1 if undefined).
4.  **`getOverallFoalGrade(foalAllTraitsObject)`**:
    *   Takes an object like `{ heart: 'S', speed: 'A+', ... }`.
    *   Converts each of the 6 `CORE_TRAITS` to its numerical value using `DETAILED_TRAIT_SCALE`.
    *   Calculates the average of these 6 numerical scores.
    *   Rounds the average to the nearest whole number.
    *   Returns the corresponding grade string from `REVERSE_DETAILED_TRAIT_SCALE`. (This is the user-provided `getGrade` function).
5.  **`computeFoalSubgrade(foalOverallGradeString, foalAllTraitsObject)`**:
    *   `baseNumericalGrade = DETAILED_TRAIT_SCALE[foalOverallGradeString]`.
    *   Iterate `CORE_TRAITS`. For each trait:
        *   `traitNumericalValue = DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]]`.
        *   Sum `(traitNumericalValue - baseNumericalGrade)`.
    *   Return the sum.
6.  **`calculateWeightedTraitScore(foalAllTraitsObject)`**:
    *   Initialize `totalWeightedScore = 0`.
    *   For each `trait` in `TRAIT_WEIGHTS`:
        *   `numericalValue = DETAILED_TRAIT_SCALE[foalAllTraitsObject[trait]]`.
        *   `totalWeightedScore += numericalValue * TRAIT_WEIGHTS[trait]`.
    *   Return `totalWeightedScore`.

### C. `simulateSingleBestFoalOutOfN(mareFullDetails, studFullDetails, numRuns)` Function:

*   Extract `mareRacingTraits` and `studRacingTraits` from `mareFullDetails.raw_data` and `studFullDetails.raw_data`.
*   Initialize `bestSimulatedFoalData = null`, `bestFoalOverallGradeNumeric = -1`, `bestFoalWeightedScore = -Infinity`.
*   Loop `numRuns` (e.g., 1000) times:
    *   `currentSimulatedFoalTraits = {}`. For each `trait` in `CORE_TRAITS`:
        *   `currentSimulatedFoalTraits[trait] = adaptBlendTrait(mareRacingTraits[trait], studRacingTraits[trait])`.
    *   `currentFoalOverallGradeString = getOverallFoalGrade(currentSimulatedFoalTraits)`.
    *   `currentFoalOverallGradeNumeric = DETAILED_TRAIT_SCALE[currentFoalOverallGradeString]`.
    *   `currentFoalWeightedScore = calculateWeightedTraitScore(currentSimulatedFoalTraits)`.
    *   **Comparison Logic:**
        *   If `currentFoalOverallGradeNumeric > bestFoalOverallGradeNumeric`: Update `bestSimulatedFoalData` with current foal's traits, grade string, numeric grade, and weighted score.
        *   Else if `currentFoalOverallGradeNumeric === bestFoalOverallGradeNumeric` AND `currentFoalWeightedScore > bestFoalWeightedScore`: Update `bestSimulatedFoalData`.
*   Return `bestSimulatedFoalData` (which includes `{ traits, overallGradeString, weightedScore }`).

### D. `findBestBreedingPartners(mareId, topXStudsToConsider)` (Main Exported Function):

1.  Connect to DB.
2.  **Fetch Mare Details:**
    *   Attempt to query the `mares` table in the database for `mareId`.
    *   If the mare is found in the `mares` table:
        *   `mareFullDetails` = details from `mares` table (ensure this contains the `raw_data` structure).
    *   If the mare is NOT found in the `mares` table:
        *   Attempt to fetch `mareDataFromApi` from the PFL API (e.g., using a PFL API client, endpoint like `horse-api/{mareId}`).
        *   If the API call is successful and returns mare data:
            *   Store the fetched `mareDataFromApi` into the `mares` table (e.g., using a helper function similar to what might be in [`server/helpers/insertMareToDb.js`](server/helpers/insertMareToDb.js)). This ensures the mare is cached for future lookups.
            *   `mareFullDetails` = `mareDataFromApi` (ensure it's in the expected format, typically an object containing a `raw_data` property with the horse's details).
        *   If the API call fails or the mare is not found via API:
            *   Log an error: "Mare ID ${mareId} not found in local 'mares' DB and could not be fetched from PFL API."
            *   The `findBestBreedingPartners` function should then return an appropriate error indicator or empty results (e.g., `{ sortedResults: [], error: "Mare not found. Please check the Mare ID." }`). The command handler ([`discord/handlers/bestBreedMatch.js`](discord/handlers/bestBreedMatch.js:129)) will use this to inform the user.
    *   If `mareFullDetails` could not be obtained (neither from the local database nor the PFL API), the process for this command execution should stop here, and the user should be notified of the failure to find the mare.
3.  **Identify Candidate Studs:**
    *   Fetch all studs (`type='stud'`) from `horses` table.
    *   Filter these studs based on logic adapted from `scripts/scoreKDTargets.js`:
        *   Grade requirements (e.g., S or higher).
        *   Direction compatibility with mare (if mare has preference).
        *   Surface preference (e.g., Dirt, or make this configurable if needed).
        *   Inbreeding safety check against `inbreeding_clean` table.
        *   Stud listing status (`breedListingID` exists, `remainingStudCount > 0`).
        *   Performance metrics (e.g., `wins > 0`, `biggestPrize > threshold`).
        *   All 6 core traits are 'S' grade or higher on the 19-point scale.
    *   Score the filtered studs (e.g., using a simplified general quality score, or adapting the KD-specific score if relevant).
    *   Sort studs by this score and select the top `topXStudsToConsider`. Let `candidateStuds` be this list.
4.  `bestFoalsAcrossAllPairs = []`.
5.  `studsActuallyProcessed = 0`.
6.  For each `studInfo` in `candidateStuds`:
    *   `studFullDetails = await getHorseDetails(studInfo.id, dbClient)`. If not found, continue to next stud.
    *   `bestFoalDataForPair = await simulateSingleBestFoalOutOfN(mareFullDetails, studFullDetails, 1000)`.
    *   If `bestFoalDataForPair` exists:
        *   `studsActuallyProcessed++`.
        *   Calculate `subgrade = computeFoalSubgrade(bestFoalDataForPair.overallGradeString, bestFoalDataForPair.traits)`.
        *   Add `{ mare: mareFullDetails.raw_data, stud: studFullDetails.raw_data, bestFoal: { ...bestFoalDataForPair, subgrade } }` to `bestFoalsAcrossAllPairs`.
7.  Sort `bestFoalsAcrossAllPairs` by `bestFoal.overallGrade` (descending, using `DETAILED_TRAIT_SCALE` for numeric comparison of `overallGradeString`), then by `bestFoal.weightedScore` (descending).
8.  Disconnect DB.
9.  Return `{ sortedResults: bestFoalsAcrossAllPairs, mareName: mareFullDetails.raw_data.name, totalSimsRun: studsActuallyProcessed * 1000, studsProcessedCount: studsActuallyProcessed }`.

## Phase 3: Discord Output in `discord/handlers/bestBreedMatch.js`

1.  Call `findBestBreedingPartners(mareId, topXStuds)`.
2.  If `sortedResults` is empty or an error occurred, inform the user.
3.  Otherwise, create an embed:
    *   Title: `🏆 Best Breeding Matches for ${mareName}`.
    *   Description: `Simulated 1000 foals for each of the top ${studsProcessedCount} suitable studs. Total simulations: ${totalSimsRun}.`
    *   For each of the top N (e.g., 3-5) entries in `sortedResults`:
        *   Field Name: `Stud: ${result.stud.name} (ID: ${result.stud.id})`
        *   Field Value:
            *   `Best Foal Projected Grade: ${result.bestFoal.overallGradeString} (Subgrade: ${result.bestFoal.subgrade})`
            *   `Weighted Trait Score: ${result.bestFoal.weightedScore.toFixed(2)}`
            *   `Projected Traits:`
                *   `Heart: ${result.bestFoal.traits.heart}, Speed: ${result.bestFoal.traits.speed}, ... etc. for all 6 traits.`
    *   Consider adding buttons to view mare/stud on PFL.

## Diagram: High-Level Flow
```mermaid
graph TD
    A[User: /bestbreedmatch mare_id, top_x_studs] --> B{Discord Bot};
    B -- Interaction --> C[handlers/bestBreedMatch.js];
    C -- mareId, topXStuds --> D[utils/bestMatchService.js: findBestBreedingPartners];
    D -- Get Mare Details --> E[DB/API (getHorseDetails)];
    D -- Find Candidate Studs (adapt scoreKDTargets logic) --> F[DB: horses table];
    F -- Filtered & Scored Studs List --> D;
    subgraph ForEachMareStudPairLoop
        D -- mareDetails, studDetails, 1000 --> G[utils/bestMatchService.js: simulateSingleBestFoalOutOfN];
        subgraph Simulate1000FoalsLoop
            G -- mareTraits, studTraits --> H[adaptBlendTrait (x6 traits)];
            H -- foalTraits --> I[getOverallFoalGrade];
            H -- foalTraits --> J[calculateWeightedTraitScore];
            I -- overallGrade --> G;
            J -- weightedScore --> G;
            G -- Compare with best_for_pair --> G;
        end
        G -- Best Foal Data for this Pair --> D;
    end
    D -- Sorted List of Best Foals (one per pair) & Summary --> C;
    C -- Format Embed --> B;
    B -- Sends Embed --> A;
```

This plan is now very detailed and incorporates all the logic discussed.