import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle } from '../utils/envelope.js';

const compareQuerySchema = z.object({
  ids: z.string().min(1), // comma-separated institute IDs
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const { ids } = compareQuerySchema.parse(request.query);
      const idList = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

      if (idList.length < 2 || idList.length > 5) {
        return reply.status(400).send({ error: 'Provide 2-5 institute IDs separated by commas', statusCode: 400 });
      }

      const placeholders = idList.map(() => '?').join(',');

      const institutes = db.prepare(`SELECT * FROM institutes WHERE id IN (${placeholders})`).all(...idList);

      if (institutes.length === 0) {
        return reply.status(404).send({ error: 'No institutes found for the given IDs', statusCode: 404 });
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
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
