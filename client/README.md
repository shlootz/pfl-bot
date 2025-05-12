# PFL Breeding Bot Dashboard

This project is a comprehensive full-stack tool for managing and visualizing breeding data for PhotoFinish™ horses.

---

## 📁 Project Structure

```
pfl-bot/
├── client/               # React + Tailwind frontend
│   ├── src/
│   │   ├── components/   # Shared UI components (Card, Skeleton, etc.)
│   │   ├── pages/        # Dashboard tabs: My Mares, All Studs, etc.
│   │   ├── App.jsx       # Router + layout
│   │   └── main.jsx      # React root
│   ├── index.html
│   └── tailwind.config.cjs
├── server/               # Express + PostgreSQL backend
│   └── index.js          # REST API endpoints
├── scripts/              # Node.js scripts (fetching, filtering, scoring)
│   └── *.js
├── data/                 # Static inputs (e.g., mare_ids.txt, winner_ids.txt)
├── logs/                 # Script logs
├── top_stud_matches.json# Final output for dashboard viewer
└── README.md             # (this file)
```

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 20+
- PostgreSQL with tables:
  - `horses`, `mares`, `elite_matches`, `inbreeding_clean`, etc.
- `.env` file with:
  ```
  DATABASE_URL=postgres://...
  PFL_API_KEY=your_api_key
  ```

---

## 🔧 Scripts

Run sequentially to fetch and filter horse data:

```bash
node scripts/fetchStuds.js
node scripts/fetchMaresFromAPI.js
node scripts/filterInbreeding.js
node scripts/filterDirectionSurface.js
node scripts/filterEliteStuds.js
node scripts/fetchProgenyFilter.js
node scripts/rank_top_studs.js
```

Each script logs progress to `logs/output_*.log`.

---

## 🧠 Dashboard UI

Run the server:

```bash
cd server
node index.js
```

Run the client:

```bash
cd client
npm run dev
```

Then open `http://localhost:5173`.

---

## 🧩 Tabs Available

- **My Mares** — all imported mares
- **All Studs** — all studs from marketplace
- **KD Winners** — horses that won the Kentucky Derby
- **KD Winners Progeny** — offspring of KD winners
- **Elite Studs** — top performers with elite traits
- **Breeding Pairs** — ranked mare-stud combinations

---

## 📝 Last updated

2025-05-12 10:40:52
