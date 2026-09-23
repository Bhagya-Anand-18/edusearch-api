import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { logger } from './utils/logger.js';
import { errorEnvelope } from './utils/envelope.js';

// Route imports
import cutoffsRoutes from './routes/cutoffs.js';
import collegesRoutes from './routes/colleges.js';
import rankingsRoutes from './routes/rankings.js';
import examsRoutes from './routes/exams.js';
import predictRoutes from './routes/predict.js';
import searchRoutes from './routes/search.js';
import compareRoutes from './routes/compare.js';
import statsRoutes from './routes/stats.js';
import { config, DATA_PROVENANCE } from './config.js';

export const buildServer = async () => {
  const server = fastify({ logger: false });

  await server.register(cors);
  
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: 'EduSearch API',
        description: `Indian education data API — JEE/NEET cutoffs, NIRF rankings, college data, placements, and admission predictions.\n\n**${DATA_PROVENANCE.notice}**`,
        version: '1.0.0',
        contact: {
          name: 'EduSearch API',
        }
      },
      servers: [
        ...(config.PUBLIC_URL ? [{ url: config.PUBLIC_URL, description: 'Production' }] : []),
        { url: `http://localhost:${config.PORT}`, description: 'Development' },
      ],
      tags: [
        { name: 'Cutoffs', description: 'JEE/NEET cutoff data' },
        { name: 'Colleges', description: 'Institute information' },
        { name: 'Rankings', description: 'NIRF rankings' },
        { name: 'Exams', description: 'Exam statistics' },
        { name: 'Predict', description: 'College admission prediction' },
        { name: 'Search', description: 'Search across data' },
        { name: 'Compare', description: 'Side-by-side institute comparison' },
        { name: 'Stats', description: 'Dataset coverage' },
        { name: 'Meta', description: 'Service metadata and health' },
      ]
    }
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs'
  });

  // Health check (unauthenticated)
  server.get('/health', {
    schema: {
      tags: ['Meta'],
      summary: 'Health check',
      description: 'Returns 200 while the service is up. Unauthenticated, so uptime monitors can hit it directly.',
      response: {
        200: {
          description: 'The service is healthy.',
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Always "ok".' },
            timestamp: { type: 'string', description: 'ISO 8601 time the check ran.' },
            version: { type: 'string', description: 'Running API version.' },
          },
        },
      },
    },
  }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' };
  });

  // RapidAPI proxy authentication (production only)
  // This ensures requests come through RapidAPI's proxy, not directly to our server
  if (config.NODE_ENV === 'production' && config.RAPIDAPI_PROXY_SECRET) {
    server.addHook('onRequest', async (request, reply) => {
      // Skip auth for health check and docs
      if (request.url === '/health' || request.url.startsWith('/docs')) return;
      
      const proxySecret = request.headers['x-rapidapi-proxy-secret'];
      if (proxySecret !== config.RAPIDAPI_PROXY_SECRET) {
        reply.status(403).send(
          errorEnvelope(403, 'Access this API through RapidAPI: https://rapidapi.com/search/edusearch')
        );
      }
    });
  }

  // API info
  server.get('/', {
    schema: {
      tags: ['Meta'],
      summary: 'API index',
      description: 'Lists the available endpoints and where the documentation lives.',
      response: {
        200: {
          description: 'Service metadata and the endpoint index.',
          type: 'object',
          additionalProperties: true,
          properties: {
            name: { type: 'string', description: 'Service name.' },
            version: { type: 'string', description: 'Running API version.' },
            description: { type: 'string', description: 'One-line summary of what the API serves.' },
            docs: { type: 'string', description: 'Path to the Swagger UI.' },
            endpoints: {
              type: 'object',
              additionalProperties: true,
              description: 'Map of endpoint name to path.',
            },
          },
        },
      },
    },
  }, async () => {
    return {
      name: 'EduSearch API',
      version: '1.0.0',
      description: 'Indian Education Data API — JEE/NEET cutoffs, NIRF rankings, college predictions',
      data_source: DATA_PROVENANCE.source,
      data_notice: DATA_PROVENANCE.notice,
      docs: '/docs',
      endpoints: {
        cutoffs: '/api/v1/cutoffs',
        colleges: '/api/v1/colleges',
        rankings: '/api/v1/rankings/nirf',
        exams: '/api/v1/exams/:exam/stats',
        predict: '/api/v1/predict',
        search: '/api/v1/search',
        compare: '/api/v1/compare?ids=1,2,3',
        stats: '/api/v1/stats',
      }
    };
  });

  // Every failure leaves through here in the same envelope shape as a success,
  // so consumers can branch on `success` without special-casing errors.
  server.setErrorHandler((error, request, reply) => {
    logger.error(`Error: ${error.message}`);
    if (error.statusCode === 429) {
      reply.status(429).send(errorEnvelope(429, 'Rate limit exceeded. Upgrade to Pro for higher limits.'));
    } else {
      const statusCode = error.statusCode || 500;
      reply.status(statusCode).send(
        errorEnvelope(statusCode, error.message || 'Internal Server Error', error.validation as unknown[] | undefined)
      );
    }
  });

  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorEnvelope(404, `Route ${request.method} ${request.url} not found`));
  });

  // Register all routes
  await server.register(cutoffsRoutes);
  await server.register(collegesRoutes);
  await server.register(rankingsRoutes);
  await server.register(examsRoutes);
  await server.register(predictRoutes);
  await server.register(searchRoutes);
  await server.register(compareRoutes);
  await server.register(statsRoutes);

  // Graceful shutdown
  const listeners = ['SIGINT', 'SIGTERM'];
  listeners.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    });
  });

  return server;
};
