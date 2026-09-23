import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelope, errorEnvelope } from '../utils/envelope.js';
import { nirfRankingSchema, listResponse, errorResponse, paginationProps } from '../schemas/common.js';

const rankingsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  category: z.enum(['engineering', 'medical', 'overall', 'pharmacy', 'management']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const routeSchema = {
  tags: ['Rankings'],
  summary: 'List NIRF rankings',
  description:
    'Returns NIRF rankings with the overall score and every published sub-score (teaching, research, graduation outcomes, outreach, perception), joined with institute details. Omit `year` to get the most recent ranking year on record. Results are ordered by rank ascending.',
  querystring: {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'Ranking year. Defaults to the latest year available.' },
      category: {
        type: 'string',
        enum: ['engineering', 'medical', 'overall', 'pharmacy', 'management'],
        description: 'Ranking category to return.',
      },
      ...paginationProps,
    },
  },
  response: {
    200: listResponse(nirfRankingSchema, 'Matching NIRF rankings with pagination metadata.'),
    400: errorResponse('One or more query parameters were invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/rankings/nirf', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = rankingsQuerySchema.parse(request.query);

      let year = query.year;
      if (!year) {
        const row = db.prepare(`SELECT MAX(year) as max_year FROM nirf_rankings`).get() as any;
        year = row?.max_year || new Date().getFullYear();
      }

      const from = `
        FROM nirf_rankings n
        JOIN institutes i ON n.institute_id = i.id
      `;

      // Shared by the page query and the count query so meta.total matches the filters.
      let where = ` WHERE n.year = ?`;
      const params: any[] = [year];

      if (query.category) {
        where += ` AND n.category = ?`;
        params.push(query.category);
      }

      const rows = db.prepare(`
        SELECT n.*, i.name as institute_name, i.short_name, i.type, i.state
        ${from}${where}
        ORDER BY n.rank ASC
        LIMIT ? OFFSET ?
      `).all(...params, query.limit, query.offset);

      const totalRow = db.prepare(`SELECT COUNT(*) as total ${from}${where}`).get(...params) as any;

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelope(rows as any[], { limit: query.limit, offset: query.offset, total: totalRow?.total ?? rows.length });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
