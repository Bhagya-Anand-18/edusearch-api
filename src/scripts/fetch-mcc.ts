/**
 * Derives NEET-UG opening and closing ranks from MCC round-1 allotment results
 * and writes them to committed snapshots.
 *
 * MCC (mcc.nic.in) does not publish cutoffs. It publishes one "Final Result"
 * PDF per counselling round listing every allotted candidate's rank, quota,
 * institute, course and category; this aggregates those into the best and
 * worst rank allotted per seat group (see mcc-parser.ts). Only round 1 is used:
 * later rounds are published in a different, upgrade-tracking layout.
 *
 * Writes data/official/mcc/<year>-r1.json.gz. Never runs during a build.
 * Usage: npm run fetch:mcc -- [year ...]   (defaults to every year in RESULTS)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
// @ts-ignore -- pdf-parse's index runs a debug harness on import; the lib entry does not.
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { parseMccAllotments } from './mcc-parser.js';
import { logger } from '../utils/logger.js';
import { fetchWithRetry } from '../utils/fetch-retry.js';

const BASE = 'https://cdnbbsr.s3waas.gov.in/s3e0f7a4d0ef9b84b83b693bbf3feb8e6e/uploads';

/**
 * Round-1 "Final Result" PDFs, linked from https://mcc.nic.in/archive-ug/.
 * Add a year by appending its round-1 final result link from that page.
 */
const RESULTS: Record<number, string> = {
  2022: `${BASE}/2023/05/2023053188-1.pdf`,
  2023: `${BASE}/2023/07/2023073062.pdf`,
  2024: `${BASE}/2024/08/2024082536.pdf`,
  2025: `${BASE}/2025/08/20250813289226788.pdf`,
};

const USER_AGENT = 'Mozilla/5.0 (compatible; EduSearchDataImport/1.0)';
const OUT_DIR = path.resolve(process.cwd(), 'data/official/mcc');
const COLUMNS = ['institute', 'course', 'quota', 'category', 'pwd', 'gender', 'opening_rank', 'closing_rank', 'allotments'] as const;

const main = async () => {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  const targets = years.length ? years : Object.keys(RESULTS).map(Number);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const year of targets) {
    const url = RESULTS[year];
    if (!url) throw new Error(`No MCC result link configured for ${year}; add it to RESULTS.`);
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
    const { text } = await pdf(Buffer.from(await res.arrayBuffer()));

    const parsed = parseMccAllotments(text);
    if (!parsed.records || !parsed.groups.length) {
      throw new Error(`${year}: no allotment records parsed; the PDF layout may have changed`);
    }
    const unknown = Object.entries(parsed.skipped).filter(([why]) => why.startsWith('unknown'));
    if (unknown.length) throw new Error(`${year}: unrecognized values ${JSON.stringify(Object.fromEntries(unknown))}`);

    const file = path.join(OUT_DIR, `${year}-r1.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({
      source: url,
      year,
      round: 1,
      fetched_at: new Date().toISOString(),
      records: parsed.records,
      kept: parsed.kept,
      columns: COLUMNS,
      rows: parsed.groups.map((g) => COLUMNS.map((c) => g[c])),
    }) + '\n', { level: 9 }));
    logger.success(`${year}: ${parsed.records} allotments, ${parsed.kept} AI/SO MBBS/BDS -> ${parsed.groups.length} seat groups -> ${path.relative(process.cwd(), file)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
};

main().catch((err) => {
  logger.error(`MCC fetch failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
