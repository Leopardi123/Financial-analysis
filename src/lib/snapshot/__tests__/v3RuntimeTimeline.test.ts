import assert from 'node:assert/strict';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const raw = clone(VIZCACHITAS_PFS_V3);
raw.meta = { ...raw.meta, projectId: 'p1', projectName: 'Vizcachitas PFS v3' };
raw.time.runtimePlacement = {
  productionStart: {
    year: 2031,
    sourceId: 'v3-runtime-regression',
    pageOrTable: 'test runtime placement',
    asOfDate: '2026-08-31',
  },
};

assert.equal(Object.prototype.hasOwnProperty.call(raw.time, 'productionStartYear'), false, 'V3 must not store flat productionStartYear');
assert.equal(JSON.stringify(raw).includes('productionStartYear'), false, 'V3 storage must remain free of legacy productionStartYear');

const body = {
  targetCurrency: 'USD',
  valuationYear: 2026,
  discountRate: 0.1,
  market: {
    shares_current: 100_000_000,
    price_current_TargetCurrency: 1,
  },
  balanceSheet: {
    cash_t0_TargetCurrency: 0,
    debt_t0_TargetCurrency: 0,
  },
  scenario: {
    mode: 'fixed',
    fixedPriceByKey: {
      CU_USD_LB: 3.68,
      MO_USD_TONNE: 28439.63182122,
      XAG_USD_TOZ: 21.79,
      XAU_USD_TOZ: 2000,
    },
  },
  fx: {
    source: 'manual',
    anchor: 'today',
    manual_fx_USD_to_TargetCurrency: 1,
    scenario: { mode: 'spot' },
  },
  projects: [{ projectId: 'p1', rawJson: raw }],
};

const result = await runCorporateSnapshotPipeline({ body, refresh: false });
assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.diagnostics));
if (!result.ok) process.exit(1);

assert.equal(result.snapshot.aggregation.corporateYearsByPeriod[0], 2028, 'V3 t=0 must be derived from productionStart=2031 and tp=3');
assert.equal(result.snapshot.aggregation.corporateYearsByPeriod[3], 2031, 'V3 productionStartPeriod must map to runtimePlacement.productionStart.year');
assert.equal(result.snapshot.aggregation.corporateMasterN, 32);
assert.equal(result.snapshot.series?.periodIndex.length, 33);
assert.ok(result.snapshot.series?.fcffUSD.every((value) => typeof value === 'number' && Number.isFinite(value)), 'Project runtime FCFF must be numeric');

// parseProjectJsonV1 installs only a read-only in-memory compatibility projection for
// remaining legacy readers. It must never become stored V3 data.
assert.equal(Object.prototype.hasOwnProperty.call(raw.time, 'productionStartYear'), false);
assert.equal((raw.time as unknown as { productionStartYear?: number }).productionStartYear, 2031);
assert.equal(JSON.stringify(raw).includes('productionStartYear'), false);

console.log('v3RuntimeTimeline.test.ts passed');
