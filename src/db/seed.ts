/**
 * Builds the database from committed snapshots of official data, topped up
 * (See each section for its source.)
 *
 *   Official:
 *     - Engineering institutes, programs and JEE cutoffs from data/official/josaa
 *       (JoSAA archive; source = 'josaa')
 *     - Medical colleges and NEET rank ranges from data/official/mcc, derived from
 *       MCC round-1 allotment results (source = 'mcc_derived')
 *     - NIRF rankings and placement figures from data/official/nirf
 *       (nirfindia.org rankings and institute data reports; source = 'nirf')
 *
 * This never touches the network, so it is safe to run on every build. Refresh
 * the snapshots with the fetch:* scripts.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { db } from './database.js';
import { schema } from './schema.js';
import { KNOWN_INSTITUTES, KNOWN_MEDICAL_MCC, STATE_OVERRIDES } from './institutes.js';
import { medicalNameKey, parseMccInstitute, resolveMccIdentities, tidyName } from './mcc-institutes.js';
import { canonicalState } from '../utils/states.js';
import { logger } from '../utils/logger.js';

const OFFICIAL_DIR = path.resolve(process.cwd(), 'data/official');

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

type JosaaRow = [string, string, string, string, string, string, string];
interface JosaaSnapshot {
  year: number;
  round: number;
  final_round: boolean;
  rows: JosaaRow[];
}

type NirfRow = [string, string, string, string, number, number, number, number, number, number, number];

type MccRow = [string, 'MBBS' | 'BDS', string, string, boolean, string, number, number, number];
interface MccSnapshot {
  year: number;
  round: number;
  rows: MccRow[];
}

interface PlacementSnapshot {
  institutes: Record<string, {
    rows: { program: string; academic_year: string; graduating: number | null; placed: number | null; median_salary: number | null; higher_studies: number | null }[];
  }>;
}
interface NirfSnapshot {
  year: number;
  category: 'engineering' | 'medical';
  rows: NirfRow[];
}

const readJson = (file: string) => {
  const raw = fs.readFileSync(file);
  return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
};

const listSnapshots = (dir: string, pattern: RegExp) => {
  const full = path.join(OFFICIAL_DIR, dir);
  if (!fs.existsSync(full)) throw new Error(`Missing ${full}. Run npm run fetch:${dir} first.`);
  return fs.readdirSync(full).filter((f) => pattern.test(f)).sort().map((f) => path.join(full, f));
};

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/** Collapses the cosmetic differences between how JoSAA, NIRF and we spell a name. */
const normalize = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(iiit\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Spellings that normalization alone cannot reconcile, mapped to the name the
 * institute is stored under. Covers JoSAA renaming an institute between years
 * (which would otherwise split it in two) and our own KNOWN_INSTITUTES names.
 */
const ALIASES: Record<string, string> = Object.fromEntries(Object.entries({
  'Indian Institute of Technology (BHU) Varanasi': 'Indian Institute of Technology Banaras Hindu University',
  'Atal Bihari Vajpayee Indian Institute of Information Technology & Management Gwalior':
    'Atal Bihari Vajpayee Indian Institute of Information Technology and Management',
  'INDIAN INSTITUTE OF INFORMATION TECHNOLOGY SENAPATI MANIPUR': 'Indian Institute of Information Technology Manipur',
  'School of Studies of Engineering and Technology, Guru Ghasidas Vishwavidyalaya, Bilaspur':
    'Institute of Technology, Guru Ghasidas Vishwavidyalaya (A Central University), Bilaspur, (C.G.)',
  'National Institute of Food Technology Entrepreneurship and Management, Sonepat, Haryana':
    'National Institute of Food Technology Entrepreneurship and Management, Kundli',
  'National Institute of Food Technology, Entrepreneurship and Management (NIFTEM) - Thanjavur':
    'National Institute of Food Technology Entrepreneurship and Management, Thanjavur',
}).map(([from, to]) => [normalize(from), to]));

const canonicalKey = (name: string) => normalize(ALIASES[normalize(name)] ?? name);

/**
 * NIRF spellings of our institutes, confirmed by city as well as name: NIRF
 * uses the bare name "Christian Medical College" for both the Vellore and the
 * Ludhiana college, so a name-only alias would attach the wrong ranking.
 * Entries are [NIRF name, NIRF city, our stored name].
 */
const NIRF_ALIASES: [string, string, string][] = [
  ['Indian Institute of Technology (Indian School of Mines)', 'Dhanbad', 'Indian Institute of Technology (ISM) Dhanbad'],
  ['Indian Institute of Technology (Indian School of Mines) Dhanbad', 'Dhanbad', 'Indian Institute of Technology (ISM) Dhanbad'],
  ['Indian Institute of Technology (Banaras Hindu University) Varanasi', 'Varanasi', 'Indian Institute of Technology Banaras Hindu University'],
  ['Malaviya National Institute of Technology', 'Jaipur', 'Malaviya National Institute of Technology Jaipur'],
  ['Maulana Azad National Institute of Technology', 'Bhopal', 'Maulana Azad National Institute of Technology Bhopal'],
  ['Motilal Nehru National Institute of Technology', 'Prayagraj', 'Motilal Nehru National Institute of Technology Allahabad'],
  ['Sardar Vallabhbhai National Institute of Technology', 'Surat', 'Sardar Vallabhbhai National Institute of Technology, Surat'],
  ['All India Institute of Medical Sciences Delhi', 'New Delhi', 'All India Institute of Medical Sciences New Delhi'],
  ['Christian Medical College', 'Vellore', 'Christian Medical College Vellore'],
  ['Jawaharlal Institute of Post Graduate Medical Education and Research', 'Puducherry',
    'Jawaharlal Institute of Postgraduate Medical Education and Research'],
  ['King George`s Medical University', 'Lucknow', 'King George Medical University'],
  ['Madras Medical College and Government General Hospital', 'Chennai', 'Madras Medical College'],
  ['Madras Medical College and Government General Hospital, Chennai', 'Chennai', 'Madras Medical College'],
  ['Pandit Dwarka Prasad Mishra Indian Institute of Information Technology, Design and Manufacturing (IIITDM)', 'Jabalpur',
    'Pt. Dwarka Prasad Mishra Indian Institute of Information Technology, Design & Manufacture Jabalpur'],
  // BIT Mesra is in Ranchi; NIRF drops "Mesra". The ICT listed under Mumbai is
  // the main campus, not JoSAA's Odisha campus, so it is deliberately not aliased.
  ['Birla Institute of Technology', 'Ranchi', 'Birla Institute of Technology, Mesra, Ranchi'],
];
const nirfAliasIndex = new Map(NIRF_ALIASES.map(([name, city, ours]) => [`${normalize(name)}|${normalize(city)}`, ours]));

const nirfKey = (name: string, city: string) =>
  canonicalKey(nirfAliasIndex.get(`${normalize(name)}|${normalize(city)}`) ?? name);

// ---------------------------------------------------------------------------
// JoSAA value mapping
// ---------------------------------------------------------------------------

const JOSAA_TYPES: Record<string, string> = { IIT: 'IIT', NIT: 'NIT', '3IT': 'IIIT', CFI: 'GFTI' };

const SEAT_CATEGORIES: Record<string, string> = {
  OPEN: 'general',
  EWS: 'ews',
  'OBC-NCL': 'obc',
  SC: 'sc',
  ST: 'st',
};

const GENDERS: Record<string, string> = {
  'Gender-Neutral': 'neutral',
  'Female-only (including Supernumerary)': 'female',
};

const DEGREES: Record<string, string> = {
  'Bachelor of Technology': 'B.Tech',
  'B. Tech / B. Tech (Hons.)': 'B.Tech',
  'Bachelor and Master of Technology (Dual Degree)': 'B.Tech + M.Tech (Dual Degree)',
  'B.Tech. + M.Tech./MS (Dual Degree)': 'B.Tech + M.Tech/MS (Dual Degree)',
  'Integrated B. Tech. and M. Tech.': 'B.Tech + M.Tech (Integrated)',
  'Integrated Master of Technology': 'M.Tech (Integrated)',
  'Integrated Masters in Technology': 'M.Tech (Integrated)',
  'Bachelor of Science': 'B.S',
  'Bachelor of Science and Master of Science (Dual Degree)': 'B.S + M.S (Dual Degree)',
  'Integrated Master of Science': 'M.Sc (Integrated)',
  'Bachelor of Architecture': 'B.Arch',
  'Bachelor of Planning': 'B.Plan',
  'Integrated B. Tech. and MBA': 'B.Tech + MBA (Integrated)',
  'Bachelor of Technology and MBA (Dual Degree)': 'B.Tech + MBA (Dual Degree)',
};

/** "Computer Science and Engineering (4 Years, Bachelor of Technology)" -> its parts. */
const parseProgram = (raw: string) => {
  const m = raw.match(/^(.*) \((\d+) Years?, (.*)\)$/);
  if (!m) return { name: raw, duration: null as number | null, degree: null as string | null };
  return { name: m[1], duration: Number(m[2]), degree: DEGREES[m[3]] ?? m[3] };
};

/** JoSAA ranks: "1234", "56P" (a PwD rank list), occasionally "1234.0". */
const parseRank = (raw: string): number | null => {
  const n = Math.floor(Number(raw.replace(/P$/, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "Indian Institute of Technology Bombay" -> "IIT Bombay", for the common patterns. */
const deriveShortName = (name: string, type: string): string | null => {
  const place = (rest: string) => rest.replace(/^[\s,]+/, '').split(',')[0].trim();
  let m;
  if (type === 'IIT' && (m = name.match(/^Indian Institute of Technology\s+(.*)$/))) return `IIT ${place(m[1])}`;
  if (type === 'NIT' && (m = name.match(/^National Institute of Technology\s*(.*)$/))) return `NIT ${place(m[1])}`;
  if (type === 'IIIT' && (m = name.match(/^Indian Institute of Information Technology\s*(?:\(IIIT\))?\s*(.*)$/))) {
    return `IIIT ${place(m[1])}`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

interface Institute {
  name: string;
  short_name: string | null;
  type: string;
  state: string | null;
  city: string | null;
  website: string | null;
  established_year: number | null;
  nirf: { year: number; category: string; rank: number; score: number } | null;
  /** NIRF IDs matched to this institute, for looking up its placement report. */
  nirf_ids: Set<string>;
}

/** NIRF writes "All India Institute of Medical Sciences"; MCC writes "AIIMS". */
const nirfMedicalKey = (name: string) =>
  medicalNameKey(name.replace(/All India Institute of Medical Sciences/i, 'AIIMS'));

const seed = () => {
  const josaa = listSnapshots('josaa', /^\d{4}-r\d+\.json(\.gz)?$/).map(readJson) as JosaaSnapshot[];
  const josaaTypes: Record<string, string> = readJson(path.join(OFFICIAL_DIR, 'josaa/institutes.json')).types;
  const nirf = listSnapshots('nirf', /^\d{4}-(engineering|medical)\.json$/).map(readJson) as NirfSnapshot[];
  const mcc = listSnapshots('mcc', /^\d{4}-r\d+\.json(\.gz)?$/).map(readJson) as MccSnapshot[];
  const placements = readJson(path.join(OFFICIAL_DIR, 'nirf/placements.json')) as PlacementSnapshot;

  // Every table is derived from the snapshots, so rebuild from scratch rather
  // than migrating whatever schema an existing database file has.
  db.exec(`
    DROP TABLE IF EXISTS cutoffs;
    DROP TABLE IF EXISTS placements;
    DROP TABLE IF EXISTS nirf_rankings;
    DROP TABLE IF EXISTS programs;
    DROP TABLE IF EXISTS institutes;
    DROP TABLE IF EXISTS exam_stats; -- retired: it only ever held synthetic numbers
  `);
  db.exec(schema);

  const report: string[] = [];

  db.transaction(() => {
    // --- Institutes --------------------------------------------------------
    const institutes = new Map<string, Institute>(); // keyed by canonicalKey(name)

    for (const [name, short_name, type, state, city, website, established_year] of KNOWN_INSTITUTES) {
      institutes.set(canonicalKey(name), {
        name, short_name, type, state, city, website, established_year, nirf: null, nirf_ids: new Set(),
      });
    }

    const josaaNames = new Set(josaa.flatMap((s) => s.rows.map((r) => r[0])));
    let enriched = 0;
    for (const josaaName of josaaNames) {
      const key = canonicalKey(josaaName);
      if (institutes.has(key)) { enriched++; continue; }
      const josaaType = josaaTypes[josaaName];
      if (!josaaType) throw new Error(`No JoSAA institute type for "${josaaName}". Re-run npm run fetch:josaa.`);
      const type = JOSAA_TYPES[josaaType];
      institutes.set(key, {
        name: josaaName, short_name: deriveShortName(josaaName, type), type,
        state: STATE_OVERRIDES[josaaName] ?? null, city: null, website: null, established_year: null, nirf: null, nirf_ids: new Set(),
      });
    }
    report.push(`JoSAA: ${josaaNames.size} institute names (${enriched} matched to existing metadata)`);

    // Medical colleges from MCC. Identity is resolved across years (see
    // mcc-institutes.ts); the display name comes from the latest year.
    const mccEntries = mcc.flatMap((snap) => [...new Set(snap.rows.map((r) => r[0]))].map((raw) => ({ raw, year: snap.year })));
    const resolution = resolveMccIdentities(mccEntries);
    const latestRaw = new Map<string, { raw: string; year: number }>();
    for (const e of mccEntries) {
      const id = resolution.keys.get(e.raw)!;
      const current = latestRaw.get(id);
      if (!current || e.year > current.year) latestRaw.set(id, e);
    }
    const nameUses = new Map<string, number>();
    for (const { raw } of latestRaw.values()) {
      const k = parseMccInstitute(raw).nameKey;
      nameUses.set(k, (nameUses.get(k) ?? 0) + 1);
    }
    const knownByMcc = new Map<string, string>(); // MCC identity -> known institute key
    for (const [knownName, match] of Object.entries(KNOWN_MEDICAL_MCC)) {
      // One college can have several MCC entries (KGMU lists its dental faculty separately).
      const ids = [...latestRaw].filter(([, { raw }]) => parseMccInstitute(raw).pin === match.pin && match.name.test(raw)).map(([id]) => id);
      if (!ids.length) throw new Error(`KNOWN_MEDICAL_MCC: no MCC college matches "${knownName}"`);
      for (const id of ids) knownByMcc.set(id, canonicalKey(knownName));
    }
    const mccInstituteKey = new Map<string, string>(); // MCC identity -> institutes map key
    const displayNames = new Set([...institutes.values()].map((i) => i.name));
    for (const [id, { raw }] of latestRaw) {
      const p = parseMccInstitute(raw);
      const known = knownByMcc.get(id);
      if (known) {
        institutes.get(known)!.state ??= p.state;
        mccInstituteKey.set(id, known);
        continue;
      }
      const place = p.place && p.place.split(' ').length <= 3 && !/\d/.test(p.place) ? tidyName(p.place) : null;
      let name = tidyName(p.name);
      if ((nameUses.get(p.nameKey) ?? 0) > 1 && place) name = `${name}, ${place}`;
      if (displayNames.has(name) && p.pin) name = `${name} (${p.pin})`;
      displayNames.add(name);
      const key = `mcc|${id}`;
      institutes.set(key, {
        name, short_name: null, type: 'Medical', state: p.state, city: place,
        website: null, established_year: null, nirf: null, nirf_ids: new Set(),
      });
      mccInstituteKey.set(id, key);
    }
    report.push(`MCC: ${latestRaw.size} medical college entries (${knownByMcc.size} matched to existing metadata; ${resolution.renames.length} renames and ${resolution.pinChanges.length} PIN changes merged; ${resolution.unresolved.length} unresolved)`);

    // NIRF names medical colleges differently from MCC; match them by name key
    // (with or without the city appended), confirmed by state.
    const medicalIndex = new Map<string, string[]>();
    const indexMedical = (k: string, instKey: string) => medicalIndex.set(k, [...new Set([...(medicalIndex.get(k) ?? []), instKey])]);
    for (const [id, instKey] of mccInstituteKey) {
      const p = parseMccInstitute(latestRaw.get(id)!.raw);
      indexMedical(p.nameKey, instKey);
      if (p.place) indexMedical(p.nameKey + medicalNameKey(p.place), instKey);
      indexMedical(medicalNameKey(institutes.get(instKey)!.name), instKey);
    }
    const matchMedical = (row: NirfRow): string | null => {
      const [, name, city, state] = row;
      const candidates = new Set([
        ...(medicalIndex.get(nirfMedicalKey(name)) ?? []),
        ...(medicalIndex.get(nirfMedicalKey(`${name} ${city}`)) ?? []),
      ]);
      const inState = [...candidates].filter((k) => {
        const s = institutes.get(k)!.state;
        return !s || s === canonicalState(state);
      });
      return inState.length === 1 ? inState[0] : null;
    };

    // NIRF supplies each institute's rankings, and its location where we lack one.
    // NIRF IDs are stable while names change between years ("Pt. B.D.Sharma,
    // PGIMS" became "Pandit Bhagwat Dayal Sharma University of Health Sciences"),
    // so an ID matched by name in any year claims that institute's rows in every year.
    const nirfIdKeys = new Map<string, string>();
    for (const snap of nirf) {
      for (const row of snap.rows) {
        let key = nirfKey(row[1], row[2]);
        if (!institutes.has(key) && snap.category === 'medical') key = matchMedical(row) ?? key;
        if (institutes.has(key) && !nirfIdKeys.has(row[0])) nirfIdKeys.set(row[0], key);
      }
    }
    const nirfRows: { key: string; year: number; category: string; row: NirfRow }[] = [];
    const outsideCoverage = new Set<string>();
    for (const snap of nirf) {
      for (const row of snap.rows) {
        const key = nirfIdKeys.get(row[0]);
        const inst = key ? institutes.get(key) : undefined;
        if (!key || !inst) { outsideCoverage.add(row[1]); continue; }
        inst.nirf_ids.add(row[0]);
        inst.city ??= row[2];
        inst.state ??= row[3];
        if (!inst.nirf || snap.year > inst.nirf.year) {
          inst.nirf = { year: snap.year, category: snap.category, rank: row[5], score: row[4] };
        }
        nirfRows.push({ key, year: snap.year, category: snap.category, row });
      }
    }
    const ranked = new Set(nirfRows.map((r) => r.key)).size;
    report.push(`NIRF: ${ranked} of our institutes ranked; ${outsideCoverage.size} ranked institutes are outside our coverage`);

    const insertInstitute = db.prepare(`
      INSERT INTO institutes (name, short_name, type, state, city, nirf_rank, nirf_score, nirf_category, website, established_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const instituteIds = new Map<string, number>();
    for (const [key, i] of institutes) {
      const res = insertInstitute.run(
        i.name, i.short_name, i.type, canonicalState(i.state), i.city,
        i.nirf?.rank ?? null, i.nirf?.score ?? null, i.nirf?.category ?? null,
        i.website, i.established_year
      );
      instituteIds.set(key, Number(res.lastInsertRowid));
    }
    report.push(`Institutes: ${institutes.size}`);

    // --- NIRF rankings -----------------------------------------------------
    const insertNirf = db.prepare(`
      INSERT INTO nirf_rankings (institute_id, year, category, rank, score, tlr_score, rpc_score, go_score, oi_score, perception_score, nirf_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nirf')
    `);
    for (const { key, year, category, row } of nirfRows) {
      const [nirfId, , , , score, rank, tlr, rpc, go, oi, perception] = row;
      insertNirf.run(instituteIds.get(key), year, category, rank, score, tlr, rpc, go, oi, perception, nirfId);
    }
    report.push(`NIRF: ${nirfRows.length} ranking records`);

    // --- Programs and JEE cutoffs ------------------------------------------
    const insertProgram = db.prepare(`
      INSERT INTO programs (institute_id, name, degree, duration_years, branch_code) VALUES (?, ?, ?, ?, NULL)
    `);
    const insertCutoff = db.prepare(`
      INSERT INTO cutoffs (program_id, exam, year, round, is_final_round, quota, category, pwd, gender, opening_rank, closing_rank, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const programIds = new Map<string, number>();
    const skipped: Record<string, number> = {};
    const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
    let cutoffCount = 0;

    for (const snap of josaa) {
      for (const [instName, programRaw, quota, seatType, genderRaw, openRaw, closeRaw] of snap.rows) {
        const key = canonicalKey(instName);
        const instituteId = instituteIds.get(key)!;

        const programKey = `${instituteId}|${programRaw}`;
        let programId = programIds.get(programKey);
        if (programId === undefined) {
          const p = parseProgram(programRaw);
          programId = Number(insertProgram.run(instituteId, p.name, p.degree, p.duration).lastInsertRowid);
          programIds.set(programKey, programId);
        }

        const category = SEAT_CATEGORIES[seatType.replace(/\s*\(PwD\)$/, '')];
        const gender = GENDERS[genderRaw];
        const opening = parseRank(openRaw);
        const closing = parseRank(closeRaw);
        if (!category) { skip(`unknown seat type "${seatType}"`); continue; }
        if (!gender) { skip(`unknown gender "${genderRaw}"`); continue; }
        if (opening === null || closing === null) { skip(`unparseable rank "${openRaw}"/"${closeRaw}"`); continue; }

        insertCutoff.run(
          programId,
          institutes.get(key)!.type === 'IIT' ? 'jee_advanced' : 'jee_main',
          snap.year, snap.round, snap.final_round ? 1 : 0,
          quota, category, seatType.endsWith('(PwD)') ? 1 : 0, gender, opening, closing, 'josaa'
        );
        cutoffCount++;
      }
    }
    report.push(`JoSAA: ${programIds.size} programs, ${cutoffCount} cutoff records from ${josaa.length} snapshots`);
    for (const [why, n] of Object.entries(skipped)) report.push(`JoSAA: skipped ${n} rows (${why})`);

    // --- NEET rank ranges from MCC allotments -------------------------------
    // A college can appear under several spellings within one year, so merge
    // groups per identity before inserting.
    type NeetGroup = { instKey: string; course: string; year: number; round: number; quota: string; category: string; pwd: boolean; gender: string; opening: number; closing: number };
    const neetGroups = new Map<string, NeetGroup>();
    for (const snap of mcc) {
      for (const [raw, course, quota, category, pwd, gender, opening, closing] of snap.rows) {
        const instKey = mccInstituteKey.get(resolution.keys.get(raw)!)!;
        const k = [instKey, course, snap.year, snap.round, quota, category, pwd, gender].join('|');
        const g = neetGroups.get(k);
        if (g) {
          g.opening = Math.min(g.opening, opening);
          g.closing = Math.max(g.closing, closing);
        } else {
          neetGroups.set(k, { instKey, course, year: snap.year, round: snap.round, quota, category, pwd, gender, opening, closing });
        }
      }
    }
    const COURSES: Record<string, [string, string, number]> = {
      MBBS: ['Medicine and Surgery', 'MBBS', 5],
      BDS: ['Dental Surgery', 'BDS', 5],
    };
    for (const g of neetGroups.values()) {
      const instituteId = instituteIds.get(g.instKey)!;
      const programKey = `${instituteId}|${g.course}`;
      let programId = programIds.get(programKey);
      if (programId === undefined) {
        const [name, degree, duration] = COURSES[g.course];
        programId = Number(insertProgram.run(instituteId, name, degree, duration).lastInsertRowid);
        programIds.set(programKey, programId);
      }
      // MCC occasionally prints a half rank (13767.5) to break a tie.
      insertCutoff.run(programId, 'neet', g.year, g.round, 0, g.quota, g.category, g.pwd ? 1 : 0, g.gender,
        Math.floor(g.opening), Math.floor(g.closing), 'mcc_derived');
    }
    report.push(`MCC: ${neetGroups.size} NEET seat-group records from ${mcc.length} snapshots`);

    // --- Placements from NIRF institute data reports ------------------------
    const insertPlacement = db.prepare(`
      INSERT INTO placements (institute_id, year, academic_year, program_or_dept, graduating, placed, higher_studies,
        students_placed_pct, median_salary, average_salary, highest_salary, top_recruiters, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'nirf')
    `);
    let placementCount = 0;
    let placementInstitutes = 0;
    for (const [key, inst] of institutes) {
      const seen = new Set<string>();
      for (const nirfId of inst.nirf_ids) {
        for (const r of placements.institutes[nirfId]?.rows ?? []) {
          const k = `${r.program}|${r.academic_year}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const pct = r.graduating && r.placed !== null ? Math.round((r.placed / r.graduating) * 1000) / 10 : null;
          insertPlacement.run(instituteIds.get(key), 2000 + Number(r.academic_year.slice(5)), r.academic_year, r.program,
            r.graduating, r.placed, r.higher_studies, pct,
            // A median of 0 means nobody in the batch was placed, not a salary of zero.
            r.placed ? r.median_salary : null);
          placementCount++;
        }
      }
      if (seen.size) placementInstitutes++;
    }
    report.push(`NIRF: ${placementCount} placement records for ${placementInstitutes} institutes`);

  })();

  for (const line of report) logger.info(line);
  logger.success('Seed complete');
};

try {
  seed();
} catch (e) {
  logger.error(`Seed failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
