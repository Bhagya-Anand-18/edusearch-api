import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';

const searchQuerySchema = z.object({
  q: z.string().min(1)
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/search', async (request: FastifyRequest, reply: FastifyReply) => {
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
      return { institutes, programs };
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
