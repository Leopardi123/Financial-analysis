import assert from 'node:assert/strict';
import { resolveCanonicalCorporateSnapshotInputs } from '../snapshotInputResolver.ts';

const profile = {
  price: 2.5,
  currency: 'cad',
  sharesOutstanding: 999,
};

const statements = {
  balance: {
    commonStockSharesOutstanding: [100, 120],
    commonStockSharesIssued: [500, 600],
    cashAndCashEquivalents: [10, 25],
    cashAndShortTermInvestments: [1000, 2000],
    totalDebt: [50, 40],
    shortTermDebt: [1, 2],
    longTermDebt: [3, 4],
  },
  income: {
    weightedAverageShsOut: [90, 110],
    weightedAverageShsOutDil: [95, 115],
  },
};

const manualMetalPrices = {
  MO_USD_TONNE: {
    metalKey: 'MO_USD_TONNE',
    displayName: 'Molybdenum',
    unit: 'USD/tonne',
    value: 50_000,
    enteredAtUtc: '2026-09-01T00:00:00.000Z',
    expiresAtUtc: '2026-10-01T00:00:00.000Z',
  },
};

const defaultResolution = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'abc.v',
  profile,
  statements,
  projectIds: ['p1', 'p2'],
  manualExtraShares: 12,
  manualMetalPrices,
  valuationYear: 2026,
  discountRate: 0.1,
});

assert.ok(defaultResolution.request);
assert.equal(defaultResolution.request?.symbol, 'ABC.V');
assert.equal(defaultResolution.currentPriceTargetCurrency, 2.5);
assert.equal(defaultResolution.sharesCurrent, 120, 'must use the shared common-shares resolver, not issued/diluted Compare priority');
assert.equal(defaultResolution.cashCurrentTargetCurrency, 25, 'must use Corporate balance.cashAndCashEquivalents source');
assert.equal(defaultResolution.debtCurrentTargetCurrency, 40, 'must use Corporate balance.totalDebt source');
assert.equal(defaultResolution.targetCurrency, 'CAD');
assert.equal(defaultResolution.manualExtraShares, 12);
assert.equal(defaultResolution.sourceAudit.shares, 'STATEMENTS_COMMON');
assert.equal(defaultResolution.sourceAudit.cash, 'BALANCE.cashAndCashEquivalents');
assert.equal(defaultResolution.sourceAudit.debt, 'BALANCE.totalDebt');
assert.equal(defaultResolution.sourceAudit.financing, 'DEFAULT_100_EQUITY');
assert.equal(defaultResolution.sourceAudit.manualMetalPrices, 'SHARED_STORE');
assert.equal(defaultResolution.request?.financingPlan?.equity_fraction, undefined, 'canonical 100% equity split must remain an engine default, not a fake explicit user split');
assert.equal(defaultResolution.request?.financingPlan?.debt_fraction, undefined);
assert.equal(defaultResolution.request?.financingPlan?.use_cash_first, false, 'Corporate UI default is not to spend quarterly cash');
assert.equal(defaultResolution.request?.financingPlan?.cash_use_percent, 1);
assert.equal(defaultResolution.request?.financingPlanByProject, undefined);
assert.deepEqual(defaultResolution.request?.manualMetalPrices, manualMetalPrices);
assert.deepEqual(defaultResolution.request?.fx, { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } });

const mixedFinancing = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'ABC.V',
  profile,
  statements,
  projectIds: ['p1', 'p2'],
  financingPlan: {
    equity_fraction: 0.8,
    debt_fraction: 0.2,
    use_cash_first: true,
    cash_use_percent: 0.5,
  },
  financingPlanByProject: {
    p1: { equity_fraction: 0.5, debt_fraction: 0.5 },
  },
  valuationYear: 2026,
  discountRate: 0.1,
});

assert.ok(mixedFinancing.request);
assert.equal(mixedFinancing.sourceAudit.financing, 'EXPLICIT');
assert.equal(mixedFinancing.request?.financingPlanByProject?.p1?.equity_fraction, 0.5);
assert.equal(mixedFinancing.request?.financingPlanByProject?.p2?.equity_fraction, 0.8, 'missing project plan must resolve from the same global persisted plan');
assert.ok(Math.abs((mixedFinancing.request?.financingPlan?.equity_fraction ?? 0) - 0.65) < 1e-12, 'global Corporate mix must be the average of resolved project mixes');
assert.ok(Math.abs((mixedFinancing.request?.financingPlan?.debt_fraction ?? 0) - 0.35) < 1e-12);
assert.equal(mixedFinancing.request?.financingPlan?.use_cash_first, true);
assert.equal(mixedFinancing.request?.financingPlan?.cash_use_percent, 0.5);
assert.equal(mixedFinancing.request?.financingPlan?.equity_raise_price_TargetCurrency, 2.5);

const usdResolution = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'USD.TO',
  profile: { ...profile, currency: 'USD' },
  statements,
  projectIds: ['p1'],
  valuationYear: 2026,
  discountRate: 0.1,
});
assert.deepEqual(usdResolution.request?.fx, {
  source: 'manual',
  anchor: 'today',
  scenario: { mode: 'spot' },
  manual_fx_USD_to_TargetCurrency: 1,
}, 'USD identity FX must be explicit and identical in Corporate and Compare');

const missingBalance = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'ABC.V',
  profile,
  statements: {
    balance: { commonStockSharesOutstanding: [120] },
    income: statements.income,
  },
  projectIds: ['p1'],
  valuationYear: 2026,
  discountRate: 0.1,
});
assert.equal(missingBalance.request, null, 'unknown cash/debt must not be silently replaced with zero');
assert.ok(missingBalance.diagnostics.some((message) => message.includes('Current cash')));
assert.ok(missingBalance.diagnostics.some((message) => message.includes('Current debt')));

const missingMarket = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'ABC.V',
  profile: { currency: 'CAD' },
  statements: {
    balance: { cashAndCashEquivalents: [25], totalDebt: [40] },
    income: {},
  },
  projectIds: ['p1'],
  valuationYear: 2026,
  discountRate: 0.1,
});
assert.equal(missingMarket.request, null, 'missing market inputs must not be replaced with shares=1 or price=1 placeholders');
assert.equal(missingMarket.sourceAudit.shares, 'MISSING');
assert.equal(missingMarket.sourceAudit.price, 'MISSING');

// Cross-consumer contract: Corporate local UI state and Compare persisted state can
// arrive as independently-created objects, but the canonical resolver must reduce them
// to byte-for-byte equivalent snapshot economics.
const corporateSide = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'ABC.V', profile, statements, projectIds: ['p1', 'p2'],
  financingPlan: { equity_fraction: 0.75, debt_fraction: 0.25, use_cash_first: false, cash_use_percent: 0.8 },
  financingPlanByProject: { p1: { equity_fraction: 0.5, debt_fraction: 0.5 }, p2: { equity_fraction: 1, debt_fraction: 0 } },
  manualExtraShares: 1000, manualMetalPrices, valuationYear: 2026, discountRate: 0.1,
});
const compareSide = resolveCanonicalCorporateSnapshotInputs({
  symbol: 'abc.v', profile: { ...profile }, statements: JSON.parse(JSON.stringify(statements)), projectIds: ['p1', 'p2'],
  financingPlan: { debt_fraction: 0.25, equity_fraction: 0.75, cash_use_percent: 0.8, use_cash_first: false },
  financingPlanByProject: { p2: { debt_fraction: 0, equity_fraction: 1 }, p1: { debt_fraction: 0.5, equity_fraction: 0.5 } },
  manualExtraShares: 1000, manualMetalPrices: { ...manualMetalPrices }, valuationYear: 2026, discountRate: 0.1,
});
assert.deepEqual(compareSide.request, corporateSide.request, 'same company/settings must resolve to the same Corporate snapshot request');
assert.equal(compareSide.manualExtraShares, corporateSide.manualExtraShares);

console.log('snapshotInputResolver.test.ts passed');
