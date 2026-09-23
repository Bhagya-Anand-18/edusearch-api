import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_KEY_SECRET: process.env.API_KEY_SECRET || 'change-me',
  RAPIDAPI_PROXY_SECRET: process.env.RAPIDAPI_PROXY_SECRET || '',
  // Public base URL advertised in the OpenAPI spec, so the "Try it" button in
  // Swagger UI and on RapidAPI points at the deployed API rather than localhost.
  // RENDER_EXTERNAL_URL is injected automatically on Render, so a deploy there
  // advertises its own URL without any extra configuration.
  PUBLIC_URL: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '',
};

/**
 * Where the served data comes from. Cutoffs, rankings and placements come from
 * official sources (committed snapshots under data/official); exam statistics
 * are still synthetic. Every record carries its own `source`, and
 * /api/v1/stats reports the per-dataset breakdown.
 */
export const DATA_PROVENANCE = {
  source: 'mixed' as const,
  notice:
    'JEE cutoffs (JoSAA, 2022-2025), NIRF rankings (2023-2025) and placement figures (NIRF institute data reports) are official. NEET rank ranges (2022-2025) are derived from official MCC round-1 allotments. Exam statistics are synthetic sample data, marked source: "synthetic".',
};
