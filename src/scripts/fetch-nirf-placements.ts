/**
 * Downloads official placement figures from NIRF institute data reports into a
 * committed snapshot.
 *
 * Every institute in the NIRF ranking snapshots has a data report PDF, addressed
 * by its NIRF ID, listing graduates, placements, median salary and higher-studies
 * counts for its three most recent graduating batches per program block. Only
 * each institute's latest report is fetched, since later reports supersede
 * earlier ones.
 *
 * Run `npm run fetch:nirf` first; this reads its ranking snapshots for the IDs.
 * Writes data/official/nirf/placements.json. Never runs during a build.
 */
import fs from 'fs';
import path from 'path';
// @ts-ignore -- pdf-parse's index runs a debug harness on import; the lib entry does not.
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { parsePlacements, PlacementRow } from './nirf-placement-parser.js';
import { logger } from '../utils/logger.js';
import { fetchWithRetry } from '../utils/fetch-retry.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; EduSearchDataImport/1.0)';
const REQUEST_GAP_MS = 1000;
const NIRF_DIR = path.resolve(process.cwd(), 'data/official/nirf');
const CATEGORY_PATHS: Record<string, string> = { engineering: 'Engineering', medical: 'Medical' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  // Latest report per NIRF ID across the ranking snapshots.
  const latest = new Map<string, { year: number; category: string }>();
  for (const file of fs.readdirSync(NIRF_DIR).filter((f) => /^\d{4}-(engineering|medical)\.json$/.test(f))) {
    const snap = JSON.parse(fs.readFileSync(path.join(NIRF_DIR, file), 'utf8'));
    for (const row of snap.rows) {
      const current = latest.get(row[0]);
      if (!current || snap.year > current.year) latest.set(row[0], { year: snap.year, category: snap.category });
    }
  }
  logger.info(`${latest.size} institutes to fetch`);

  const institutes: Record<string, { report_year: number; category: string; url: string; rows: PlacementRow[] }> = {};
  const failures: string[] = [];
  let done = 0;
  for (const [nirfId, { year, category }] of latest) {
    const url = `https://www.nirfindia.org/nirfpdfcdn/${year}/pdf/${CATEGORY_PATHS[category]}/${nirfId}.pdf`;
    await sleep(REQUEST_GAP_MS);
    try {
      const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text } = await pdf(Buffer.from(await res.arrayBuffer()));
      const rows = parsePlacements(text);
      if (!rows.length) throw new Error('no placement tables found');
      institutes[nirfId] = { report_year: year, category, url, rows };
    } catch (err) {
      failures.push(`${nirfId} (${url}): ${err instanceof Error ? err.message : err}`);
    }
    if (++done % 25 === 0) logger.info(`${done}/${latest.size} reports processed`);
  }

  const sorted = Object.fromEntries(Object.entries(institutes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(NIRF_DIR, 'placements.json'), JSON.stringify({
    source: 'NIRF institute data reports (nirfindia.org)',
    fetched_at: new Date().toISOString(),
    institutes: sorted,
  }) + '\n');

  const rowCount = Object.values(institutes).reduce((n, i) => n + i.rows.length, 0);
  logger.success(`${Object.keys(institutes).length} institutes, ${rowCount} placement rows -> data/official/nirf/placements.json`);
  for (const f of failures) logger.warn(`Skipped ${f}`);
};

main().catch((err) => {
  logger.error(`NIRF placement fetch failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
