import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';

const examParamsSchema = z.object({
  exam: z.enum(['jee_main', 'jee_advanced', 'neet'])
});

const examQuerySchema = z.object({
  year: z.coerce.number().int().optional()
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/exams/:exam/stats', async (request: FastifyRequest, reply: FastifyReply) => {
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
      return rows;
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
