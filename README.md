# 🐴 PFL Breeding Bot

## 📋 Overview
The PFL Breeding Bot is an automated pipeline to evaluate and rank optimal breeding pairs (Mares × Studs) for the Photo Finish Live game, with a focus on producing Kentucky Derby contenders.

## ⚙️ Pipeline Flow

The automated workflow runs in the following sequence:

1. **Fetch stud listings**: Pulls live stud data from PFL Pro API.
2. **Fetch mare data**: Loads local or API-based mare list.
3. **Inbreeding filter**: Removes pairs with overlapping ancestry.
4. **Direction & surface filter**: Ensures stud matches mare's racing preferences.
5. **KD winner / elite progeny match**: Tags pairs with KD winners or elite offspring.
6. **Ranking and export**: Scores and ranks top N matches per mare.
7. **Final D/S recheck**: Validates top matches again for direction/surface alignment.

Use `run_full_pipeline.sh` to execute the entire pipeline with logs.

## 🧠 Scoring Criteria (Step 6)
Each pair gets a score based on:
- 3 pts → KD winner
- 2 pts → Elite progeny
- 3 pts → SS- or better heart / stamina
- 2 pts → S+ or better speed
- 1 pt each → S+ temper/start

Top N (default 10) ranked matches per mare are saved to `top_stud_matches.json`.

## 🗃️ Key Tables

- `horses`: Full horse metadata including stats, history, ancestry
- `mares`: Subset of `horses` filtered as mares
- `inbreeding_clean`: Safe pairs with no shared lineage
- `direction_surface_clean`: Pairs aligned on track type
- `elite_matches`: Tagged pairs (KD winners / elite traits)
- `elite_matches_direction_surface_clean`: Final validated pairs

## 📊 Visual Viewer

Open `index.html` to view results:
- Each mare and their top matching studs
- Full stat breakdowns
- Red highlights for mismatches in condition/surface/direction
- Button to export to Excel

## 🔐 .env Config

Required environment variables:
```
DATABASE_URL=postgres://user:pass@host/db
PFL_API_KEY=your-api-key
```

## 💡 Customization

- You can input custom `mares.txt` or `kd_winners.txt` lists
- Each script is modular and can be run independently
