import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/database.js';

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();

    const institutes = (db.prepare(`SELECT COUNT(*) as count FROM institutes`).get() as any).count;
    const programs = (db.prepare(`SELECT COUNT(*) as count FROM programs`).get() as any).count;
    const cutoffs = (db.prepare(`SELECT COUNT(*) as count FROM cutoffs`).get() as any).count;
    const placements = (db.prepare(`SELECT COUNT(*) as count FROM placements`).get() as any).count;
    const nirfRankings = (db.prepare(`SELECT COUNT(*) as count FROM nirf_rankings`).get() as any).count;

    const examsCovered = db.prepare(`SELECT DISTINCT exam FROM cutoffs ORDER BY exam`).all().map((r: any) => r.exam);
    const yearRange = db.prepare(`SELECT MIN(year) as min_year, MAX(year) as max_year FROM cutoffs`).get() as any;
    const instituteTypes = db.prepare(`SELECT type, COUNT(*) as count FROM institutes GROUP BY type ORDER BY count DESC`).all();

    const endTime = process.hrtime.bigint();
    reply.header('x-response-time', `${Number(endTime - startTime) / 1e6}ms`);

    return {
      success: true,
      data: {
        total_institutes: institutes,
        total_programs: programs,
        total_cutoff_records: cutoffs,
        total_placement_records: placements,
        total_nirf_rankings: nirfRankings,
        exams_covered: examsCovered,
        year_range: { from: yearRange.min_year, to: yearRange.max_year },
        institute_breakdown: instituteTypes,
        last_updated: new Date().toISOString(),
      }
    };
  });
}
