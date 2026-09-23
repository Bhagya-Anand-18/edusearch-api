import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let server: FastifyInstance;

before(async () => {
  server = await buildServer();
  await server.ready();
});

after(async () => {
  await server.close();
});

const get = async (url: string) => {
  const res = await server.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
};

test('cutoffs meta.total counts every match, not just the page', async () => {
  const stats = await get('/api/v1/stats');
  const { status, body } = await get('/api/v1/cutoffs?limit=5');
  assert.equal(status, 200);
  assert.equal(body.data.length, 5);
  assert.equal(body.meta.total, stats.body.data.total_cutoff_records);
  assert.equal(body.meta.has_more, true);
});

test('cutoffs meta.total respects filters and has_more ends on the last page', async () => {
  const first = await get('/api/v1/cutoffs?exam=neet&category=general&limit=10');
  const total = first.body.meta.total;
  assert.ok(total > 10, `expected more than one page, got ${total}`);
  assert.ok(first.body.data.every((r: any) => r.exam === 'neet' && r.category === 'general'));

  const last = await get(`/api/v1/cutoffs?exam=neet&category=general&limit=10&offset=${total - 3}`);
  assert.equal(last.body.data.length, 3);
  assert.equal(last.body.meta.total, total);
  assert.equal(last.body.meta.has_more, false);
});

test('colleges and rankings report real totals', async () => {
  const iits = await get('/api/v1/colleges?type=IIT&limit=2');
  assert.equal(iits.body.data.length, 2);
  assert.equal(iits.body.meta.total, 23);

  const rankings = await get('/api/v1/rankings/nirf?limit=2');
  assert.equal(rankings.body.data.length, 2);
  assert.ok(rankings.body.meta.total > 2);
});

test('response schemas keep every column, including joined ones', async () => {
  const { body } = await get('/api/v1/cutoffs?limit=1');
  for (const key of ['id', 'program_id', 'exam', 'year', 'round', 'category', 'gender',
    'opening_rank', 'closing_rank', 'program_name', 'degree', 'institute_name', 'institute_short_name']) {
    assert.ok(key in body.data[0], `missing ${key}`);
  }
});

for (const exam of ['jee_advanced', 'jee_main', 'neet']) {
  for (const category of ['general', 'ews', 'obc', 'sc', 'st']) {
    test(`predict ${exam}/${category} returns results with one entry per program`, async () => {
      const rank = exam === 'neet' ? 3000 : 5000;
      const { status, body } = await get(`/api/v1/predict?exam=${exam}&rank=${rank}&category=${category}`);
      assert.equal(status, 200);
      const ids = body.data.predictions.map((p: any) => p.program.id);
      assert.ok(ids.length > 0, 'every documented category should produce predictions');
      assert.equal(new Set(ids).size, ids.length, 'a program appeared more than once');
      assert.equal(body.data.total_predictions, ids.length);
    });
  }
}

test('predict sorts by confidence and only uses female-only seats for female candidates', async () => {
  const male = await get('/api/v1/predict?exam=jee_advanced&rank=3000&category=general&gender=male');
  assert.ok(male.body.data.predictions.every((p: any) => p.seat_pool === 'gender_neutral'));

  const female = await get('/api/v1/predict?exam=jee_advanced&rank=3000&category=general&gender=female');
  const pools = new Set(female.body.data.predictions.map((p: any) => p.seat_pool));
  assert.ok(pools.has('female_only'));

  const confidences = female.body.data.predictions.map((p: any) => p.confidence_pct);
  assert.deepEqual(confidences, [...confidences].sort((a: number, b: number) => b - a));
});

test('validation errors use the error envelope and name the parameter', async () => {
  const bad = await get('/api/v1/cutoffs?year=abc');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.success, false);
  assert.match(bad.body.error, /year/);
  assert.ok(Array.isArray(bad.body.details));

  const missing = await get('/api/v1/predict?rank=500');
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /exam/);
});

test('not-found responses use the error envelope', async () => {
  const college = await get('/api/v1/colleges/999999');
  assert.equal(college.status, 404);
  assert.equal(college.body.success, false);

  const route = await get('/api/v1/does-not-exist');
  assert.equal(route.status, 404);
  assert.equal(route.body.success, false);

  const compare = await get('/api/v1/compare?ids=1');
  assert.equal(compare.status, 400);
  assert.equal(compare.body.success, false);
});

test('stats and index disclose that the data is synthetic', async () => {
  const stats = await get('/api/v1/stats');
  assert.equal(stats.body.data.data_source, 'synthetic');
  assert.ok(stats.body.data.data_notice.length > 0);

  const index = await get('/');
  assert.equal(index.body.data_source, 'synthetic');
});

test('committed openapi.json matches the route schemas (run `npm run spec` if this fails)', async () => {
  const committed = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));
  // Round-trip through JSON to drop the plugin's internal Symbol keys, which never reach the file.
  const live = JSON.parse(JSON.stringify(server.swagger()));
  assert.deepEqual(committed.paths, live.paths);
  assert.deepEqual(committed.info, live.info);
});
