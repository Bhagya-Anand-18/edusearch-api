import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { envelopeSingle } from '../utils/envelope.js';

const predictQuerySchema = z.object({
  exam: z.enum(['jee_advanced', 'jee_main', 'neet']),
  rank: z.coerce.number().int().min(1),
  category: z.enum(['general', 'obc', 'sc', 'st', 'ews']),
  gender: z.enum(['male', 'female']).optional(),
  preferred_state: z.string().optional(),
  preferred_type: z.string().optional(),
  preferred_branch: z.string().optional(),
});

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/predict', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();
    try {
      const query = predictQuerySchema.parse(request.query);
      
      const maxYearRow = db.prepare(`SELECT MAX(year) as max_year FROM cutoffs WHERE exam = ?`).get(query.exam) as any;
      const latestYear = maxYearRow?.max_year || new Date().getFullYear();
      
      let sql = `
        SELECT 
          c.id as cutoff_id, c.opening_rank, c.closing_rank, c.year, c.category,
          p.id as program_id, p.name as program_name, p.degree,
          i.id as institute_id, i.name as institute_name, i.short_name, i.type, i.state, i.nirf_rank
        FROM cutoffs c
        JOIN programs p ON c.program_id = p.id
        JOIN institutes i ON p.institute_id = i.id
        WHERE c.exam = ? AND c.year = ? AND c.category = ?
        AND c.closing_rank >= ?
      `;
      const params: any[] = [query.exam, latestYear, query.category, query.rank / 1.1];
      
      if (query.gender === 'female') {
        sql += ` AND c.gender IN ('neutral', 'female')`;
      } else {
        sql += ` AND c.gender IN ('neutral', 'male')`; 
      }
      
      if (query.preferred_state) {
        sql += ` AND i.state = ?`;
        params.push(query.preferred_state);
      }
      if (query.preferred_type) {
        sql += ` AND i.type = ?`;
        params.push(query.preferred_type);
      }
      if (query.preferred_branch) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${query.preferred_branch}%`);
      }
      
      let cutoffs = db.prepare(sql).all(...params) as any[];
      
      const prevYearStmt = db.prepare(`
        SELECT closing_rank FROM cutoffs 
        WHERE program_id = ? AND exam = ? AND category = ? AND year = ?
        LIMIT 1
      `);
      
      const results = cutoffs.map(c => {
        let confidence = 0;
        let opening = c.opening_rank || 1;
        let closing = c.closing_rank || 1;
        const r = query.rank;
        
        if (r < opening) {
          confidence = 95;
        } else if (r >= opening && r <= closing) {
          confidence = 50 + 40 * ((closing - r) / (closing - opening + 1));
        } else if (r > closing && r <= closing * 1.1) {
          confidence = 20 + 20 * ((closing * 1.1 - r) / (closing * 0.1));
        } else {
          confidence = 0;
        }
        
        let trend = 'stable';
        const prevYearCutoff = prevYearStmt.get(c.program_id, query.exam, query.category, latestYear - 1) as any;
        
        if (prevYearCutoff) {
          const prevClosing = prevYearCutoff.closing_rank;
          if (closing < prevClosing - 50) {
            trend = 'declining';
            confidence -= 5;
          } else if (closing > prevClosing + 50) {
            trend = 'improving';
            confidence += 5;
          }
        }
        
        return {
          institute: { id: c.institute_id, name: c.institute_name, short_name: c.short_name, type: c.type, state: c.state },
          program: { id: c.program_id, name: c.program_name, degree: c.degree },
          confidence_pct: Math.max(0, Math.min(99, Math.round(confidence))),
          last_year_closing_rank: closing,
          trend,
          nirf_rank: c.nirf_rank || 9999
        };
      }).filter(r => r.confidence_pct > 0);
      
      results.sort((a, b) => {
        if (b.confidence_pct !== a.confidence_pct) {
          return b.confidence_pct - a.confidence_pct;
        }
        return a.nirf_rank - b.nirf_rank;
      });
      
      const endTime = process.hrtime.bigint();
      reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);
      return envelopeSingle({ predictions: results, query: { exam: query.exam, rank: query.rank, category: query.category }, total_predictions: results.length });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Validation Error', statusCode: 400 });
      return reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
