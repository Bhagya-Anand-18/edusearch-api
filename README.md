# EduSearch API

**Comprehensive Indian Education Data API** — JEE/NEET cutoffs, NIRF rankings, college data, placements, and AI-powered admission predictions.

[![RapidAPI](https://img.shields.io/badge/RapidAPI-EduSearch-blue)](https://rapidapi.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🚀 What is this?

EduSearch API provides structured, queryable access to Indian education data that's currently scattered across PDFs, government portals, and counseling websites. Every EdTech app in India needs this data — we make it accessible via a clean REST API.

## 📊 Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/cutoffs` | JEE Main/Advanced & NEET cutoffs with filters |
| `GET /api/v1/colleges` | Search and filter 50+ institutes |
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

Returns a ranked list of colleges you're likely to get admitted to, with **confidence scores** based on historical cutoff trends.

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
```

`openapi.json` is generated, not hand-edited — run `npm run spec` after changing
any route schema and commit the result. Set `PUBLIC_URL` to the deployed base URL
so the spec advertises it instead of localhost; on Render this is picked up from
`RENDER_EXTERNAL_URL` automatically.

## 📦 Data Coverage

- **48 institutes** — All 23 IITs, Top 10 NITs, 5 IIITs, 10 Medical colleges
- **JEE Advanced cutoffs** — 2022-2025, all categories, multiple rounds
- **JEE Main cutoffs** — 2022-2025, all categories
- **NEET cutoffs** — 2022-2025, all categories
- **NIRF Rankings** — 2023-2026, Engineering & Medical
- **Placement data** — 2023-2025
- **Exam statistics** — Registration, qualification, score ranges

## 💰 Pricing (via RapidAPI)

| Tier | Rate Limit | Price |
|------|-----------|-------|
| Free | 50 req/day | ₹0 |
| Basic | 1,000 req/day | ₹499/mo |
| Pro | 10,000 req/day | ₹1,999/mo |
| Business | 50,000 req/day | ₹4,999/mo |

## 📄 License

MIT
