import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schema } from './schema.js';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, 'edusearch.db'));
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(schema);
