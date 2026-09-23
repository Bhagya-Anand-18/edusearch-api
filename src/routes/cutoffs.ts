import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelope, errorEnvelope } from '../utils/envelope.js';
import { cutoffSchema, listResponse, errorResponse, paginationProps } from '../schemas/common.js';

const cutoffsQuerySchema = z.object({
  exam: z.enum(['jee_advanced', 'jee_main', 'neet']).optional(),
  year: z.coerce.number().int().optional(),
  category: z.string().optional(),
  gender: z.string().optional(),
  institute: z.string().optional(),
  program: z.string().optional(),
  round: z.coerce.number().int().optional(),
  quota: z.enum(['AI', 'HS', 'OS', 'GO', 'JK', 'LA', 'SO']).optional(),
  pwd: z.boolean().optional(), // Fastify has already coerced "true"/"false" per the route schema
  source: z.enum(['josaa', 'mcc_derived']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const routeSchema = {
  tags: ['Cutoffs'],
  summary: 'List JEE/NEET closing ranks',
  description:
    'Returns historical opening and closing ranks, joined with the program and institute they belong to. JEE Advanced and JEE Main cutoffs are official JoSAA figures for 2022-2025 (round 1 and the final round of each year). NEET ranges for 2022-2025 (round 1, all-India and AIIMS/JIPMER open-seat quotas, MBBS and BDS) are derived from official MCC allotment results. Every record says which in its `source` field. Combine filters freely — for example `?exam=jee_advanced&year=2025&category=general&institute=IIT Bombay&quota=AI`. Results are ordered by closing rank ascending, so the most competitive seats come first.',
  querystring: {
    type: 'object',
    properties: {
      exam: {
        type: 'string',
        enum: ['jee_advanced', 'jee_main', 'neet'],
        description: 'Restrict results to one exam.',
      },
      year: { type: 'integer', description: 'Admission year, e.g. 2025.' },
      category: { type: 'string', description: 'Reservation category: general, obc, sc, st or ews.' },
      gender: { type: 'string', description: 'Gender pool: neutral or female.' },
      institute: {
        type: 'string',
        description: 'Institute ID, exact short name, or any part of the full name.',
      },
      program: { type: 'string', description: 'Partial program name, e.g. "Computer Science".' },
      round: { type: 'integer', description: 'Counselling round number.' },
      quota: {
        type: 'string',
        enum: ['AI', 'HS', 'OS', 'GO', 'JK', 'LA', 'SO'],
        description: 'Quota: AI (all India), HS (home state), OS (other state), GO/JK/LA (Goa, Jammu and Kashmir, Ladakh), or SO (AIIMS/JIPMER open seats, NEET only).',
      },
      pwd: { type: 'boolean', description: 'true for only PwD-reserved seats, false to exclude them.' },
      source: {
        type: 'string',
        enum: ['josaa', 'mcc_derived'],
        description: 'Restrict to JoSAA records (JEE) or MCC-derived records (NEET).',
      },
      ...paginationProps,
    },
  },
  response: {
    200: listResponse(cutoffSchema, 'Matching cutoff records with pagination metadata.'),
    400: errorResponse('One or more query parameters were invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/cutoffs', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();

    try {
      const query = cutoffsQuerySchema.parse(request.query);

      const from = `
        FROM cutoffs c
        JOIN programs p ON c.program_id = p.id
        JOIN institutes i ON p.institute_id = i.id
      `;

      // Built once and shared by the page query and the count query, so
      // meta.total always reflects the same filters as the returned rows.
      let where = ` WHERE 1=1`;
      const params: any[] = [];

      if (query.exam) {
        where += ` AND c.exam = ?`;
        params.push(query.exam);
      }
      if (query.year) {
        where += ` AND c.year = ?`;
        params.push(query.year);
      }
      if (query.category) {
        where += ` AND c.category = ?`;
        params.push(query.category);
      }
      if (query.gender) {
        where += ` AND c.gender = ?`;
        params.push(query.gender);
      }
      if (query.round) {
        where += ` AND c.round = ?`;
        params.push(query.round);
      }
      if (query.quota) {
        where += ` AND c.quota = ?`;
        params.push(query.quota);
      }
      if (query.pwd !== undefined) {
        where += ` AND c.pwd = ?`;
        params.push(query.pwd ? 1 : 0);
      }
      if (query.source) {
        where += ` AND c.source = ?`;
        params.push(query.source);
      }
      if (query.institute) {
        if (!isNaN(Number(query.institute))) {
          where += ` AND i.id = ?`;
          params.push(Number(query.institute));
        } else {
          where += ` AND (i.short_name = ? OR i.name LIKE ?)`;
          params.push(query.institute, `%${query.institute}%`);
        }
      }
      if (query.program) {
        where += ` AND p.name LIKE ?`;
        params.push(`%${query.program}%`);
      }

      const rows = db.prepare(`
        SELECT c.*, p.name as program_name, p.degree, i.name as institute_name, i.short_name as institute_short_name
        ${from}${where}
        ORDER BY c.closing_rank ASC, c.year DESC
        LIMIT ? OFFSET ?
      `).all(...params, query.limit, query.offset);

      const totalRow = db.prepare(`SELECT COUNT(*) as total ${from}${where}`).get(...params) as any;

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);

      return envelope(rows as any[], { limit: query.limit, offset: query.offset, total: totalRow?.total ?? rows.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      }
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
