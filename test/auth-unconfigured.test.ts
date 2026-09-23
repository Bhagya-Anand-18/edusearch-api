import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

// Production with no proxy secret configured: the API must refuse requests
// rather than serve them unmetered. Runs in its own process (node --test).
process.env.NODE_ENV = 'production';
delete process.env.RAPIDAPI_PROXY_SECRET;

let server: FastifyInstance;

before(async () => {
  const { buildServer } = await import('../src/server.js');
  server = await buildServer();
  await server.ready();
});

after(async () => {
  await server.close();
});

test('refuses API requests when the proxy secret is not configured', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/v1/stats' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().success, false);
  assert.match(res.json().error, /RAPIDAPI_PROXY_SECRET/);
});

test('keeps health and docs reachable', async () => {
  assert.equal((await server.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  assert.notEqual((await server.inject({ method: 'GET', url: '/docs/json' })).statusCode, 503);
});
