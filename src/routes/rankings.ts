import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';

const rankingsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  category: z.enum(['engineering', 'medical', 'overall', 'pharmacy', 'management']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/rankings/nirf', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = rankingsQuerySchema.parse(request.query);
      
      let year = query.year;
      if (!year) {
        const row = db.prepare(`SELECT MAX(year) as max_year FROM nirf_rankings`).get() as any;
        year = row?.max_year || new Date().getFullYear();
      }
      
      let sql = `
        SELECT n.*, i.name as institute_name, i.short_name, i.type, i.state 
        FROM nirf_rankings n
        JOIN institutes i ON n.institute_id = i.id
        WHERE n.year = ?
      `;
      const params: any[] = [year];
      
      if (query.category) {
        sql += ` AND n.category = ?`;
        params.push(query.category);
      }
      
      sql += ` ORDER BY n.rank ASC LIMIT ? OFFSET ?`;
      params.push(query.limit, query.offset);
      
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
