import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import { predictionSchema, objectResponse, errorResponse } from '../schemas/common.js';

const predictQuerySchema = z.object({
  exam: z.enum(['jee_advanced', 'jee_main', 'neet']),
  rank: z.coerce.number().int().min(1),
  category: z.enum(['general', 'obc', 'sc', 'st', 'ews']),
  gender: z.enum(['male', 'female']).optional(),
  preferred_state: z.string().optional(),
  preferred_type: z.string().optional(),
  preferred_branch: z.string().optional(),
});


const routeSchema = {
  tags: ['Predict'],
  summary: 'Predict which colleges a rank can get into',
  description:
    'The flagship endpoint. Give it an exam, a rank and a category, and it returns every program the candidate has a realistic shot at, each with a confidence percentage derived from the most recent year of opening and closing ranks, plus a year-over-year trend. Results are sorted by confidence, then by NIRF rank. Optional filters narrow the list to a preferred state, institute type or branch.',
  querystring: {
    type: 'object',
    required: ['exam', 'rank', 'category'],
    properties: {
      exam: {
        type: 'string',
        enum: ['jee_advanced', 'jee_main', 'neet'],
        description: 'Exam the rank comes from.',
      },
      rank: { type: 'integer', minimum: 1, description: 'The candidate\'s rank in that exam, e.g. 500.' },
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
      
      const maxYearRow = db.prepare(`SELECT MAX(year) as max_year FROM cutoffs WHERE exam = ?`).get(query.exam) as any;
      const latestYear = maxYearRow?.max_year || new Date().getFullYear();
      
      let sql = `
        SELECT 
          c.id as cutoff_id, c.opening_rank, c.closing_rank, c.year, c.round, c.category, c.gender,
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
        sql += ` AND c.gender IN ('neutral', 'male')`; 
      }
      
      if (query.preferred_state) {
        sql += ` AND i.state = ?`;
        params.push(query.preferred_state);
      }
      if (query.preferred_type) {
        sql += ` AND i.type = ?`;
        params.push(query.preferred_type);
      }
      if (query.preferred_branch) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${query.preferred_branch}%`);
      }
      
      let cutoffs = db.prepare(sql).all(...params) as any[];
      
      // Compare against the same round and seat pool last year, so the trend
      // reflects a real year-over-year shift rather than a round-1 vs final-round gap.
      const prevYearStmt = db.prepare(`
        SELECT closing_rank FROM cutoffs 
        WHERE program_id = ? AND exam = ? AND category = ? AND year = ? AND round = ? AND gender = ?
        LIMIT 1
      `);
      
      const scored = cutoffs.map(c => {
        let confidence = 0;
        let opening = c.opening_rank || 1;
        let closing = c.closing_rank || 1;
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
        const prevYearCutoff = prevYearStmt.get(c.program_id, query.exam, query.category, latestYear - 1, c.round, c.gender) as any;
        
        if (prevYearCutoff) {
          const prevClosing = prevYearCutoff.closing_rank;
          if (closing < prevClosing - 50) {
            trend = 'declining';
            confidence -= 5;
          } else if (closing > prevClosing + 50) {
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
          seat_pool: c.gender === 'female' ? 'female_only' : 'gender_neutral',
          trend,
          nirf_rank: c.nirf_rank || 9999
        };
      }).filter(r => r.confidence_pct > 0);

      // A program has several cutoff rows (rounds, seat pools). Report each program
      // once, using whichever row gives the candidate the best chance.
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
      return envelopeSingle({ predictions: results, query: { exam: query.exam, rank: query.rank, category: query.category }, total_predictions: results.length });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
