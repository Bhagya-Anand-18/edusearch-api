/**
 * Downloads official NIRF rankings into committed snapshot files.
 *
 * Source: nirfindia.org, which publishes each year's ranking as a static HTML
 * table (top 100 for engineering, top 50 for medical) with the overall score
 * and the five parameter sub-scores for every institute.
 *
 * This hits the network, so it is a manual step (`npm run fetch:nirf`) and never
 * runs during a build. The seed reads only the files it writes:
 *   data/official/nirf/<year>-<category>.json
 *
 * Usage: npm run fetch:nirf -- [year ...]   (defaults to 2023-2025)
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; EduSearchDataImport/1.0)';
const REQUEST_GAP_MS = 1000;
const OUT_DIR = path.resolve(process.cwd(), 'data/official/nirf');
const CATEGORIES = { engineering: 'Engineering', medical: 'Medical' } as const;
const SUB_SCORES = ['TLR (100)', 'RPC (100)', 'GO (100)', 'OI (100)', 'PERCEPTION (100)'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchRanking(year: number, category: keyof typeof CATEGORIES) {
  const url = `https://www.nirfindia.org/Rankings/${year}/${CATEGORIES[category]}Ranking.html`;
  await sleep(REQUEST_GAP_MS);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) {
    logger.warn(`${year} ${category}: not published (404), skipping`);
    return;
  }
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());

  const rows: (string | number)[][] = [];
  $('#tbl_overall > tbody > tr').each((_, tr) => {
    // The name cell also holds a "More Details" link and a nested sub-score
    // table; strip those so only the institute's own text remains.
    const cells = $(tr).children('td').map((_, td) => {
      const cell = $(td).clone();
      cell.find('table, div, a, span').remove();
      return text(cell.text());
    }).get();
    const detail = $(tr).find('table').first();
    const heads = detail.find('th').map((_, th) => text($(th).text())).get();
    if (heads.join('|') !== SUB_SCORES.join('|')) {
      throw new Error(`${year} ${category}: unexpected sub-score columns ${heads.join(', ')}`);
    }
    const subScores = detail.find('td').map((_, td) => Number(text($(td).text()))).get();
    const [nirfId, name, city, state, score, rank] = cells;
    rows.push([nirfId, name, city, state, Number(score), parseInt(rank, 10), ...subScores]);
  });

  if (!rows.length) throw new Error(`${year} ${category}: no ranking rows found; the page layout may have changed`);
  if (rows.some((r) => r.slice(4).some((v) => typeof v === 'number' && Number.isNaN(v)))) {
    throw new Error(`${year} ${category}: some scores did not parse as numbers`);
  }

  const file = path.join(OUT_DIR, `${year}-${category}.json`);
  fs.writeFileSync(file, JSON.stringify({
    source: url,
    year,
    category,
    fetched_at: new Date().toISOString(),
    columns: ['nirf_id', 'name', 'city', 'state', 'score', 'rank', 'tlr_score', 'rpc_score', 'go_score', 'oi_score', 'perception_score'],
    rows,
  }) + '\n');
  logger.success(`${year} ${category}: ${rows.length} institutes -> ${path.relative(process.cwd(), file)}`);
}

const main = async () => {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const year of years.length ? years : [2023, 2024, 2025]) {
    for (const category of Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]) {
      await fetchRanking(year, category);
    }
  }
};

main().catch((err) => {
  logger.error(`NIRF fetch failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
