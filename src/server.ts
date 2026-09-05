import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { logger } from './utils/logger.js';

// Route imports
import cutoffsRoutes from './routes/cutoffs.js';
import collegesRoutes from './routes/colleges.js';
import rankingsRoutes from './routes/rankings.js';
import examsRoutes from './routes/exams.js';
import predictRoutes from './routes/predict.js';
import searchRoutes from './routes/search.js';
import compareRoutes from './routes/compare.js';
import statsRoutes from './routes/stats.js';
import { config } from './config.js';

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
        description: 'Comprehensive Indian Education Data API — JEE/NEET cutoffs, NIRF rankings, college data, placements, and admission predictions.',
        version: '1.0.0',
        contact: {
          name: 'EduSearch API',
        }
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' }
      ],
      tags: [
        { name: 'Cutoffs', description: 'JEE/NEET cutoff data' },
        { name: 'Colleges', description: 'Institute information' },
        { name: 'Rankings', description: 'NIRF rankings' },
        { name: 'Exams', description: 'Exam statistics' },
        { name: 'Predict', description: 'College admission prediction' },
        { name: 'Search', description: 'Search across data' },
      ]
    }
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs'
  });

  // Health check (unauthenticated)
  server.get('/health', async () => {
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
        reply.status(403).send({ 
          success: false,
          error: 'Access this API through RapidAPI: https://rapidapi.com/search/edusearch',
          statusCode: 403 
        });
      }
    });
  }

  // API info
  server.get('/', async () => {
    return {
      name: 'EduSearch API',
      version: '1.0.0',
      description: 'Indian Education Data API — JEE/NEET cutoffs, NIRF rankings, college predictions',
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

  // Register all routes
  await server.register(cutoffsRoutes);
  await server.register(collegesRoutes);
  await server.register(rankingsRoutes);
  await server.register(examsRoutes);
  await server.register(predictRoutes);
  await server.register(searchRoutes);
  await server.register(compareRoutes);
  await server.register(statsRoutes);

  server.setErrorHandler((error, request, reply) => {
    logger.error(`Error: ${error.message}`);
    if (error.statusCode === 429) {
      reply.status(429).send({ error: 'Rate limit exceeded. Upgrade to Pro for higher limits.', statusCode: 429 });
    } else {
      reply.status(error.statusCode || 500).send({ error: error.message || 'Internal Server Error', statusCode: error.statusCode || 500 });
    }
  });

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
