import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';

const cutoffsQuerySchema = z.object({
  exam: z.enum(['jee_advanced', 'jee_main', 'neet']).optional(),
  year: z.coerce.number().int().optional(),
  category: z.string().optional(),
  gender: z.string().optional(),
  institute: z.string().optional(),
  program: z.string().optional(),
  round: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/cutoffs', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    
    try {
      const query = cutoffsQuerySchema.parse(request.query);
      
      let sql = `
        SELECT c.*, p.name as program_name, p.degree, i.name as institute_name, i.short_name as institute_short_name 
        FROM cutoffs c
        JOIN programs p ON c.program_id = p.id
        JOIN institutes i ON p.institute_id = i.id
        WHERE 1=1
      `;
      const params: any[] = [];
      
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
      if (query.gender) {
        sql += ` AND c.gender = ?`;
        params.push(query.gender);
      }
      if (query.round) {
        sql += ` AND c.round = ?`;
        params.push(query.round);
      }
      if (query.institute) {
        if (!isNaN(Number(query.institute))) {
          sql += ` AND i.id = ?`;
          params.push(Number(query.institute));
        } else {
          sql += ` AND (i.short_name = ? OR i.name LIKE ?)`;
          params.push(query.institute, `%${query.institute}%`);
        }
      }
      if (query.program) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${query.program}%`);
      }
      
      sql += ` ORDER BY c.closing_rank ASC, c.year DESC LIMIT ? OFFSET ?`;
      params.push(query.limit, query.offset);
      
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      
      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      
      return rows;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation Error', details: error.errors, statusCode: 400 });
      }
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
