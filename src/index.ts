import { buildServer } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const start = async () => {
  try {
    const server = await buildServer();
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.success(`Server listening on port ${config.PORT}`);
    logger.info(`Swagger UI available at http://localhost:${config.PORT}/docs`);
  } catch (err) {
    logger.error(`Failed to start server: ${err}`);
    process.exit(1);
  }
};

start();
