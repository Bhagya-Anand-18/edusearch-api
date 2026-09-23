/**
 * Regenerates openapi.json from the live route schemas.
 *
 * The spec is what RapidAPI imports to build the listing, so it has to stay in
 * step with the routes. Run `npm run spec` after changing any route schema and
 * commit the result; set PUBLIC_URL first so the spec advertises the deployed
 * URL rather than localhost.
 */
import fs from 'fs';
import path from 'path';
import { buildServer } from '../server.js';
import { logger } from '../utils/logger.js';

const generate = async () => {
  const server = await buildServer();
  await server.ready();

  const spec = server.swagger();
  const outPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);

  const pathCount = Object.keys((spec as any).paths ?? {}).length;
  logger.success(`Wrote ${outPath} (${pathCount} paths)`);

  await server.close();
  process.exit(0);
};

generate().catch((err) => {
  logger.error(`Failed to generate spec: ${err}`);
  process.exit(1);
});
