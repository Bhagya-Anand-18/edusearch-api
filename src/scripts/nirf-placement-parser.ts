/**
 * Parses the "Placement & Higher Studies" tables from the text of a NIRF
 * institute data report (the per-institute PDF linked from each ranking).
 *
 * Each program-duration block (e.g. "UG [4 Years Program(s)]") lists the three
 * most recent graduating batches. The report gives only the median salary: no
 * average or highest package, and no recruiter names.
 */

export interface PlacementRow {
  /** Label for the program block, e.g. "UG 4-year programs". */
  program: string;
  /** Academic year the batch graduated, e.g. "2023-24". */
  academic_year: string;
  graduating: number | null;
  placed: number | null;
  /** Median annual salary of placed graduates in INR. */
  median_salary: number | null;
  higher_studies: number | null;
}

// Not anchored: the first block's header is glued onto the section title in the extracted text.
const HEADER = /(UG|PG|PG-Integrated) \[(\d+(?:\.\d+)?) Years? Program\(s\)\]: Placement & higher studies for previous 3 years/i; // 2023 reports capitalize "Higher Studies"
const ACADEMIC_YEAR = /^\d{4}-\d{2}$/;

/** "1700000(SeventeenLaksh)" -> 1700000; "-", "NA" or blank -> null. */
const toNumber = (raw: string): number | null => {
  const m = raw.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/**
 * Splits a block's body into cell tokens. A salary cell carries its amount in
 * words in parentheses, which can wrap onto following lines; those lines are
 * joined back into one token.
 */
function tokens(lines: string[]): string[] {
  const out: string[] = [];
  let open = '';
  for (const line of lines) {
    if (open) {
      open += line;
      if (line.includes(')')) { out.push(open); open = ''; }
      continue;
    }
    if (line.includes('(') && !line.includes(')')) { open = line; continue; }
    out.push(line);
  }
  if (open) out.push(open);
  return out;
}

export function parsePlacements(text: string): PlacementRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: PlacementRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(HEADER);
    if (!header) continue;
    const program = `${header[1]} ${header[2]}-year programs`;

    // Column headings run until "Studies" (the last heading); the lateral-entry
    // column exists only in some blocks, which changes the row width.
    let j = i + 1;
    let headingText = '';
    while (j < lines.length && lines[j] !== 'Studies') headingText += ` ${lines[j++]}`;
    const hasLateral = /Lateral entry/i.test(headingText);
    const width = hasLateral ? 10 : 8;

    let end = j + 1;
    while (end < lines.length && !HEADER.test(lines[end]) && !/^(Ph\.D|Sanctioned|Financial Resources)/.test(lines[end])) end++;
    const cells = tokens(lines.slice(j + 1, end));

    for (let k = 0; k + width <= cells.length && rows.filter((r) => r.program === program).length < 3; k += width) {
      const row = cells.slice(k, k + width);
      // [intake yr, intake, admitted, (lateral yr, lateral,) grad yr, graduating, placed, median, higher studies]
      const tail = row.slice(width - 5);
      if (!ACADEMIC_YEAR.test(row[0]) || !ACADEMIC_YEAR.test(tail[0])) break;
      rows.push({
        program,
        academic_year: tail[0],
        graduating: toNumber(tail[1]),
        placed: toNumber(tail[2]),
        median_salary: toNumber(tail[3]),
        higher_studies: toNumber(tail[4]),
      });
    }
    i = end - 1;
  }
  return rows;
}
