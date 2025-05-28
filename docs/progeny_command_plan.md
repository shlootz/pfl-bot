# Plan: New Discord Command for Horse Progeny

**Project Goal:** Create a new Discord command that, given a horse ID, lists all its progeny (multi-generational) ordered by their podium wins, indicating their generation level.

## Phase 1: Command Definition & Handling

1.  **Define the Slash Command:**
    *   In `discord/registerCommands.js`:
        *   Add a new `SlashCommandBuilder` for the command (e.g., `/progeny`).
        *   Define a required option for `horse_id` (string).
        *   Optionally, add an option for `max_generations` (integer, default to 3).

2.  **Create Command Handler:**
    *   Create a new file: `discord/handlers/progeny.js`.
    *   This handler will:
        *   Receive the interaction and extract `horse_id` and `max_generations`.
        *   Call a new service/utility function (from `utils/progenyService.js`) to fetch and process progeny data.
        *   Format the results using `EmbedBuilder` for Discord. Each progeny should list:
            *   Name, Link to PFL page (e.g., `https://photofinish.live/horses/{ID}`).
            *   Podium Finishes (calculated as `wins + places + shows`).
            *   Total Wins.
            *   Generation Level (e.g., "Direct Progeny", "2nd Gen Progeny").
        *   Implement `interaction.deferReply()` and `interaction.followUp()`.

## Phase 2: Progeny Data Retrieval and Processing Logic

This logic will reside in a new utility module: `utils/progenyService.js`.

1.  **`getProgenyRecursive(horseId, currentGeneration, maxGenerations, apiKey, dbClient, allProgenyList, visitedHorseIds)` function:**
    *   **Inputs:**
        *   `horseId`: The ID of the horse whose progeny to find.
        *   `currentGeneration`: The current depth of recursion (starts at 1).
        *   `maxGenerations`: Maximum depth to search.
        *   `apiKey`: PFL API Key.
        *   `dbClient`: Connected PostgreSQL client instance.
        *   `allProgenyList`: (passed by reference) An array to accumulate found progeny objects.
        *   `visitedHorseIds`: (passed by reference) A `Set` to track processed horse IDs.
    *   **Progeny Object Structure:** `{ id, name, podium_finishes, total_wins, generation, pfl_url, sireId, damId, gender, ...other_relevant_stats }`.
    *   **Steps:**
        1.  **Base Case:** If `currentGeneration > maxGenerations`, return.
        2.  **Avoid Cycles:** If `horseId` is in `visitedHorseIds`, return. Add `horseId` to `visitedHorseIds`.
        3.  **Fetch Direct Children from PFL API:**
            *   Use the "Get Horse Offspring" PFL API endpoint: `https://api.photofinish.live/pfl-pro/v2/horses/{horse_id}/offspring`.
            *   Adapt `fetchHorseProfileWithRetry` logic from `scripts/fetchProgenyFilter.js` for this, including backoff.
            *   For each offspring ID from the API:
                *   Fetch full horse details for the offspring using `https://api.photofinish.live/pfl-pro/horse-api/{offspring_id}` (reusing `fetchHorseProfileWithRetry`).
                *   If horse details are successfully fetched:
                    *   Extract `id`, `name`, `sireId`, `damId`, `gender`.
                    *   Calculate `podium_finishes` from `horseData.history.raceStats.allTime.all.wins + horseData.history.raceStats.allTime.all.places + horseData.history.raceStats.allTime.all.shows`.
                    *   Get `total_wins` from `horseData.history.raceStats.allTime.all.wins`.
                    *   Add to `allProgenyList` with `generation: currentGeneration`.
                    *   Cache/update this horse's data in the local `ancestors` table (using its `raw_data`).
                    *   Recursively call `getProgenyRecursive(offspring.id, currentGeneration + 1, maxGenerations, apiKey, dbClient, allProgenyList, visitedHorseIds)`.
        4.  **Fetch Direct Children from Local DB (as a fallback or supplement):**
            *   Query the `ancestors` table (and potentially `mares`, `studs`) for horses where `raw_data->>'sireId' = horseId` OR `raw_data->>'damId' = horseId`.
                *   *Note:* The PFL API is the primary source for offspring. The DB lookup helps find progeny already known/cached and can speed up subsequent calls for deeper generations if their parents were already processed.
            *   For each child found in the DB not already processed via API in this exact call path:
                *   Ensure it's not already in `allProgenyList` for the *same parent* at the *same generation* to avoid duplicates if API also returned it.
                *   Extract details from `raw_data` similar to API processing.
                *   Add to `allProgenyList`.
                *   Recursively call `getProgenyRecursive(child.id, currentGeneration + 1, ...)`.

2.  **Main Orchestration Function `fetchProgenyReport(initialHorseId, maxGenerations)`:**
    *   Initialize PostgreSQL client.
    *   Initialize `allProgenyList = []` and `visitedHorseIds = new Set()`.
    *   Fetch the initial horse's gender from DB/API to determine if it's a sire or dam, which might be useful for context but the PFL offspring endpoint should work regardless.
    *   Call `getProgenyRecursive(initialHorseId, 1, maxGenerations, API_KEY, client, allProgenyList, visitedHorseIds)`.
    *   **Sort Results:** Sort `allProgenyList` by `podium_finishes` (descending), then by `total_wins` (descending) as a secondary sort.
    *   Close DB connection.
    *   Return the sorted list.

## Phase 3: Database Schema Considerations & Data Paths

*   **Primary Data Source:** The `raw_data` JSONB field in tables like `ancestors`, `mares`, `studs`.
*   **Key Data Paths in `raw_data` (based on provided sample):**
    *   `id`: Top-level
    *   `name`: Top-level
    *   `damId`: Top-level
    *   `sireId`: Top-level
    *   `gender`: Top-level (0 for Male/Stud, 1 for Female/Mare - needs confirmation if this is standard)
    *   `history.raceStats.allTime.all.wins`: Number of wins.
    *   `history.raceStats.allTime.all.places`: Number of 2nd place finishes.
    *   `history.raceStats.allTime.all.shows`: Number of 3rd place finishes.
    *   **Podium Finishes Calculation:** `wins + places + shows`.
*   **Caching:**
    *   Fetched horse data from PFL API should be cached/updated in the local `ancestors` table to minimize API calls.
*   **Configuration:**
    *   `PFL_API_KEY`, `DELAY_MS`, `MAX_RETRIES` from `.env`.

## Diagram: High-Level Flow

```mermaid
graph TD
    A[Discord User: /progeny horse_id=X] --> B{Discord Bot};
    B -- Interaction --> C[discord/handlers/progeny.js];
    C -- horseId, maxGen --> D[utils/progenyService.js: fetchProgenyReport];
    D -- initialHorseId, maxGen, dbClient --> E[getProgenyRecursive];
    subgraph RecursiveProgenyFetch
        E -- horseId --> G[PFL API: /horses/{id}/offspring];
        G -- API Results (Offspring IDs) --> E;
        E -- For each offspringId --> H[PFL API: /horse-api/{id} (fetch details)];
        H -- Horse Details (raw_data) --> E;
        E -- Cache new horse data --> F[Local PostgreSQL DB (ancestors)];
        E -- For each child --> E;
    end
    E -- Accumulate Progeny List --> D;
    D -- Sorted Progeny List --> C;
    C -- Format Embed --> B;
    B -- Sends Embed --> A;
```

## Key Files to Create/Modify:

*   **Modify:** `discord/registerCommands.js` (add new slash command)
*   **Create:** `discord/handlers/progeny.js` (handle interaction, call service, format response)
*   **Create:** `utils/progenyService.js` (core logic: `fetchProgenyReport`, `getProgenyRecursive`)
*   **Create:** `docs/progeny_command_plan.md` (this file)

## Pre-computation/Pre-analysis (Completed):

*   Confirmed JSON paths for `sireId`, `damId`, gender, and performance statistics from the provided `raw_data` sample.
*   Primary strategy will be PFL API for offspring, supplemented by DB cache.