import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

// node --test runs each file in its own process, so production config set here
// does not leak into the other suites. It must be set before config.ts loads.
process.env.NODE_ENV = 'production';
process.env.RAPIDAPI_PROXY_SECRET = 'test-secret';

let server: FastifyInstance;

before(async () => {
  const { buildServer } = await import('../src/server.js');
  server = await buildServer();
  await server.ready();
});

after(async () => {
  await server.close();
});

test('rejects API requests that bypass the RapidAPI proxy', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/v1/stats' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().success, false);
});

test('rejects a wrong proxy secret', async () => {
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/stats',
    headers: { 'x-rapidapi-proxy-secret': 'wrong' },
  });
  assert.equal(res.statusCode, 403);
});

test('accepts requests carrying the proxy secret', async () => {
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/stats',
    headers: { 'x-rapidapi-proxy-secret': 'test-secret' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().success, true);
});

test('leaves the health check open for uptime monitors', async () => {
  const res = await server.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
});
