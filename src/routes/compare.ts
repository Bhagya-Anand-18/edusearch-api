import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import {
  instituteSchema,
  programSchema,
  nirfRankingSchema,
  placementSchema,
  objectResponse,
  errorResponse,
} from '../schemas/common.js';

const compareQuerySchema = z.object({
  ids: z.string().min(1), // comma-separated institute IDs
});

const routeSchema = {
  tags: ['Compare'],
  summary: 'Compare 2-5 institutes side by side',
  description:
    'Takes a comma-separated list of institute IDs and returns, for each one, its details, its programs, its latest NIRF ranking and its latest placement record — the data a comparison table needs, in one call. Between 2 and 5 IDs are required.',
  querystring: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: {
        type: 'string',
        minLength: 1,
        description: 'Comma-separated institute IDs, between 2 and 5 of them, e.g. "1,2,3".',
      },
    },
  },
  response: {
    200: objectResponse(
      {
        type: 'object',
        properties: {
          comparison: {
            type: 'array',
            description: 'One entry per institute found, in the order the database returned them.',
            items: {
              type: 'object',
              properties: {
                institute: instituteSchema,
                programs: { type: 'array', items: programSchema, description: 'Every program the institute offers.' },
                latest_nirf: { ...nirfRankingSchema, nullable: true, description: 'Most recent NIRF ranking, or null if unranked.' },
                latest_placement: { ...placementSchema, nullable: true, description: 'Most recent placement record, or null if none.' },
              },
            },
          },
          count: { type: 'integer', description: 'Number of institutes in the comparison.' },
        },
      },
      'Side-by-side comparison of the requested institutes.'
    ),
    400: errorResponse('Fewer than 2 or more than 5 valid IDs were supplied.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
    404: errorResponse('None of the supplied IDs matched an institute.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/compare', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { ids } = compareQuerySchema.parse(request.query);
      const idList = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

      if (idList.length < 2 || idList.length > 5) {
        return reply.status(400).send(errorEnvelope(400, 'Provide 2-5 institute IDs separated by commas'));
      }

      const placeholders = idList.map(() => '?').join(',');

      const institutes = db.prepare(`SELECT * FROM institutes WHERE id IN (${placeholders})`).all(...idList);

      if (institutes.length === 0) {
        return reply.status(404).send(errorEnvelope(404, 'No institutes found for the given IDs'));
      }

      const programs = db.prepare(`
        SELECT p.*, i.short_name as institute_short_name 
        FROM programs p 
        JOIN institutes i ON p.institute_id = i.id 
        WHERE p.institute_id IN (${placeholders})
      `).all(...idList);

      const nirf = db.prepare(`
        SELECT n.*, i.short_name as institute_short_name 
        FROM nirf_rankings n 
        JOIN institutes i ON n.institute_id = i.id 
        WHERE n.institute_id IN (${placeholders})
        AND n.year = (SELECT MAX(year) FROM nirf_rankings)
      `).all(...idList);

      const placements = db.prepare(`
        SELECT pl.*, i.short_name as institute_short_name 
        FROM placements pl 
        JOIN institutes i ON pl.institute_id = i.id 
        WHERE pl.institute_id IN (${placeholders})
        AND pl.year = (SELECT MAX(year) FROM placements)
      `).all(...idList);

      // Build comparison object grouped by institute
      const comparison = (institutes as any[]).map((inst: any) => ({
        institute: inst,
        programs: (programs as any[]).filter((p: any) => p.institute_id === inst.id),
        latest_nirf: (nirf as any[]).find((n: any) => n.institute_id === inst.id) || null,
        latest_placement: (placements as any[]).find((p: any) => p.institute_id === inst.id) || null,
      }));

      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle({ comparison, count: comparison.length });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
