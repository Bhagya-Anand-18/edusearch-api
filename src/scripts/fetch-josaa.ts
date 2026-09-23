/**
 * Downloads official JoSAA opening and closing ranks into committed snapshot files.
 *
 * Source: the public JoSAA archive at josaa.admissions.nic.in. One submit with
 * Institute Type, Institute, Program and Seat Type all set to ALL returns every
 * row for a given year and round, so a full year costs a handful of requests.
 *
 * This hits the network, so it is a manual step (`npm run fetch:josaa`) and
 * never runs during a build. The seed reads only the files it writes:
 *   data/official/josaa/<year>-r<round>.json.gz  — cutoff rows (gzipped: ~1.7MB -> ~110KB)
 *   data/official/josaa/institutes.json       — institute name -> JoSAA type
 *
 * Usage: npm run fetch:josaa -- [year ...]   (defaults to 2022-2025)
 */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const URL_ = 'https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx';
const USER_AGENT = 'Mozilla/5.0 (compatible; EduSearchDataImport/1.0)';
const FIELD = 'ctl00$ContentPlaceHolder1$';
const REQUEST_GAP_MS = 1000;
const OUT_DIR = path.resolve(process.cwd(), 'data/official/josaa');
const INSTITUTE_TYPES = ['IIT', 'NIT', '3IT', 'CFI'] as const;

type Page = ReturnType<typeof cheerio.load>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A browser-like session: one cookie jar, one page state carried between postbacks. */
class Session {
  private cookie = '';

  async load(form?: Record<string, string>): Promise<Page> {
    await sleep(REQUEST_GAP_MS);
    const res = await fetch(URL_, {
      method: form ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: URL_,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const setCookies = res.headers.getSetCookie();
    if (setCookies.length) this.cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    // A 302 to ErrMsg.aspx means the server rejected the postback, usually event validation.
    if (res.status !== 200) throw new Error(`JoSAA returned HTTP ${res.status} (${res.headers.get('location') ?? 'no location'})`);
    return cheerio.load(await res.text());
  }

  /** Changes one dropdown and posts back, as the page's onchange handler would. */
  async select(page: Page, name: string, value: string): Promise<Page> {
    const form = formState(page);
    if (!options(page, name).some(([v]) => v === value)) {
      throw new Error(`"${value}" is not an option of ${name}; available: ${options(page, name).map(([v]) => v).join(', ')}`);
    }
    form[FIELD + name] = value;
    form.__EVENTTARGET = FIELD + name;
    form.__EVENTARGUMENT = '';
    return this.load(form);
  }
}

/**
 * The form fields a browser would post. Dropdowns without options are left out:
 * posting a value for them fails ASP.NET event validation.
 */
function formState(page: Page): Record<string, string> {
  const form: Record<string, string> = {};
  page('input[type=hidden]').each((_, el) => {
    form[page(el).attr('name')!] = page(el).attr('value') ?? '';
  });
  page('select').each((_, el) => {
    const opts = page(el).find('option');
    if (!opts.length) return;
    form[page(el).attr('name')!] = page(el).find('option[selected]').attr('value') ?? opts.first().attr('value') ?? '';
  });
  return form;
}

function options(page: Page, name: string): [string, string][] {
  return page(`select[name="${FIELD}${name}"] option`)
    .map((_, o) => [[page(o).attr('value') ?? '', page(o).text().trim()]])
    .get() as [string, string][];
}

const realOptions = (page: Page, name: string) => options(page, name).filter(([v]) => v !== '0');

/** Institute names as JoSAA prints them, with runs of whitespace collapsed. */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchYear(year: number, institutes: Record<string, string>) {
  const session = new Session();
  const start = await session.load();
  const atYear = await session.select(start, 'ddlYear', String(year));
  const rounds = realOptions(atYear, 'ddlroundno').map(([v]) => Number(v));
  const finalRound = Math.max(...rounds);
  logger.info(`${year}: rounds 1-${finalRound} available; fetching rounds 1 and ${finalRound}`);

  // Institute types, read from the dropdown rather than guessed from names.
  const atRound1 = await session.select(atYear, 'ddlroundno', '1');
  for (const type of INSTITUTE_TYPES) {
    const atType = await session.select(atRound1, 'ddlInstype', type);
    for (const [, name] of realOptions(atType, 'ddlInstitute')) {
      if (name !== 'ALL') institutes[cleanName(name)] = type;
    }
  }

  for (const round of [...new Set([1, finalRound])]) {
    const atRound = await session.select(atYear, 'ddlroundno', String(round));
    const atType = await session.select(atRound, 'ddlInstype', 'ALL');
    const atInstitute = await session.select(atType, 'ddlInstitute', 'ALL');
    const atBranch = await session.select(atInstitute, 'ddlBranch', 'ALL');

    const form = formState(atBranch);
    form[FIELD + 'ddlSeatType'] = 'ALL';
    form[FIELD + 'btnSubmit'] = 'Submit';
    form.__EVENTTARGET = '';
    const result = await session.load(form);

    const header = result('table tr').first().find('th,td').map((_, c) => result(c).text().trim()).get();
    const expected = ['Institute', 'Academic Program Name', 'Quota', 'Seat Type', 'Gender', 'Opening Rank', 'Closing Rank'];
    if (header.join('|') !== expected.join('|')) {
      throw new Error(`Unexpected JoSAA table header for ${year} round ${round}: ${header.join(' | ')}`);
    }

    const rows: string[][] = [];
    result('table tr').slice(1).each((_, tr) => {
      const cells = result(tr).find('td').map((_, c) => result(c).text().trim()).get();
      if (cells.length === 7 && cells[0]) rows.push([cleanName(cells[0]), cleanName(cells[1]), ...cells.slice(2)]);
    });

    const file = path.join(OUT_DIR, `${year}-r${round}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({
      source: URL_,
      year,
      round,
      final_round: round === finalRound,
      fetched_at: new Date().toISOString(),
      columns: ['institute', 'program', 'quota', 'seat_type', 'gender', 'opening_rank', 'closing_rank'],
      rows,
    }) + '\n', { level: 9 }));
    const instituteCount = new Set(rows.map((r) => r[0])).size;
    logger.success(`${year} round ${round}: ${rows.length} rows across ${instituteCount} institutes -> ${path.relative(process.cwd(), file)}`);
  }
}

const main = async () => {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  const targetYears = years.length ? years : [2022, 2023, 2024, 2025];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const instituteFile = path.join(OUT_DIR, 'institutes.json');
  const institutes: Record<string, string> = fs.existsSync(instituteFile)
    ? JSON.parse(fs.readFileSync(instituteFile, 'utf8')).types
    : {};

  for (const year of targetYears) await fetchYear(year, institutes);

  const sorted = Object.fromEntries(Object.entries(institutes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(instituteFile, JSON.stringify({ source: URL_, types: sorted }, null, 2) + '\n');
  logger.success(`${Object.keys(sorted).length} institutes with types -> ${path.relative(process.cwd(), instituteFile)}`);
};

main().catch((err) => {
  logger.error(`JoSAA fetch failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
