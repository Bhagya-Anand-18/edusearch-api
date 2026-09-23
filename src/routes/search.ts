import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import { instituteSchema, programSchema, objectResponse, errorResponse } from '../schemas/common.js';

const searchQuerySchema = z.object({
  q: z.string().min(1)
});

const routeSchema = {
  tags: ['Search'],
  summary: 'Search institutes and programs by name',
  description:
    'A single free-text lookup across institutes (name, abbreviation, city) and programs (name). Returns up to 20 of each, which makes it a good fit for autocomplete and search boxes.',
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1, description: 'Search text, e.g. "bombay" or "computer science".' },
    },
  },
  response: {
    200: objectResponse(
      {
        type: 'object',
        properties: {
          institutes: { type: 'array', items: instituteSchema, description: 'Up to 20 matching institutes.' },
          programs: { type: 'array', items: programSchema, description: 'Up to 20 matching programs, with their institute.' },
        },
      },
      'Institutes and programs matching the search text.'
    ),
    400: errorResponse('The q parameter was missing or empty.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/search', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { q } = searchQuerySchema.parse(request.query);
      const searchPattern = `%${q}%`;
      
      const institutes = db.prepare(`
        SELECT id, name, short_name, type, city, state, nirf_rank
        FROM institutes 
        WHERE name LIKE ? OR short_name LIKE ? OR city LIKE ?
        LIMIT 20
      `).all(searchPattern, searchPattern, searchPattern);
      
      const programs = db.prepare(`
        SELECT p.id, p.name, p.degree, i.name as institute_name, i.short_name as institute_short_name
        FROM programs p
        JOIN institutes i ON p.institute_id = i.id
        WHERE p.name LIKE ?
        LIMIT 20
      `).all(searchPattern);
      
      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle({ institutes, programs });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send(errorEnvelope(400, 'Validation Error', error.errors));
      return reply.status(500).send(errorEnvelope(500, 'Internal Server Error'));
    }
  });
}
