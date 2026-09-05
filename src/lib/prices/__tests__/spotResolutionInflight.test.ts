import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearTier1AssessmentCacheForTests, fetchTier1Assessment } from '../../client/tier1AssessmentClient.ts';
import { resolvePriceSeries } from '../resolve.ts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const tierAssessment = (status: string) => ({ status }) as any;
const tierResponse = (status: string) => ({
  ok: true,
  json: async () => ({ ok: true, assessment: tierAssessment(status) }),
}) as any;

(async function run() {
  let calls = 0;
  const deps = {
    resolveLegacyCommodityCloseOnOrBeforeFn: async (_symbol: string, targetDateUtc: string) => {
      calls += 1;
      await delay(25);
      return { close: 2500, dateUtc: targetDateUtc, warnings: [] };
    },
  };
  const args = {
    price_key: 'XAU_USD_TOZ',
    anchorDatesUtc: ['2026-09-05'],
    scenario: { mode: 'spot' as const },
    allowRefresh: false,
  };

  const [a, b, c] = await Promise.all([
    resolvePriceSeries(args, deps),
    resolvePriceSeries(args, deps),
    resolvePriceSeries(args, deps),
  ]);

  assert.equal(calls, 1, 'concurrent spot resolutions for the same key must share one provider promise');
  assert.deepEqual(a.values, [2500]);
  assert.deepEqual(b.values, [2500]);
  assert.deepEqual(c.values, [2500]);

  const next = await resolvePriceSeries(args, deps);
  assert.equal(calls, 2, 'completed spot resolutions must not become a stale long-lived cache');
  assert.deepEqual(next.values, [2500]);

  const originalFetch = globalThis.fetch;
  try {
    clearTier1AssessmentCacheForTests();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await delay(20);
      return tierResponse('TIER_1');
    }) as typeof fetch;

    const [tierA, tierB, tierC] = await Promise.all([
      fetchTier1Assessment(' la.v '),
      fetchTier1Assessment('LA.V'),
      fetchTier1Assessment('la.v'),
    ]);
    assert.equal(calls, 1, 'Tier and Investment Score consumers must share one in-flight browser request per symbol');
    assert.equal(tierA?.status, 'TIER_1');
    assert.equal(tierB?.status, 'TIER_1');
    assert.equal(tierC?.status, 'TIER_1');

    await fetchTier1Assessment('LA.V');
    assert.equal(calls, 1, 'verified Tier assessments should use the short browser TTL');

    clearTier1AssessmentCacheForTests();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? tierResponse('NOT_VERIFIED') : tierResponse('TIER_2');
    }) as typeof fetch;
    const recovered = await fetchTier1Assessment('TMQ.TO');
    assert.equal(calls, 2, 'transient NOT_VERIFIED must receive exactly one controlled retry');
    assert.equal(recovered?.status, 'TIER_2');

    clearTier1AssessmentCacheForTests();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return tierResponse('NOT_VERIFIED');
    }) as typeof fetch;
    const failed = await fetchTier1Assessment('CCI.CN');
    assert.equal(failed?.status, 'NOT_VERIFIED');
    assert.equal(calls, 2);
    await fetchTier1Assessment('CCI.CN');
    assert.equal(calls, 4, 'NOT_VERIFIED must not remain sticky in the browser cache');
  } finally {
    clearTier1AssessmentCacheForTests();
    globalThis.fetch = originalFetch;
  }

  const tierCell = readFileSync(new URL('../../../components/Tier1StatusCell.tsx', import.meta.url), 'utf8');
  const scoreCell = readFileSync(new URL('../../../components/investmentScore/InvestmentScoreCell.tsx', import.meta.url), 'utf8');
  const compare = readFileSync(new URL('../../../components/CompareStocksDashboard.tsx', import.meta.url), 'utf8');
  const companyListRoute = readFileSync(new URL('../../../server/routes/company/list.ts', import.meta.url), 'utf8');
  assert.equal(tierCell.includes("fetch(`/api/tier1"), false, 'Tier cell must use the shared Tier browser client');
  assert.equal(scoreCell.includes("fetch(`/api/tier1"), false, 'Investment Score must not issue a second Tier request');
  assert.equal(tierCell.includes('fetchTier1Assessment'), true);
  assert.equal(scoreCell.includes('fetchTier1Assessment'), true);
  assert.equal(compare.includes('/api/company/list?limit=500&projectsOnly=1'), true, 'Compare must inventory only companies with project_json rows');
  assert.equal(companyListRoute.includes('projectsOnly'), true);
  assert.equal(companyListRoute.includes('EXISTS (SELECT 1 FROM company_projects'), true, 'projectsOnly must be resolved in one server query, not N browser probes');

  console.log('spotResolutionInflight + Tier Compare read-path tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
