#!/bin/bash

LOG_FILE="logs/output_$(date +%Y%m%d_%H%M%S).log"
mkdir -p logs

echo "🐴 Running full PFL Bot pipeline..." | tee -a "$LOG_FILE"

run_step() {
  echo "" | tee -a "$LOG_FILE"
  echo "▶️ $1..." | tee -a "$LOG_FILE"
  if node "$2" >> "$LOG_FILE" 2>&1; then
    echo "✅ $1 completed." | tee -a "$LOG_FILE"
  else
    echo "❌ $1 failed. See log: $LOG_FILE" | tee -a "$LOG_FILE"
    exit 1
  fi
}

#run_step "Step 1: Fetching stud listings" scripts/fetchStuds.js
run_step "Step 2: Tag known progeny" scripts/tag_known_progeny.js
run_step "Step 3: Fetching mare data" scripts/fetchMaresFromAPI.js
run_step "Step 4: Filtering inbred pairs" scripts/filterInbreeding.js
run_step "Step 5: Filtering Direction and Surface" scripts/filterDirectionSurface.js
run_step "Step 6: Filtering elite KD-winning studs" scripts/filterEliteStuds.js
run_step "Step 7: Checking progeny of known KD winners" scripts/fetchProgenyFilter.js
run_step "Step 8: Re-Filtering Direction and Surface" scripts/reFilterDirectionSurface.js
run_step "Step 9: Score KD targets" scripts/scoreKDTargets.js
run_step "Step 10: Ranking and exporting top stud matches" scripts/rank_top_studs.js

echo "" | tee -a "$LOG_FILE"
echo "🎯 Pipeline complete. Open index.html to explore results." | tee -a "$LOG_FILE"
echo "📂 Full log saved to: $LOG_FILE"