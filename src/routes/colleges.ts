import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelope, envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import { canonicalState } from '../utils/states.js';
import {
  instituteSchema,
  programSchema,
  cutoffSchema,
  nirfRankingSchema,
  placementSchema,
  listResponse,
  objectResponse,
  errorResponse,
  paginationProps,
} from '../schemas/common.js';

const collegesListSchema = z.object({
  type: z.enum(['IIT', 'NIT', 'IIIT', 'GFTI', 'Medical']).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  nirf_rank_min: z.coerce.number().int().min(1).optional(),
  nirf_rank_max: z.coerce.number().int().optional(),
  has_program: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const collegeIdSchema = z.object({
  id: z.coerce.number().int()
});

const placementsQuerySchema = z.object({
  year: z.coerce.number().int().optional()
});

const cutoffsQuerySchema = z.object({
  exam: z.string().optional(),
  year: z.coerce.number().int().optional(),
  category: z.string().optional()
});

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', description: 'Institute ID, as returned by /api/v1/colleges.' },
  },
};

const listRouteSchema = {
  tags: ['Colleges'],
  summary: 'Search and filter institutes',
  description:
    'Returns institutes matching the given filters: ranked institutes first by NIRF rank, then unranked ones by name. Use it to build pickers and browse pages — for example `?type=IIT&state=Tamil Nadu` or `?nirf_rank_max=10`. The `id` on each record is what /api/v1/colleges/{id} and /api/v1/compare expect.',
  querystring: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['IIT', 'NIT', 'IIIT', 'GFTI', 'Medical'],
        description: 'Restrict to one institute category.',
      },
      state: { type: 'string', description: 'State name, e.g. "Maharashtra". Case and "&" versus "and" do not matter.' },
      city: { type: 'string', description: 'Exact city name, e.g. "Mumbai".' },
      search: { type: 'string', description: 'Partial match against the full name or abbreviation.' },
      nirf_rank_min: { type: 'integer', minimum: 1, description: 'Only institutes ranked at or below this number (worse than or equal to).' },
      nirf_rank_max: { type: 'integer', description: 'Only institutes ranked at or above this number (better than or equal to).' },
      has_program: { type: 'string', description: 'Only institutes offering a program matching this text, e.g. "Computer Science".' },
      ...paginationProps,
    },
  },
  response: {
    200: listResponse(instituteSchema, 'Matching institutes with pagination metadata.'),
    400: errorResponse('One or more query parameters were invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

const detailRouteSchema = {
  tags: ['Colleges'],
  summary: 'Get one institute in full',
  description:
    'Returns a single institute along with every program it offers, its five most recent NIRF rankings and its five most recent placement records — everything a college profile page needs in one call.',
  params: idParams,
  response: {
    200: objectResponse(
      {
        type: 'object',
        properties: {
          institute: instituteSchema,
          programs: { type: 'array', items: programSchema, description: 'Every program offered.' },
          nirf_rankings: { type: 'array', items: nirfRankingSchema, description: 'Five most recent NIRF rankings, newest first.' },
          placements: { type: 'array', items: placementSchema, description: 'Five most recent placement records, newest first.' },
        },
      },
      'The institute with its programs, rankings and placements.'
    ),
    400: errorResponse('The institute ID was not a valid integer.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
    404: errorResponse('No institute exists with that ID.'),
  },
};

const placementsRouteSchema = {
  tags: ['Colleges'],
  summary: 'Get placement records for an institute',
  description:
    'Returns placement figures — placement percentage and median, average and highest packages — for one institute, newest year first. Add `?year=` to pin a single season.\n\nPlacement figures are synthetic sample data (each record says `source: "synthetic"`) and cover 48 institutes; the rest return an empty array, which means no data rather than no placements.',
  params: idParams,
  querystring: {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'Restrict to a single placement year, e.g. 2025.' },
    },
  },
  response: {
    200: objectResponse(
      { type: 'array', items: placementSchema, description: 'Placement records, newest year first.' },
      'Placement records for the institute.'
    ),
    400: errorResponse('The institute ID or year was invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

const cutoffsRouteSchema = {
  tags: ['Colleges'],
  summary: 'Get cutoffs for one institute',
  description:
    'Returns every cutoff on record for one institute, joined with the program name, ordered by year descending then closing rank ascending. Narrow it with `exam`, `year` or `category`.',
  params: idParams,
  querystring: {
    type: 'object',
    properties: {
      exam: { type: 'string', description: 'Exam identifier: jee_advanced, jee_main or neet.' },
      year: { type: 'integer', description: 'Admission year, e.g. 2025.' },
      category: { type: 'string', description: 'Reservation category: general, obc, sc, st or ews.' },
    },
  },
  response: {
    200: objectResponse(
      { type: 'array', items: cutoffSchema, description: 'Cutoff records for the institute.' },
      'Cutoff records for the institute.'
    ),
    400: errorResponse('The institute ID or a query parameter was invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/colleges', { schema: listRouteSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = collegesListSchema.parse(request.query);

      // Shared by the page query and the count query so meta.total matches the filters.
      let where = ` WHERE 1=1`;
      const params: any[] = [];

      if (query.type) {
        where += ` AND i.type = ?`;
        params.push(query.type);
      }
      if (query.state) {
        where += ` AND i.state = ?`;
        params.push(canonicalState(query.state));
      }
      if (query.city) {
        where += ` AND i.city = ?`;
        params.push(query.city);
      }
      if (query.search) {
        where += ` AND (i.name LIKE ? OR i.short_name LIKE ?)`;
        params.push(`%${query.search}%`, `%${query.search}%`);
      }
      if (query.nirf_rank_min !== undefined) {
        where += ` AND i.nirf_rank >= ?`;
        params.push(query.nirf_rank_min);
      }
      if (query.nirf_rank_max !== undefined) {
        where += ` AND i.nirf_rank <= ?`;
        params.push(query.nirf_rank_max);
      }
      if (query.has_program) {
        where += ` AND EXISTS (SELECT 1 FROM programs p WHERE p.institute_id = i.id AND p.name LIKE ?)`;
        params.push(`%${query.has_program}%`);
      }

      const rows = db.prepare(`
        SELECT i.* FROM institutes i${where}
        ORDER BY (i.nirf_rank IS NULL), i.nirf_rank ASC, i.name ASC
        LIMIT ? OFFSET ?
      `).all(...params, query.limit, query.offset);

      const totalRow = db.prepare(`SELECT COUNT(*) as total FROM institutes i${where}`).get(...params) as any;

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelope(rows as any[], { limit: query.limit, offset: query.offset, total: totalRow?.total ?? rows.length });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });

  fastify.get('/api/v1/colleges/:id', { schema: detailRouteSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { id } = collegeIdSchema.parse(request.params);

      const institute = db.prepare(`SELECT * FROM institutes WHERE id = ?`).get(id);
      if (!institute) return reply.status(404).send(errorEnvelope(404, 'Not found'));

      const programs = db.prepare(`SELECT * FROM programs WHERE institute_id = ?`).all(id);
      const nirf_rankings = db.prepare(`SELECT * FROM nirf_rankings WHERE institute_id = ? ORDER BY year DESC LIMIT 5`).all(id);
      const placements = db.prepare(`SELECT * FROM placements WHERE institute_id = ? ORDER BY year DESC LIMIT 5`).all(id);

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle({ institute, programs, nirf_rankings, placements });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });

  fastify.get('/api/v1/colleges/:id/placements', { schema: placementsRouteSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { id } = collegeIdSchema.parse(request.params);
      const query = placementsQuerySchema.parse(request.query);

      let sql = `SELECT * FROM placements WHERE institute_id = ?`;
      const params: any[] = [id];
      if (query.year) {
        sql += ` AND year = ?`;
        params.push(query.year);
      }
      sql += ` ORDER BY year DESC`;

      const rows = db.prepare(sql).all(...params);

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle(rows);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });

  fastify.get('/api/v1/colleges/:id/cutoffs', { schema: cutoffsRouteSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { id } = collegeIdSchema.parse(request.params);
      const query = cutoffsQuerySchema.parse(request.query);

      let sql = `
        SELECT c.*, p.name as program_name, p.degree 
        FROM cutoffs c
        JOIN programs p ON c.program_id = p.id
        WHERE p.institute_id = ?
      `;
      const params: any[] = [id];

      if (query.exam) {
        sql += ` AND c.exam = ?`;
        params.push(query.exam);
      }
      if (query.year) {
        sql += ` AND c.year = ?`;
        params.push(query.year);
      }
      if (query.category) {
        sql += ` AND c.category = ?`;
        params.push(query.category);
      }
      sql += ` ORDER BY c.year DESC, c.closing_rank ASC`;

      const rows = db.prepare(sql).all(...params);

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle(rows);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
