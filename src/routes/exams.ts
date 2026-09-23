import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle, errorEnvelope } from '../utils/envelope.js';
import { examStatSchema, objectResponse, errorResponse } from '../schemas/common.js';

const examParamsSchema = z.object({
  exam: z.enum(['jee_main', 'jee_advanced', 'neet'])
});

const examQuerySchema = z.object({
  year: z.coerce.number().int().optional()
});

const routeSchema = {
  tags: ['Exams'],
  summary: 'Get exam statistics by year',
  description:
    'Returns registration, attendance and qualification counts plus score ranges for one exam, newest year first. Useful for showing how competitive a given year was. Add `?year=` to pin a single year.',
  params: {
    type: 'object',
    required: ['exam'],
    properties: {
      exam: {
        type: 'string',
        enum: ['jee_main', 'jee_advanced', 'neet'],
        description: 'Exam to fetch statistics for.',
      },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'Restrict to a single exam year, e.g. 2025.' },
    },
  },
  response: {
    200: objectResponse(
      { type: 'array', items: examStatSchema, description: 'Statistics per year, newest first.' },
      'Exam statistics for the requested exam.'
    ),
    400: errorResponse('The exam name or year was invalid.'),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/exams/:exam/stats', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { exam } = examParamsSchema.parse(request.params);
      const { year } = examQuerySchema.parse(request.query);
      
      let sql = `SELECT * FROM exam_stats WHERE exam = ?`;
      const params: any[] = [exam];
      
      if (year) {
        sql += ` AND year = ?`;
        params.push(year);
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
}
