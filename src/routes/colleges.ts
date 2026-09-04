import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';

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

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/colleges', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = collegesListSchema.parse(request.query);
      let sql = `SELECT i.* FROM institutes i WHERE 1=1`;
      const params: any[] = [];
      
      if (query.type) {
        sql += ` AND i.type = ?`;
        params.push(query.type);
      }
      if (query.state) {
        sql += ` AND i.state = ?`;
        params.push(query.state);
      }
      if (query.city) {
        sql += ` AND i.city = ?`;
        params.push(query.city);
      }
      if (query.search) {
        sql += ` AND (i.name LIKE ? OR i.short_name LIKE ?)`;
        params.push(`%${query.search}%`, `%${query.search}%`);
      }
      if (query.nirf_rank_min !== undefined) {
        sql += ` AND i.nirf_rank >= ?`;
        params.push(query.nirf_rank_min);
      }
      if (query.nirf_rank_max !== undefined) {
        sql += ` AND i.nirf_rank <= ?`;
        params.push(query.nirf_rank_max);
      }
      if (query.has_program) {
        sql += ` AND EXISTS (SELECT 1 FROM programs p WHERE p.institute_id = i.id AND p.name LIKE ?)`;
        params.push(`%${query.has_program}%`);
      }
      
      sql += ` ORDER BY i.nirf_rank ASC, i.name ASC LIMIT ? OFFSET ?`;
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

  fastify.get('/api/v1/colleges/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { id } = collegeIdSchema.parse(request.params);
      
      const institute = db.prepare(`SELECT * FROM institutes WHERE id = ?`).get(id);
      if (!institute) return reply.status(404).send({ error: 'Not found', statusCode: 404 });
      
      const programs = db.prepare(`SELECT * FROM programs WHERE institute_id = ?`).all(id);
      const nirf_rankings = db.prepare(`SELECT * FROM nirf_rankings WHERE institute_id = ? ORDER BY year DESC LIMIT 5`).all(id);
      const placements = db.prepare(`SELECT * FROM placements WHERE institute_id = ? ORDER BY year DESC LIMIT 5`).all(id);
      
      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return { institute, programs, nirf_rankings, placements };
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });

  fastify.get('/api/v1/colleges/:id/placements', async (request: FastifyRequest, reply: FastifyReply) => {
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
      return rows;
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });

  fastify.get('/api/v1/colleges/:id/cutoffs', async (request: FastifyRequest, reply: FastifyReply) => {
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
      return rows;
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
