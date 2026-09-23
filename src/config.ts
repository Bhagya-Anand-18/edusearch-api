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
