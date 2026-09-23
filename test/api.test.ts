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

test('colleges list ranked institutes before unranked ones', async () => {
  const { body } = await get('/api/v1/colleges?limit=200');
  const ranks = body.data.map((c: any) => c.nirf_rank);
  const firstUnranked = ranks.indexOf(null);
  assert.ok(firstUnranked > 0, 'the list should open with ranked institutes');
  assert.ok(ranks.slice(firstUnranked).every((r: any) => r === null), 'a ranked institute appears after an unranked one');
});

test('response schemas keep every column, including joined ones', async () => {
  const { body } = await get('/api/v1/cutoffs?limit=1');
  for (const key of ['id', 'program_id', 'exam', 'year', 'round', 'is_final_round', 'quota', 'category', 'pwd', 'gender',
    'opening_rank', 'closing_rank', 'source', 'program_name', 'degree', 'institute_name', 'institute_short_name']) {
    assert.ok(key in body.data[0], `missing ${key}`);
  }
});

for (const exam of ['jee_advanced', 'jee_main', 'neet']) {
  for (const category of ['general', 'ews', 'obc', 'sc', 'st']) {
    test(`predict ${exam}/${category} returns results with one entry per program`, async () => {
      // Category ranks: real 2025 IIT closing ranks top out near 2,100 for ST,
      // so a rank of 1000 must find seats in every category.
      const rank = { jee_advanced: 1000, jee_main: 5000, neet: 3000 }[exam];
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

test('stats reports provenance per dataset', async () => {
  const stats = await get('/api/v1/stats');
  assert.equal(stats.body.data.data_source, 'mixed');
  assert.ok(stats.body.data.data_notice.length > 0);

  const find = (dataset: string, exam: string | null = null) =>
    stats.body.data.sources.filter((s: any) => s.dataset === dataset && s.exam === exam);
  assert.deepEqual(find('cutoffs', 'jee_advanced').map((s: any) => s.source), ['josaa']);
  assert.deepEqual(find('cutoffs', 'jee_main').map((s: any) => s.source), ['josaa']);
  assert.deepEqual(find('cutoffs', 'neet').map((s: any) => s.source), ['mcc_derived']);
  assert.deepEqual(find('nirf_rankings').map((s: any) => s.official), [true]);
  assert.deepEqual(find('placements').map((s: any) => s.source), ['nirf']);
  assert.deepEqual(find('exam_stats').map((s: any) => s.official), [false]);

  const index = await get('/');
  assert.equal(index.body.data_source, 'mixed');
});

test('every cutoff record carries its source', async () => {
  const jee = await get('/api/v1/cutoffs?exam=jee_main&limit=200');
  assert.ok(jee.body.data.every((r: any) => r.source === 'josaa'));
  const neet = await get('/api/v1/cutoffs?exam=neet&limit=200');
  assert.ok(neet.body.data.every((r: any) => r.source === 'mcc_derived'));
  const neetPredictions = await get('/api/v1/predict?exam=neet&rank=3000&category=general');
  assert.ok(neetPredictions.body.data.predictions.every((p: any) => p.source === 'mcc_derived'));
});

// Values checked by hand against the official pages, so a broken importer or
// seed shows up as a wrong number rather than passing unnoticed.
test('JoSAA cutoffs match the official archive', async () => {
  const { body } = await get(
    '/api/v1/cutoffs?institute=IIT Bhubaneswar&program=Civil Engineering&year=2025&round=6&quota=AI&category=general&gender=neutral&pwd=false'
  );
  assert.equal(body.meta.total, 1);
  assert.equal(body.data[0].opening_rank, 10922);
  assert.equal(body.data[0].closing_rank, 16156);
  assert.equal(body.data[0].is_final_round, true);
});

test('NEET ranges match the MCC round-1 allotment list', async () => {
  // MCC 2025 round 1: AIIMS New Delhi MBBS open seats, general category, ranks 1 to 48.
  const { body } = await get(
    '/api/v1/cutoffs?exam=neet&institute=All India Institute of Medical Sciences New Delhi&year=2025&quota=SO&category=general&pwd=false'
  );
  assert.equal(body.meta.total, 1);
  assert.equal(body.data[0].opening_rank, 1);
  assert.equal(body.data[0].closing_rank, 48);
  assert.equal(body.data[0].program_name, 'Medicine and Surgery');
});

test('a medical college stays one record when MCC changes its PIN', async () => {
  // MCC printed AIIMS Jammu's PIN as 18410, 184120 and 181134 in successive years.
  const { body } = await get('/api/v1/search?q=AIIMS Jammu');
  assert.equal(body.data.institutes.length, 1);
  const cutoffs = await get(`/api/v1/colleges/${body.data.institutes[0].id}/cutoffs?exam=neet`);
  assert.deepEqual([...new Set(cutoffs.body.data.map((c: any) => c.year))].sort(), [2022, 2023, 2024, 2025]);
});

test('NEET women-only seats are offered only to female candidates', async () => {
  // 2025 women-only general seats close at AIR 1,128, 7,449 and 12,719.
  const male = await get('/api/v1/predict?exam=neet&rank=5000&category=general&gender=male');
  assert.ok(male.body.data.predictions.every((p: any) => p.seat_pool === 'gender_neutral'));
  const female = await get('/api/v1/predict?exam=neet&rank=5000&category=general&gender=female');
  assert.ok(female.body.data.predictions.some((p: any) => p.seat_pool === 'female_only'));
});

test('placements match the NIRF institute data report', async () => {
  const search = await get('/api/v1/search?q=IIT Madras');
  const id = search.body.data.institutes.find((i: any) => i.short_name === 'IIT Madras').id;
  const { body } = await get(`/api/v1/colleges/${id}/placements?year=2024`);
  const ug = body.data.find((r: any) => r.program_or_dept === 'UG 4-year programs');
  assert.equal(ug.academic_year, '2023-24');
  assert.equal(ug.graduating, 714);
  assert.equal(ug.placed, 549);
  assert.equal(ug.median_salary, 1750000);
  assert.equal(ug.source, 'nirf');
  assert.equal(ug.highest_salary, null);
});

test('NIRF rankings match nirfindia.org and stop at the last published year', async () => {
  const { body } = await get('/api/v1/rankings/nirf?category=engineering&limit=1');
  const top = body.data[0];
  assert.equal(top.year, 2025);
  assert.equal(top.short_name, 'IIT Madras');
  assert.equal(top.rank, 1);
  assert.equal(top.score, 88.72);
  assert.equal(top.tlr_score, 95.7);

  const unpublished = await get('/api/v1/rankings/nirf?year=2026');
  assert.equal(unpublished.body.meta.total, 0);
});

test('NIRF rankings are matched by city as well as name', async () => {
  // NIRF uses the bare name "Christian Medical College" for both Vellore and Ludhiana.
  const { body } = await get('/api/v1/search?q=Christian Medical');
  const vellore = body.data.institutes.find((i: any) => i.short_name === 'CMC Vellore');
  const detail = await get(`/api/v1/colleges/${vellore.id}`);
  const ids = new Set(detail.body.data.nirf_rankings.map((n: any) => n.nirf_id));
  assert.equal(ids.size, 1, 'rankings from more than one NIRF institute were attached');
});

test('predict only offers home-state seats in the home state', async () => {
  const kerala = await get('/api/v1/predict?exam=jee_main&rank=20000&category=general&home_state=kerala');
  assert.equal(kerala.body.data.query.home_state, 'Kerala');
  const predictions = kerala.body.data.predictions;
  const hs = predictions.filter((p: any) => p.quota === 'HS');
  assert.ok(hs.length > 0);
  assert.ok(hs.every((p: any) => p.institute.state === 'Kerala'));
  assert.ok(!predictions.some((p: any) => p.quota === 'OS' && p.institute.state === 'Kerala'));

  const anywhere = await get('/api/v1/predict?exam=jee_main&rank=20000&category=general');
  assert.ok(!anywhere.body.data.predictions.some((p: any) => p.quota === 'HS'));
});

test('predict uses PwD seats only for PwD candidates', async () => {
  const regular = await get('/api/v1/predict?exam=jee_advanced&rank=300&category=general');
  assert.ok(regular.body.data.predictions.every((p: any) => p.pwd === false));

  const pwd = await get('/api/v1/predict?exam=jee_advanced&rank=300&category=general&pwd=true');
  assert.ok(pwd.body.data.predictions.some((p: any) => p.pwd === true));
});

test('state filters ignore case and "&" versus "and"', async () => {
  const a = await get('/api/v1/colleges?state=jammu %26 kashmir');
  const b = await get('/api/v1/colleges?state=Jammu and Kashmir');
  assert.ok(a.body.meta.total > 0);
  assert.equal(a.body.meta.total, b.body.meta.total);
});

test('committed openapi.json matches the route schemas (run `npm run spec` if this fails)', async () => {
  const committed = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));
  // Round-trip through JSON to drop the plugin's internal Symbol keys, which never reach the file.
  const live = JSON.parse(JSON.stringify(server.swagger()));
  assert.deepEqual(committed.paths, live.paths);
  assert.deepEqual(committed.info, live.info);
});
