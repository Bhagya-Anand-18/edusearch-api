import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/database.js';
import { objectResponse, errorResponse } from '../schemas/common.js';
import { DATA_PROVENANCE } from '../config.js';

const routeSchema = {
  tags: ['Stats'],
  summary: 'Get dataset coverage counts',
  description:
    'Returns how much data the API currently holds: record counts per table, which exams are covered, the span of years, and a breakdown of institutes by category. Call it to show coverage in a UI, or to check what is available before querying.',
  response: {
    200: objectResponse(
      {
        type: 'object',
        properties: {
          total_institutes: { type: 'integer', description: 'Institutes in the dataset.' },
          total_programs: { type: 'integer', description: 'Programs across all institutes.' },
          total_cutoff_records: { type: 'integer', description: 'Individual cutoff records.' },
          total_placement_records: { type: 'integer', description: 'Individual placement records.' },
          total_nirf_rankings: { type: 'integer', description: 'Individual NIRF ranking records.' },
          exams_covered: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exam identifiers with cutoff data available.',
          },
          year_range: {
            type: 'object',
            description: 'Span of admission years covered by the cutoff data.',
            properties: {
              from: { type: 'integer', nullable: true, description: 'Earliest year on record.' },
              to: { type: 'integer', nullable: true, description: 'Latest year on record.' },
            },
          },
          institute_breakdown: {
            type: 'array',
            description: 'Institute counts per category, largest first.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                type: { type: 'string', nullable: true, description: 'Institute category.' },
                count: { type: 'integer', description: 'Institutes in that category.' },
              },
            },
          },
          last_updated: { type: 'string', description: 'ISO 8601 timestamp of when this response was generated.' },
          data_source: {
            type: 'string',
            enum: ['synthetic', 'official', 'mixed'],
            description: 'Overall provenance: "official" when every dataset comes from an official source. See `sources` for the breakdown.',
          },
          sources: {
            type: 'array',
            description: 'Record counts per dataset and source, so consumers can see exactly which data is official.',
            items: {
              type: 'object',
              properties: {
                dataset: { type: 'string', description: 'cutoffs, nirf_rankings or placements.' },
                exam: { type: 'string', nullable: true, description: 'Exam, for cutoff records.' },
                source: { type: 'string', description: 'josaa, mcc_derived or nirf.' },
                official: { type: 'boolean', description: 'True when the records come from an official source.' },
                records: { type: 'integer', description: 'Number of records.' },
                year_from: { type: 'integer', nullable: true, description: 'Earliest year covered.' },
                year_to: { type: 'integer', nullable: true, description: 'Latest year covered.' },
              },
            },
          },
          data_notice: { type: 'string', description: 'Plain-language caveat about the data source.' },
        },
      },
      'Coverage counts for the dataset.'
    ),
    403: errorResponse('Request did not reach the API through the RapidAPI proxy. Only returned by the hosted deployment.'),
  },
};

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/v1/stats', { schema: routeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = process.hrtime.bigint();

    const institutes = (db.prepare(`SELECT COUNT(*) as count FROM institutes`).get() as any).count;
    const programs = (db.prepare(`SELECT COUNT(*) as count FROM programs`).get() as any).count;
    const cutoffs = (db.prepare(`SELECT COUNT(*) as count FROM cutoffs`).get() as any).count;
    const placements = (db.prepare(`SELECT COUNT(*) as count FROM placements`).get() as any).count;
    const nirfRankings = (db.prepare(`SELECT COUNT(*) as count FROM nirf_rankings`).get() as any).count;

    const examsCovered = db.prepare(`SELECT DISTINCT exam FROM cutoffs ORDER BY exam`).all().map((r: any) => r.exam);
    const yearRange = db.prepare(`SELECT MIN(year) as min_year, MAX(year) as max_year FROM cutoffs`).get() as any;
    const instituteTypes = db.prepare(`SELECT type, COUNT(*) as count FROM institutes GROUP BY type ORDER BY count DESC`).all();

    const sources = db.prepare(`
      SELECT 'cutoffs' as dataset, exam, source, COUNT(*) as records, MIN(year) as year_from, MAX(year) as year_to FROM cutoffs GROUP BY exam, source
      UNION ALL SELECT 'nirf_rankings', NULL, source, COUNT(*), MIN(year), MAX(year) FROM nirf_rankings GROUP BY source
      UNION ALL SELECT 'placements', NULL, source, COUNT(*), MIN(year), MAX(year) FROM placements GROUP BY source
    `).all().map((row: any) => ({ ...row, official: row.source !== 'synthetic' }));

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
        data_source: DATA_PROVENANCE.source,
        sources,
        data_notice: DATA_PROVENANCE.notice,
      }
    };
  });
}
