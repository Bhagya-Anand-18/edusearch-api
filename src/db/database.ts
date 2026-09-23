import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schema } from './schema.js';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// DB_PATH lets the test suite run against its own copy instead of the dev database.
export const db = new Database(process.env.DB_PATH || path.join(dataDir, 'edusearch.db'));
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(schema);
