import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_KEY_SECRET: process.env.API_KEY_SECRET || 'change-me',
  RAPIDAPI_PROXY_SECRET: process.env.RAPIDAPI_PROXY_SECRET || '',
};
