# 🐎 PFL Breeding Bot

This pipeline processes stud and mare data from the PFL Pro API to identify optimal, inbreeding-safe, and elite-quality breeding pairs. Results include ranked matches with exportable data.

---

## 📌 Prerequisites

* Node.js
* PostgreSQL (with tables: `horses`, `mares`, `safe_pairs`, `elite_matches`)
* `.env` file with DB connection string and API key
* `mares.txt` – list of Mare IDs (comma- or newline-separated)
* `kd_winners.txt` – optional list of known KD winners (UUIDs or hashes)

---

## 🔁 Full Pipeline Sequence

### 1. Fetch Stud Listings

```bash
node scripts/fetchStuds.js
```

Fetches all listed studs using pagination and stores them in the `horses` table.

### 2. Fetch Mare Data

```bash
node scripts/fetchMaresFromAPI.js
```

Loads detailed info for mares listed in `mares.txt` and saves them to the `mares` table.

### 3. Inbreeding Check

```bash
node scripts/filterInbreeding.js
```

Cross-checks all mare-stud pairings and filters out inbred combinations. Stores results in `safe_pairs`.

### 4. Filter Elite Direct KD Winner Studs

```bash
node scripts/filterEliteStuds.js
```

From `safe_pairs`, identifies non-inbred pairings where the stud is a **direct Kentucky Derby winner** and meets trait filters.

### 5. Filter Elite Progeny of KD Winners

```bash
node scripts/fetchProgenyFilter.js
```

Pulls each stud’s sire lineage and checks if it descends from a known KD winner (`kd_winners.txt`). Filters for elite traits (SS- Heart/Stamina, etc.) and appends to `elite_matches`.

### 6. Rank and Export Top Matches

```bash
node scripts/rank_top_studs.js
```

Ranks top stud matches for each mare. Exports structured data to:

* `top_stud_matches.json` (for the viewer)
* `index.html` (open in browser to explore)
* Optional CSV download inside the viewer

---

## 📁 Output Files

* `top_stud_matches.json` — Ranked structured data per mare
* `top_stud_matches.csv` — Excel-compatible output (download from browser)
* `index.html` — Viewer interface

---

## 🧪 Next Steps (Ideas)

* Add UI filters (by score, reason, etc.)
* Add PFL login/token support for private listings
* Extend to simulate foal outcome prediction

---

For support or contributions, contact @alexandrupopescu
