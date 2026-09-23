/**
 * Reusable JSON Schema fragments for Fastify route schemas.
 *
 * These serve double duty: Fastify uses them to serialize responses, and
 * @fastify/swagger turns them into the OpenAPI spec that RapidAPI imports.
 * Every entity object sets `additionalProperties: true` so adding a column to
 * a table never silently drops it from a response, and nullable columns are
 * marked `nullable: true` so SQLite NULLs survive serialization.
 */

type Props = Record<string, any>;

const int = (description: string) => ({ type: 'integer', description });
const intNull = (description: string) => ({ type: 'integer', nullable: true, description });
const numNull = (description: string) => ({ type: 'number', nullable: true, description });
const str = (description: string) => ({ type: 'string', description });
const bool = (description: string) => ({ type: 'boolean', description });
const strNull = (description: string) => ({ type: 'string', nullable: true, description });

const source = (official: string) =>
  ({ type: 'string', description: `Where this record comes from: "${official}" for official data, or "synthetic" for generated sample data.` });

const entity = (properties: Props) => ({
  type: 'object',
  additionalProperties: true,
  properties,
});

export const instituteSchema = entity({
  id: int('Unique institute ID. Use this with /api/v1/compare and /api/v1/colleges/{id}.'),
  name: str('Full official name, e.g. "Indian Institute of Technology Bombay".'),
  short_name: strNull('Common abbreviation, e.g. "IIT Bombay".'),
  type: strNull('Institute category: IIT, NIT, IIIT, GFTI or Medical.'),
  state: strNull('State the institute is located in.'),
  city: strNull('City the institute is located in.'),
  nirf_rank: intNull('Most recent official NIRF rank in its category, or null if outside the published list.'),
  nirf_score: numNull('Most recent official NIRF score out of 100.'),
  nirf_category: strNull('NIRF ranking category the rank belongs to: engineering or medical.'),
  website: strNull('Official website URL.'),
  established_year: intNull('Year the institute was founded.'),
});

export const programSchema = entity({
  id: int('Unique program ID.'),
  institute_id: int('ID of the institute offering this program.'),
  name: str('Program name, e.g. "Computer Science and Engineering".'),
  degree: strNull('Degree awarded, e.g. "B.Tech", "MBBS".'),
  duration_years: intNull('Program length in years.'),
  branch_code: strNull('Counselling branch code, where one exists.'),
  institute_name: strNull('Full institute name, joined in by /api/v1/search.'),
  institute_short_name: strNull('Institute abbreviation, joined in by /api/v1/search and /api/v1/compare.'),
});

export const cutoffSchema = entity({
  id: int('Unique cutoff record ID.'),
  program_id: int('ID of the program this cutoff belongs to.'),
  exam: strNull('Exam the cutoff comes from: jee_advanced, jee_main or neet.'),
  year: intNull('Admission year the cutoff applies to.'),
  round: intNull('Counselling round number.'),
  is_final_round: bool("True when this is the year's last counselling round, whose closing rank is the definitive one."),
  quota: strNull('JoSAA quota: AI (all India), HS (home state), OS (other state), or GO/JK/LA (Goa, Jammu and Kashmir, Ladakh).'),
  category: strNull('Reservation category: general, ews, obc, sc or st.'),
  pwd: bool('True for seats reserved for persons with disabilities.'),
  gender: strNull('Gender pool: neutral or female.'),
  opening_rank: intNull('Best rank admitted in this round. Category rank for non-general categories; for PwD seats (pwd: true), the rank on the separate PwD rank list.'),
  closing_rank: intNull('Last rank admitted in this round — the number most consumers filter on. Category rank for non-general categories; for PwD seats (pwd: true), the rank on the separate PwD rank list.'),
  source: source('josaa'),
  program_name: strNull('Program name, joined in for convenience.'),
  degree: strNull('Degree awarded, joined in for convenience.'),
  institute_name: strNull('Full institute name, joined in for convenience.'),
  institute_short_name: strNull('Institute abbreviation, joined in for convenience.'),
});

export const nirfRankingSchema = entity({
  id: int('Unique ranking record ID.'),
  institute_id: int('ID of the ranked institute.'),
  year: intNull('Ranking year.'),
  category: strNull('Ranking category: engineering, medical, overall, pharmacy or management.'),
  rank: intNull('Position in the ranking for that year and category.'),
  score: numNull('Overall NIRF score out of 100.'),
  tlr_score: numNull('Teaching, Learning and Resources sub-score.'),
  rpc_score: numNull('Research and Professional Practice sub-score.'),
  go_score: numNull('Graduation Outcomes sub-score.'),
  oi_score: numNull('Outreach and Inclusivity sub-score.'),
  perception_score: numNull('Perception sub-score.'),
  nirf_id: strNull("NIRF's own identifier for the institute, e.g. IR-E-U-0456."),
  source: source('nirf'),
  institute_name: strNull('Full institute name, joined in for convenience.'),
  short_name: strNull('Institute abbreviation, joined in for convenience.'),
  type: strNull('Institute category, joined in for convenience.'),
  state: strNull('Institute state, joined in for convenience.'),
});

export const placementSchema = entity({
  id: int('Unique placement record ID.'),
  institute_id: int('ID of the institute.'),
  year: intNull('Placement season year.'),
  program_or_dept: strNull('Program or department the figures cover.'),
  students_placed_pct: numNull('Share of eligible students placed, as a percentage.'),
  median_salary: numNull('Median annual package in INR.'),
  average_salary: numNull('Average annual package in INR.'),
  highest_salary: numNull('Highest annual package in INR.'),
  top_recruiters: strNull('JSON-encoded array of recruiter names.'),
  source: str('Where this record comes from. Currently always "synthetic" (generated sample data): no official placement source is imported yet.'),
});

export const examStatSchema = entity({
  id: int('Unique exam statistic record ID.'),
  exam: strNull('Exam identifier: jee_main, jee_advanced or neet.'),
  year: intNull('Exam year.'),
  total_registered: intNull('Candidates who registered.'),
  total_appeared: intNull('Candidates who sat the exam.'),
  total_qualified: intNull('Candidates who qualified.'),
  max_score: numNull('Highest score recorded.'),
  min_qualifying_score: numNull('Minimum qualifying score.'),
  avg_score: numNull('Average score across candidates.'),
  source: str('Where this record comes from. Currently always "synthetic" (generated sample data): no official exam statistics are imported yet.'),
});

export const predictionSchema = entity({
  institute: instituteSchema,
  program: programSchema,
  confidence_pct: int('Estimated chance of admission, 0-99, from the rank against historical opening and closing ranks. Each program appears once, scored on its most favourable round and seat pool.'),
  last_year_closing_rank: intNull('Closing rank in the most recent year on record.'),
  round: intNull('Counselling round the closing rank comes from.'),
  quota: strNull('Quota the prediction is based on: AI, HS, OS, GO, JK or LA.'),
  pwd: bool('True when the prediction is based on a PwD-reserved seat.'),
  seat_pool: str('Seat pool the prediction is based on: gender_neutral, or female_only when gender=female gives a better chance.'),
  source: source('josaa'),
  trend: str('How the closing rank moved against the same round, quota and pool a year earlier, from the candidate\'s point of view: improving (closing rank rose more than 5%, so easier), declining (fell more than 5%, so harder) or stable.'),
  nirf_rank: int('NIRF rank used as the tie-breaker when confidence is equal. 9999 means unranked.'),
});

const metaSchema = {
  type: 'object',
  description: 'Pagination metadata.',
  properties: {
    total: int('Total records matching the filters, ignoring limit and offset.'),
    limit: int('Maximum records returned in this response.'),
    offset: int('Number of records skipped.'),
    has_more: { type: 'boolean', description: 'True when more records remain beyond this page.' },
  },
};

/** Response envelope for paginated list endpoints. */
export const listResponse = (items: any, description: string) => ({
  description,
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Always true on a successful response.' },
    data: { type: 'array', items, description: 'The matching records.' },
    meta: metaSchema,
  },
});

/** Response envelope for endpoints returning a single object. */
export const objectResponse = (data: any, description: string) => ({
  description,
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Always true on a successful response.' },
    data,
  },
});

export const errorResponse = (description: string) => ({
  description,
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Always false on an error response.' },
    error: str('Human-readable description of what went wrong.'),
    statusCode: int('HTTP status code, repeated in the body for convenience.'),
    details: {
      type: 'array',
      nullable: true,
      description: 'Per-field validation problems, present on 400 responses.',
      items: { type: 'object', additionalProperties: true },
    },
  },
});

/** Shared pagination query parameters. */
export const paginationProps = {
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 200,
    default: 50,
    description: 'Maximum records to return (1-200).',
  },
  offset: {
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Records to skip, for paging through results.',
  },
};
