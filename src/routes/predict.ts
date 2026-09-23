import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import { canonicalState } from '../utils/states.js';
import { predictionSchema, objectResponse, errorResponse } from '../schemas/common.js';

const predictQuerySchema = z.object({
  exam: z.enum(['jee_advanced', 'jee_main', 'neet']),
  rank: z.coerce.number().int().min(1),
  category: z.enum(['general', 'obc', 'sc', 'st', 'ews']),
  gender: z.enum(['male', 'female']).optional(),
  home_state: z.string().optional(),
  pwd: z.boolean().optional(), // Fastify has already coerced "true"/"false" per the route schema
  preferred_state: z.string().optional(),
  preferred_type: z.string().optional(),
  preferred_branch: z.string().optional(),
});

/** State whose domicile candidates are eligible for each special JoSAA quota. */
const SPECIAL_QUOTA_STATES: Record<string, string> = { GO: 'Goa', JK: 'Jammu and Kashmir', LA: 'Ladakh' };

/** A closing rank that moves by more than this fraction year over year counts as a trend. */
const TREND_THRESHOLD = 0.05;

const routeSchema = {
  tags: ['Predict'],
  summary: 'Predict which colleges a rank can get into',
  description:
    'The flagship endpoint. Give it an exam, a rank and a category, and it returns every program the candidate has a realistic shot at, each with a confidence percentage derived from the most recent year of opening and closing ranks, plus a year-over-year trend. Each program appears once, scored on the round, quota and seat pool that give the candidate the best chance. Results are sorted by confidence, then by NIRF rank.\n\n' +
    'JEE predictions use official JoSAA cutoffs. NEET predictions use synthetic sample cutoffs and say so in each result\'s `source` field.\n\n' +
    'Pass `home_state` to include home-state (HS) quota seats at institutes in that state; without it, predictions use all-India (AI) and other-state (OS) seats only. Home-state eligibility is matched on the institute\'s own state; a few institutes extend their HS quota to neighbouring states or union territories, which this does not model.',
  querystring: {
    type: 'object',
    required: ['exam', 'rank', 'category'],
    properties: {
      exam: {
        type: 'string',
        enum: ['jee_advanced', 'jee_main', 'neet'],
        description: 'Exam the rank comes from.',
      },
      rank: {
        type: 'integer',
        minimum: 1,
        description: 'The candidate\'s rank, e.g. 500. Use the common rank list (CRL) rank for general, and the category rank for ews, obc, sc and st — that is how JoSAA publishes category cutoffs.',
      },
      category: {
        type: 'string',
        enum: ['general', 'obc', 'sc', 'st', 'ews'],
        description: 'Reservation category the rank belongs to.',
      },
      gender: {
        type: 'string',
        enum: ['male', 'female'],
        description: 'Include female-only seats when set to female.',
      },
      home_state: {
        type: 'string',
        description: 'The candidate\'s state of domicile, e.g. "Kerala". Enables home-state quota seats in that state, and the Goa, Jammu and Kashmir or Ladakh quotas where they apply.',
      },
      pwd: {
        type: 'boolean',
        description: 'Set to true for candidates eligible for PwD-reserved seats; they are then considered alongside regular seats. For PwD seats the rank is the PwD rank.',
      },
      preferred_state: { type: 'string', description: 'Only institutes in this state.' },
      preferred_type: { type: 'string', description: 'Only institutes of this category: IIT, NIT, IIIT, GFTI or Medical.' },
      preferred_branch: { type: 'string', description: 'Only programs matching this text, e.g. "Computer Science".' },
    },
  },
  response: {
    200: objectResponse(
      {
        type: 'object',
        properties: {
          predictions: {
            type: 'array',
            items: predictionSchema,
            description: 'Programs the rank has a chance at, most likely first.',
          },
          query: {
            type: 'object',
            description: 'The inputs the prediction was computed from.',
            additionalProperties: true,
            properties: {
              exam: { type: 'string', description: 'Exam that was queried.' },
              rank: { type: 'integer', description: 'Rank that was queried.' },
              category: { type: 'string', description: 'Category that was queried.' },
              year: { type: 'integer', description: 'Admission year whose cutoffs the predictions are based on.' },
              home_state: { type: 'string', nullable: true, description: 'Home state used for quota eligibility, normalized.' },
            },
          },
          total_predictions: { type: 'integer', description: 'Number of predictions returned.' },
        },
      },
      'Ranked admission predictions for the given rank.'
    ),
    400: errorResponse('A required parameter was missing or invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/predict', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = predictQuerySchema.parse(request.query);
      const homeState = canonicalState(query.home_state);

      const maxYearRow = db.prepare(`SELECT MAX(year) as max_year FROM cutoffs WHERE exam = ?`).get(query.exam) as any;
      const latestYear = maxYearRow?.max_year || new Date().getFullYear();

      let sql = `
        SELECT
          c.id as cutoff_id, c.opening_rank, c.closing_rank, c.year, c.round, c.is_final_round,
          c.quota, c.category, c.pwd, c.gender, c.source,
          p.id as program_id, p.name as program_name, p.degree,
          i.id as institute_id, i.name as institute_name, i.short_name, i.type, i.state, i.nirf_rank
        FROM cutoffs c
        JOIN programs p ON c.program_id = p.id
        JOIN institutes i ON p.institute_id = i.id
        WHERE c.exam = ? AND c.year = ? AND c.category = ?
        AND c.closing_rank >= ?
      `;
      const params: any[] = [query.exam, latestYear, query.category, query.rank / 1.1];

      if (query.gender === 'female') {
        sql += ` AND c.gender IN ('neutral', 'female')`;
      } else {
        sql += ` AND c.gender = 'neutral'`;
      }

      // PwD candidates compete for both PwD-reserved and regular seats.
      sql += query.pwd ? ` AND c.pwd IN (0, 1)` : ` AND c.pwd = 0`;

      // Quota eligibility. All-India seats are open to everyone. Other-state seats
      // are open to anyone not domiciled in the institute's state. Home-state and
      // the special Goa/J&K/Ladakh quotas need a matching home_state.
      sql += ` AND (
        c.quota = 'AI'
        OR (c.quota = 'OS' AND (? IS NULL OR i.state IS NULL OR i.state != ?))
        OR (c.quota = 'HS' AND i.state = ?)
        OR (c.quota IN ('GO', 'JK', 'LA') AND ? = CASE c.quota ${Object.entries(SPECIAL_QUOTA_STATES).map(([q, st]) => `WHEN '${q}' THEN '${st}'`).join(' ')} END)
      )`;
      params.push(homeState, homeState, homeState, homeState);

      if (query.preferred_state) {
        sql += ` AND i.state = ?`;
        params.push(canonicalState(query.preferred_state));
      }
      if (query.preferred_type) {
        sql += ` AND i.type = ?`;
        params.push(query.preferred_type);
      }
      if (query.preferred_branch) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${query.preferred_branch}%`);
      }

      const cutoffs = db.prepare(sql).all(...params) as any[];

      // Compare against the same seat a year earlier: same quota, pool and PwD
      // status, and the same round — or, for a final round, last year's final
      // round, since the number of rounds varies (2024 had five, 2025 six).
      const prevYearStmt = db.prepare(`
        SELECT closing_rank FROM cutoffs
        WHERE program_id = ? AND exam = ? AND category = ? AND year = ?
          AND quota = ? AND pwd = ? AND gender = ?
          AND (CASE WHEN ? = 1 THEN is_final_round = 1 ELSE round = ? END)
        LIMIT 1
      `);

      const scored = cutoffs.map(c => {
        let confidence = 0;
        const opening = c.opening_rank || 1;
        const closing = c.closing_rank || 1;
        const r = query.rank;

        if (r < opening) {
          confidence = 95;
        } else if (r >= opening && r <= closing) {
          confidence = 50 + 40 * ((closing - r) / (closing - opening + 1));
        } else if (r > closing && r <= closing * 1.1) {
          confidence = 20 + 20 * ((closing * 1.1 - r) / (closing * 0.1));
        } else {
          confidence = 0;
        }

        let trend = 'stable';
        const prev = prevYearStmt.get(
          c.program_id, query.exam, query.category, latestYear - 1,
          c.quota, c.pwd, c.gender, c.is_final_round, c.round
        ) as any;

        if (prev?.closing_rank) {
          const change = (closing - prev.closing_rank) / prev.closing_rank;
          if (change < -TREND_THRESHOLD) {
            trend = 'declining';
            confidence -= 5;
          } else if (change > TREND_THRESHOLD) {
            trend = 'improving';
            confidence += 5;
          }
        }

        return {
          institute: { id: c.institute_id, name: c.institute_name, short_name: c.short_name, type: c.type, state: c.state },
          program: { id: c.program_id, name: c.program_name, degree: c.degree },
          confidence_pct: Math.max(0, Math.min(99, Math.round(confidence))),
          last_year_closing_rank: closing,
          round: c.round,
          quota: c.quota,
          pwd: c.pwd === 1,
          seat_pool: c.gender === 'female' ? 'female_only' : 'gender_neutral',
          source: c.source,
          trend,
          nirf_rank: c.nirf_rank || 9999
        };
      }).filter(r => r.confidence_pct > 0);

      // A program has several cutoff rows (rounds, quotas, seat pools). Report each
      // program once, using whichever row gives the candidate the best chance.
      const bestByProgram = new Map<number, (typeof scored)[number]>();
      for (const r of scored) {
        const current = bestByProgram.get(r.program.id);
        const better = !current
          || r.confidence_pct > current.confidence_pct
          // On a tie, prefer the later round: its closing rank is the more definitive one.
          || (r.confidence_pct === current.confidence_pct && r.round > current.round);
        if (better) bestByProgram.set(r.program.id, r);
      }
      const results = [...bestByProgram.values()];

      results.sort((a, b) => {
        if (b.confidence_pct !== a.confidence_pct) {
          return b.confidence_pct - a.confidence_pct;
        }
        return a.nirf_rank - b.nirf_rank;
      });

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle({
        predictions: results,
        query: { exam: query.exam, rank: query.rank, category: query.category, year: latestYear, home_state: homeState },
        total_predictions: results.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
