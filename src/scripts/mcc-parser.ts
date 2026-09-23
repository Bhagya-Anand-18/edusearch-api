/**
 * Parses an MCC NEET-UG "Final Result" allotment PDF (as extracted text) into
 * per-seat-group rank ranges.
 *
 * MCC publishes one row per allotted candidate, not a cutoff table: serial
 * number, NEET all-India rank, allotted quota, allotted institute (name and
 * postal address, often wrapped over several lines), course, allotted category,
 * candidate category and remarks. Opening and closing ranks are derived here as
 * the best and worst rank allotted to each (institute, course, quota, category,
 * PwD, gender) group.
 *
 * Only the all-India quota (AI) and the AIIMS/JIPMER open-seat quota (SO) for
 * MBBS and BDS are kept: those are the seats open to every NEET candidate on
 * rank. Deemed/paid, NRI, university-internal and minority quotas are skipped.
 */

export interface MccGroup {
  /** Institute text as MCC prints it: name followed by postal address. */
  institute: string;
  course: 'MBBS' | 'BDS';
  quota: 'AI' | 'SO';
  category: string;
  pwd: boolean;
  gender: 'neutral' | 'female';
  opening_rank: number;
  closing_rank: number;
  /** Candidates allotted to this group in the round. */
  allotments: number;
}

const QUOTA_PREFIXES: [string, MccGroup['quota']][] = [
  ['All India ', 'AI'],
  ['Open Seat Quota ', 'SO'],
];

const CATEGORIES: Record<string, string> = { Open: 'general', EWS: 'ews', OBC: 'obc', SC: 'sc', ST: 'st' };

// Ranks are integers, occasionally with a tie-break suffix ("1(A)") or a half ("13767.5").
const RANK = /^(\d+(?:\.\d+)?)(?:\([A-Z]\))?$/;
const FEMALE_ONLY = /\s*\(Female Seat only\s*\)\s*$/i;

export interface ParseResult {
  groups: MccGroup[];
  records: number;
  kept: number;
  skipped: Record<string, number>;
}

export function parseMccAllotments(text: string): ParseResult {
  const lines = text.split('\n').map((l) => l.trim());

  // A record starts at its serial number followed by a rank. Serial numbers run
  // 1, 2, 3... so requiring the next expected number rejects stray numerals.
  const starts: number[] = [];
  let expected = 1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === String(expected) && RANK.test(lines[i + 1])) {
      starts.push(i);
      expected++;
    }
  }

  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const groups = new Map<string, MccGroup>();
  let kept = 0;

  starts.forEach((start, idx) => {
    const cells = lines.slice(start, starts[idx + 1] ?? lines.length).filter(Boolean);
    const courseAt = cells.findIndex((c, k) => k >= 2 && (c === 'MBBS' || c === 'BDS'));
    if (courseAt < 0) return skip('course other than MBBS/BDS');

    const body = cells.slice(2, courseAt).join(' ').replace(/\s+/g, ' ');
    const prefix = QUOTA_PREFIXES.find(([p]) => body.startsWith(p));
    if (!prefix) return skip('quota other than AI/SO');

    // Between the course and the "Allotted" remark sit the allotted category and
    // the candidate's own category. "Open PwD" can wrap onto two lines ("Open",
    // "PwD"), so a lone "PwD" right after the allotted category belongs to it
    // whenever a candidate category still follows.
    const remarksAt = cells.findIndex((c, k) => k > courseAt && /^Allotted/.test(c));
    const tail = cells.slice(courseAt + 1, remarksAt < 0 ? undefined : remarksAt);
    let allotted = tail[0] ?? '';
    if (tail[1] === 'PwD' && tail.length >= 3) allotted += ' PwD';
    const pwd = /\bPwD$/.test(allotted);
    const category = CATEGORIES[allotted.replace(/\s*PwD$/, '')];
    if (!category) return skip(`unknown allotted category "${allotted}"`);

    let institute = body.slice(prefix[0].length).trim();
    const gender: MccGroup['gender'] = FEMALE_ONLY.test(institute) ? 'female' : 'neutral';
    institute = institute.replace(FEMALE_ONLY, '').trim();

    const rank = Number(cells[1].match(RANK)![1]);
    const course = cells[courseAt] as MccGroup['course'];
    const key = [institute, course, prefix[1], category, pwd, gender].join('|');
    const g = groups.get(key);
    if (g) {
      g.opening_rank = Math.min(g.opening_rank, rank);
      g.closing_rank = Math.max(g.closing_rank, rank);
      g.allotments++;
    } else {
      groups.set(key, { institute, course, quota: prefix[1], category, pwd, gender, opening_rank: rank, closing_rank: rank, allotments: 1 });
    }
    kept++;
  });

  return { groups: [...groups.values()], records: starts.length, kept, skipped };
}
