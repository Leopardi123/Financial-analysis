import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearTier1AssessmentCacheForTests, fetchTier1Assessment } from '../../client/tier1AssessmentClient.ts';
import { buildCorporateRuntimeFingerprint, buildTierRuntimeFingerprint } from '../../cache/runtimeEconomicsFingerprint.ts';
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

  const projectSummaries = [{
    project_id: 'p1',
    project_name: 'Project One',
    json_version: 'project_json_v3',
    updated_at_utc: '2026-09-06T10:00:00.000Z',
    disabled: false,
  }];
  const tierFingerprintA = await buildTierRuntimeFingerprint({ symbol: 'LA.V', projects: projectSummaries, nowMs: 1_788_690_000_000 });
  const tierFingerprintB = await buildTierRuntimeFingerprint({ symbol: 'la.v', projects: projectSummaries, nowMs: 1_788_690_000_000 });
  assert.equal(tierFingerprintA, tierFingerprintB, 'Tier runtime fingerprint must normalize symbol case');
  const tierFingerprintChanged = await buildTierRuntimeFingerprint({
    symbol: 'LA.V',
    projects: [{ ...projectSummaries[0], updated_at_utc: '2026-09-06T10:01:00.000Z' }],
    nowMs: 1_788_690_000_000,
  });
  assert.notEqual(tierFingerprintA, tierFingerprintChanged, 'project updates must invalidate Tier runtime cache');

  const corporateFingerprintA = await buildCorporateRuntimeFingerprint({
    body: { symbol: 'LA.V', discountRate: 0.10 },
    projects: projectSummaries,
    nowMs: 1_788_690_000_000,
  });
  const corporateFingerprintB = await buildCorporateRuntimeFingerprint({
    body: { symbol: 'LA.V', discountRate: 0.11 },
    projects: projectSummaries,
    nowMs: 1_788_690_000_000,
  });
  assert.notEqual(corporateFingerprintA, corporateFingerprintB, 'Corporate request changes must invalidate snapshot runtime cache');

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
    assert.equal(calls, 1, 'verified Tier assessments should use the browser TTL');

    clearTier1AssessmentCacheForTests();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return tierResponse('NOT_VERIFIED');
    }) as typeof fetch;
    const failed = await fetchTier1Assessment('CCI.CN');
    assert.equal(failed?.status, 'NOT_VERIFIED');
    assert.equal(calls, 1, 'NOT_VERIFIED must not trigger an immediate second full Tier calculation');
    await fetchTier1Assessment('CCI.CN');
    assert.equal(calls, 2, 'NOT_VERIFIED remains non-sticky for a later explicit consumer retry');

    clearTier1AssessmentCacheForTests();
    calls = 0;
    let active = 0;
    let maxActive = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active -= 1;
      return tierResponse('TIER_1');
    }) as typeof fetch;
    await Promise.all(Array.from({ length: 12 }, (_, index) => fetchTier1Assessment(`TIER-${index}`)));
    assert.equal(calls, 12);
    assert(maxActive <= 4, `Compare Tier fan-out must be bounded; observed ${maxActive} concurrent requests`);
  } finally {
    clearTier1AssessmentCacheForTests();
    globalThis.fetch = originalFetch;
  }

  const tierCell = readFileSync(new URL('../../../components/Tier1StatusCell.tsx', import.meta.url), 'utf8');
  const scoreCell = readFileSync(new URL('../../../components/investmentScore/InvestmentScoreCell.tsx', import.meta.url), 'utf8');
  const compare = readFileSync(new URL('../../../components/CompareStocksDashboard.tsx', import.meta.url), 'utf8');
  const companyListRoute = readFileSync(new URL('../../../server/routes/company/list.ts', import.meta.url), 'utf8');
  const tierClient = readFileSync(new URL('../../client/tier1AssessmentClient.ts', import.meta.url), 'utf8');
  const snapshotClient = readFileSync(new URL('../../client/snapshotClient.ts', import.meta.url), 'utf8');
  const cycleRuntime = readFileSync(new URL('../../tier1/cyclePolicyRuntime.ts', import.meta.url), 'utf8');
  const tierWrapper = readFileSync(new URL('../../../../api/tier1-pre-revenue.ts', import.meta.url), 'utf8');
  const apiIndex = readFileSync(new URL('../../../../api/index.ts', import.meta.url), 'utf8');

  assert.equal(tierCell.includes("fetch(`/api/tier1"), false, 'Tier cell must use the shared Tier browser client');
  assert.equal(scoreCell.includes("fetch(`/api/tier1"), false, 'Investment Score must not issue a second Tier request');
  assert.equal(tierCell.includes('fetchTier1Assessment'), true);
  assert.equal(scoreCell.includes('fetchTier1Assessment'), true);
  assert.equal(tierClient.includes('TRANSIENT_RETRY_DELAY_MS'), false, 'Tier client must not double-run NOT_VERIFIED through an automatic retry');
  assert.equal(tierClient.includes('MAX_CONCURRENT_TIER_REQUESTS = 4'), true, 'Compare Tier fan-out must stay bounded');
  assert.equal(compare.includes('/api/company/list?limit=500&projectsOnly=1'), true, 'Compare must inventory only companies with project_json rows');
  assert.equal(companyListRoute.includes('projectsOnly'), true);
  assert.equal(companyListRoute.includes('EXISTS (SELECT 1 FROM company_projects'), true, 'projectsOnly must be resolved in one server query, not N browser probes');
  assert.equal(compare.includes('loadLiveCorporateFinancingState'), false, 'Compare must not fetch company/profile twice per company');
  assert.equal(compare.includes('corporateFinancingPreferences'), true, 'Compare must reuse financing preferences from its existing profile response');
  assert.equal(snapshotClient.includes("query.set('cache', '1')"), true, 'Compare Corporate snapshots must be able to opt into the server runtime cache');
  assert.equal(apiIndex.includes('buildCorporateRuntimeFingerprint'), true, 'Corporate snapshot route must use an input-versioned persistent cache');
  assert.equal(apiIndex.includes('readPersistentJsonCache'), true);
  assert.equal(tierWrapper.includes('TIER_RESPONSE_CACHE_NAMESPACE'), true, 'Tier route must cache completed canonical assessments across serverless instances');
  assert.equal(tierWrapper.includes('buildTierRuntimeFingerprint'), true);
  assert.equal(cycleRuntime.includes('STRESS_PRICE_CACHE_NAMESPACE'), true, 'Cycle stress deck must be shared through persistent cache');
  assert.equal(cycleRuntime.includes('prepareBaseCycleEval'), true, '5y and 7y cycle paths must reuse one base Corporate aggregation');

  console.log('spotResolutionInflight + Tier Compare read-path performance tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
