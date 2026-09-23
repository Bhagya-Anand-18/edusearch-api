# EduSearch API

**Indian Education Data API** — JEE/NEET cutoffs, NIRF rankings, college data, placements, and admission predictions.

> **Data status.** JEE Advanced and JEE Main cutoffs are **official JoSAA figures** (2022-2025) and NIRF rankings are **official** (2023-2025). NEET cutoffs, placement figures and exam statistics are still **synthetic sample data**. Every record carries a `source` field (`josaa`, `nirf` or `synthetic`), and `GET /api/v1/stats` reports the breakdown per dataset. Don't use the synthetic records for admission decisions.

[![RapidAPI](https://img.shields.io/badge/RapidAPI-EduSearch-blue)](https://rapidapi.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🚀 What is this?

EduSearch API provides structured, queryable access to Indian education data that's currently scattered across PDFs, government portals, and counseling websites. Every EdTech app in India needs this data — we make it accessible via a clean REST API.

## 📊 Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/cutoffs` | JEE Main/Advanced & NEET cutoffs with filters |
| `GET /api/v1/colleges` | Search and filter 141 institutes — every IIT, NIT, IIIT and GFTI in JoSAA |
| `GET /api/v1/colleges/:id` | Detailed college info with programs & placements |
| `GET /api/v1/rankings/nirf` | NIRF rankings by year and category |
| `GET /api/v1/exams/:exam/stats` | Exam statistics (registered, qualified, scores) |
| `GET /api/v1/predict` | **⭐ College admission predictor** — input rank, get colleges |
| `GET /api/v1/search` | Search across all data |
| `GET /api/v1/compare` | Side-by-side college comparison |
| `GET /api/v1/stats` | Dataset coverage counts |

Every endpoint is documented with its parameters and response shape in `openapi.json`, which is what the RapidAPI listing is built from. Browse the same docs interactively at `/docs`.

## 📨 Response Format

Successful list responses are paginated and wrapped in an envelope:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "total": 8128, "limit": 50, "offset": 0, "has_more": true }
}
```

Errors use the same envelope, so clients can branch on `success` alone:

```json
{
  "success": false,
  "error": "querystring/year must be integer",
  "statusCode": 400,
  "details": [ ... ]
}
```

## ⭐ Killer Feature: `/predict`

```bash
GET /api/v1/predict?exam=jee_advanced&rank=500&category=general
```

Returns a ranked list of programs the rank has a chance at, one entry per program, each with a **confidence score** computed from the most recent year's official JoSAA opening and closing ranks, the round, quota and seat pool it was scored on, and a year-over-year trend.

- `rank` is the CRL rank for `general`, and the category rank for `ews`, `obc`, `sc` and `st` — the way JoSAA publishes cutoffs.
- `home_state=Kerala` adds home-state (HS) quota seats at institutes in that state; without it, only all-India (AI) and other-state (OS) seats are used.
- `gender=female` adds female-only seats; `pwd=true` adds PwD-reserved seats.

## 🏗️ Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify
- **Database:** SQLite (better-sqlite3)
- **Validation:** Zod
- **Docs:** Swagger UI at `/docs`

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Seed the database
npm run seed

# Start dev server (hot reload)
npm run dev

# Build for production
npm run build
npm start

# Regenerate openapi.json from the route schemas
npm run spec

# Run the test suite (uses its own database at data/test.db)
npm test
```

`openapi.json` is generated, not hand-edited — run `npm run spec` after changing
any route schema and commit the result. `npm test` fails if the committed spec
has drifted from the routes. Set `PUBLIC_URL` to the deployed base URL
so the spec advertises it instead of localhost; on Render this is picked up from
`RENDER_EXTERNAL_URL` automatically.

## 📦 Data Coverage

| Dataset | Source | Coverage |
|---|---|---|
| JEE Advanced cutoffs | **Official** — [JoSAA archive](https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx) | All 23 IITs, 2022-2025, round 1 and final round, every quota, category, gender pool and PwD seat |
| JEE Main cutoffs | **Official** — JoSAA archive | 31 NITs plus IIEST Shibpur, 26 IIITs and 47 GFTIs, same years and rounds |
| NIRF rankings | **Official** — [nirfindia.org](https://www.nirfindia.org) | 2023-2025, engineering (top 100) and medical (top 50), with all five parameter scores, for institutes in our coverage |
| Institutes | JoSAA, NIRF and curated metadata | 141 institutes; 1,000+ programs |
| NEET cutoffs | Synthetic | 10 medical colleges, 2022-2025 |
| Placements | Synthetic | 48 institutes, 2023-2025 |
| Exam statistics | Synthetic | 2025 only |

Official data lives in committed snapshots under `data/official/`, and the seed builds the database from them without touching the network, so every build serves identical data. To refresh the snapshots:

```bash
npm run fetch:josaa           # all years 2022-2025 (about 40 spaced-out requests)
npm run fetch:josaa -- 2026   # add a single new year
npm run fetch:nirf            # NIRF 2023-2025
npm run seed                  # rebuild the database from the snapshots
```

Then commit the changed files in `data/official/`. The fetchers fail loudly if a source page's layout changes rather than writing partial data.

## 💰 Pricing (via RapidAPI)

| Tier | Rate Limit | Price |
|------|-----------|-------|
| Free | 50 req/day | ₹0 |
| Basic | 1,000 req/day | ₹499/mo |
| Pro | 10,000 req/day | ₹1,999/mo |
| Business | 50,000 req/day | ₹4,999/mo |

## 📄 License

MIT
