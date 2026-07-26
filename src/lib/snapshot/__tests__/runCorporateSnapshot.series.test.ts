import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { computeEarliestMilestoneDcfPresentScalars, computeRoyaltiesFromRevenueSeries, runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';
import { computeProjectViewMetrics } from '../../projectView/computeProjectPreRevenueView.ts';

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(fixtureRaw) as Record<string, unknown>;
  const currentYear = new Date().getUTCFullYear();
  const projects = Array.isArray(parsed.projects) ? parsed.projects as Array<Record<string, unknown>> : [];
  for (const project of projects) {
    const rawJson = (project.rawJson ?? null) as Record<string, unknown> | null;
    if (!rawJson || typeof rawJson !== 'object') continue;
    rawJson.version = 'project_json_v2';
    const time = (rawJson.time ?? null) as Record<string, unknown> | null;
    if (!time || typeof time !== 'object') continue;
    const tp = Number.isInteger(time.productionStartPeriod) ? (time.productionStartPeriod as number) : 0;
    time.productionStartYear = currentYear + tp;
  }
  return parsed;
}

test('snapshot series exposes aligned totalRevenue_USD', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.ok(result.snapshot.series);
  assert.equal(result.snapshot.series.totalRevenue_USD.length, result.snapshot.aggregation.corporateMasterN + 1);
  assert.equal(result.snapshot.series.periodIndex.length, result.snapshot.aggregation.corporateMasterN + 1);
  assert.ok(result.snapshot.series.unitAudit);
});

test('null-safe aggregation keeps total revenue/P&L numeric even when some metal branches are sparse', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const revenue = result.snapshot.series?.totalRevenue_USD ?? [];
  const ebit = result.snapshot.series?.ebitUSD ?? [];
  const fcff = result.snapshot.series?.fcffUSD ?? [];
  assert.ok(revenue.every((value) => typeof value === 'number' && Number.isFinite(value)), 'totalRevenue should be numeric');
  assert.ok(ebit.every((value) => typeof value === 'number' && Number.isFinite(value)), 'ebit should be numeric');
  assert.ok(fcff.every((value) => typeof value === 'number' && Number.isFinite(value)), 'fcff should be numeric');
});

test('taxUSD is produced from economics.taxRate in live model and flows into FCFF when depreciation series is null', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  rawJson.economics = { taxRate: 0.35 };

  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  const capex = series.capexUSD as Array<number | null>;
  const length = operating.length;

  series.operatingCostsUSD = operating.map((_, t) => (t >= 2 ? 100 : 0));
  series.siteGandA_USD = operating.map(() => 0);
  series.sustainingCapexUSD = operating.map(() => 0);
  series.royaltiesUSD = operating.map(() => 0);
  series.reclamationUSD = operating.map(() => 0);
  series.byproductCreditsUSD = operating.map(() => 0);
  series.depreciationUSD = operating.map(() => null);
  series.workingCapitalDeltaUSD = operating.map(() => 0);
  series.capexUSD = capex.map((_, t) => (t >= 2 ? 0 : 10));

  const metals = rawJson.metals as Record<string, unknown>;
  const payableQtyByMetal = metals.payableQtyByMetal as Record<string, Array<number | null>>;
  const allMetals = Object.keys(payableQtyByMetal);
  for (const metal of allMetals) {
    payableQtyByMetal[metal] = Array.from({ length }, (_, t) => (metal === 'Au' && t >= 2 ? 1 : 0));
  }

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const taxUSD = result.snapshot.series?.taxUSD ?? [];
  const ebitUSD = result.snapshot.series?.ebitUSD ?? [];
  const fcffUSD = result.snapshot.series?.fcffUSD ?? [];

  const positiveTaxIndex = taxUSD.findIndex((value) => typeof value === 'number' && value > 0);
  assert.ok(positiveTaxIndex >= 0, 'expected at least one period with positive tax');

  const t = positiveTaxIndex;
  const ebit = ebitUSD[t] as number;
  const tax = taxUSD[t] as number;
  const fcff = fcffUSD[t] as number;
  assert.ok(Math.abs(tax - Math.max(0, ebit) * 0.35) < 1e-6, 'tax should follow max(0, EBIT) * taxRate');
  assert.ok(Math.abs(fcff - (ebit - tax)) < 1e-6, 'FCFF should include central tax series when all other FCFF components are zero');
});

test('inactive metal does not create false metal revenue failure diagnostics', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const metals = rawJson.metals as Record<string, unknown>;
  const payableQtyByMetal = metals.payableQtyByMetal as Record<string, Array<number | null>>;
  if (Array.isArray(payableQtyByMetal.Pb)) {
    payableQtyByMetal.Pb = payableQtyByMetal.Pb.map(() => 0);
  }

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const metalDiagnostics = (result.diagnostics.meta.metalRevenueDiagnostics ?? {}) as Record<string, Array<Record<string, unknown>>>;
  assert.equal(Array.isArray(metalDiagnostics.Pb) && metalDiagnostics.Pb.length > 0, false);
});

test('royalties resolve from royaltiesDetail using current-run gross revenue when rules are computable', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  series.royaltiesUSD = operating.map(() => null);
  rawJson.economicsBreakdown = {
    royaltiesDetail: [
      { id: 'nsr-2', label: 'NSR 2%', base: 'revenue', rateType: 'nsr_pct', rate: 2 },
    ],
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const gross = result.snapshot.series?.totalRevenue_USD ?? [];
  const royalties = result.snapshot.series?.royaltiesUSD ?? [];
  assert.equal(gross.length, royalties.length);
  for (let t = 0; t < gross.length; t += 1) {
    assert.ok(typeof gross[t] === 'number' && Number.isFinite(gross[t]));
    assert.ok(typeof royalties[t] === 'number' && Number.isFinite(royalties[t]));
    assert.ok(Math.abs((royalties[t] as number) - ((gross[t] as number) * 0.02)) < 1e-6);
  }
  const diag = Object.values(result.diagnostics.meta.royaltiesDiagnostics ?? {})[0];
  assert.equal(diag?.royaltiesSource, 'royaltiesDetail-current-run');
  assert.equal(diag?.royaltiesResolvedNumeric, true);
  assert.equal(diag?.computedPeriods, royalties.length);
  assert.equal(diag?.skippedPeriods, 0);
  assert.deepEqual(diag?.grossRevenueNullPeriods ?? [], []);
});

test('royalties fall back to series.royaltiesUSD when royaltiesDetail is not computable', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  const fallbackSeries = operating.map((_, t) => 100 + t);
  series.royaltiesUSD = fallbackSeries;
  rawJson.economicsBreakdown = {
    royaltiesDetail: [
      { id: 'ebit-based', label: 'EBIT Royalty', base: 'ebit', rateType: 'profit_pct', rate: 10 },
    ],
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.snapshot.series?.royaltiesUSD, fallbackSeries);
  const diag = Object.values(result.diagnostics.meta.royaltiesDiagnostics ?? {})[0];
  assert.equal(diag?.royaltiesSource, 'series.royaltiesUSD-fallback');
  assert.equal(diag?.royaltiesResolvedNumeric, true);
});

test('ebit and fcff stay numeric when royalties resolve via fallback series', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  series.royaltiesUSD = operating.map(() => 25);
  rawJson.economicsBreakdown = {
    royaltiesDetail: [
      { id: 'non-computable', label: 'Non computable', base: 'ebitda', rateType: 'margin_pct', rate: 5 },
    ],
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const ebit = result.snapshot.series?.ebitUSD ?? [];
  const fcff = result.snapshot.series?.fcffUSD ?? [];
  assert.ok(ebit.every((value) => typeof value === 'number' && Number.isFinite(value)));
  assert.ok(fcff.every((value) => typeof value === 'number' && Number.isFinite(value)));
});



test('royalties helper computes per-period and skips null gross revenue periods', () => {
  const royalties = computeRoyaltiesFromRevenueSeries({
    grossRevenueUSD: [null, null, 100, 120],
    ratePct: 5,
  });
  assert.deepEqual(royalties, [null, null, 5, 6]);
});

test('royalties helper computes numeric royalties when grossRevenueUSD is fully numeric', () => {
  const royalties = computeRoyaltiesFromRevenueSeries({
    grossRevenueUSD: [10, 20, 30, 40],
    ratePct: 5,
  });
  assert.deepEqual(royalties, [0.5, 1, 1.5, 2]);
});

test('snapshot series taxUSD follows max(0, ebit) * taxRate without NOL', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  const ebit = result.snapshot.series?.ebitUSD ?? [];
  const tax = result.snapshot.series?.taxUSD ?? [];
  const taxRate = 0.27;

  assert.equal(ebit.length, tax.length);
  for (let t = 0; t < ebit.length; t += 1) {
    const ebitAtT = ebit[t];
    const taxAtT = tax[t];
    if (ebitAtT === null) {
      assert.equal(taxAtT, null);
      continue;
    }

    const expected = Math.max(0, ebitAtT) * taxRate;
    if (taxAtT === null) {
      continue;
    }
    assert.ok(Math.abs((taxAtT as number) - expected) < 1e-6);
  }
});

test('snapshot series normalizes non-finite inputs to null', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operatingCostsUSD = [...(series.operatingCostsUSD as number[])];
  operatingCostsUSD[2] = Number.POSITIVE_INFINITY;
  series.operatingCostsUSD = operatingCostsUSD;

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.snapshot.series?.operatingCostsUSD[2], 0);
});


test('snapshot series exposes economics breakdown when provided', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  series.siteGandA_USD = (series.siteGandA_USD as Array<number | null>).map(() => null);
  rawJson.economicsBreakdown = {
    cogs: {
      miningUSD: (series.operatingCostsUSD as Array<number | null>).map(() => 10),
      millingUSD: (series.operatingCostsUSD as Array<number | null>).map(() => 5),
      siteGandA_USD: (series.operatingCostsUSD as Array<number | null>).map(() => 2),
    },
    selling: {
      tcRcUSD: (series.operatingCostsUSD as Array<number | null>).map(() => 1),
      transportUSD: (series.operatingCostsUSD as Array<number | null>).map(() => 1),
    },
    royaltiesDetail: [
      {
        id: 'nsr',
        label: 'NSR',
        base: 'revenue',
        rate: 0.01,
      },
    ],
    taxesDetail: {
      municipalRevenueTaxUSD: (series.operatingCostsUSD as Array<number | null>).map(() => 3),
    },
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.ok(result.snapshot.series?.economicsBreakdown);
  assert.equal(result.snapshot.series?.economicsBreakdown?.cogs?.miningUSD?.length, result.snapshot.aggregation.corporateMasterN + 1);
  assert.equal(result.snapshot.series?.royaltiesDetail?.[0]?.id, 'nsr');
  assert.equal(result.snapshot.series?.taxesDetail?.municipalRevenueTaxUSD?.length, result.snapshot.aggregation.corporateMasterN + 1);
});



test('projects-mode normalizes sparse/null project series and computes Lista2 metrics', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operations = rawJson.operations as Record<string, unknown>;
  const metals = rawJson.metals as Record<string, unknown>;

  series.capexUSD = [null, -100, null, 0];
  series.operatingCostsUSD = [null, 120, null, 130, null];
  series.sustainingCapexUSD = [null, null, 20];
  series.siteGandA_USD = [null, 5, null];
  series.depreciationUSD = [null, 10, null];
  series.workingCapitalDeltaUSD = [null, 1, null];
  series.reclamationUSD = [null, null, 2];
  series.byproductCreditsUSD = [null, null, null];

  const time = rawJson.time as Record<string, unknown>;
  const tp = Number.isInteger(time.productionStartPeriod) ? (time.productionStartPeriod as number) : 0;

  operations.oreMilledTonnes = [0, 0, 0, 0, 0, 0].map((_, idx) => (idx < tp ? 0 : (idx === tp ? 1000 : idx === tp + 2 ? 1200 : null)));
  operations.oreMinedTonnes = [0, 0, 0, 0, 0, 0].map((_, idx) => (idx < tp ? 0 : (idx === tp ? 900 : null)));
  operations.gradeByMetal = { Au: [null, null, null, null, null, null].map((value, idx) => (idx === tp + 1 ? 1.2 : value)) };
  operations.recoveryPctByMetal = { Au: [null, null, null, null, null, null].map((value, idx) => (idx === tp ? 0.9 : value)) };

  const payableQtyByMetal = metals.payableQtyByMetal as Record<string, Array<number | null>>;
  const firstMetal = Object.keys(payableQtyByMetal)[0];
  payableQtyByMetal[firstMetal] = [0, 0, 0, 0, 0, 0].map((_, idx) => (idx < tp ? 0 : (idx === tp ? 100 : idx === tp + 2 ? 130 : null)));

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(Number.isFinite(result.snapshot.NPV_today_TargetCurrency), true);
  assert.equal(result.diagnostics.warnings.some((warning) => warning.includes('Lista2 CF+DCF skipped: fcfUSD_total contains null/non-finite periods')), false);
});

test('projects-mode snapshot without market does not throw and nulls EV outputs', async () => {
  const body = await loadFixture();
  delete (body as { market?: unknown }).market;

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.snapshot.MarketCap_TargetCurrency, null);
  assert.equal(result.snapshot.EV_TargetCurrency, null);
  assert.equal(result.snapshot.EV_perShare_TargetCurrency, null);
  assert.equal(result.snapshot.EV_over_NPV, null);
  assert.equal(result.snapshot.EV_over_NAV, null);
  assert.equal(result.snapshot.P_over_NAV, null);
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes('market missing; EV/multiples will be null.')));
});




test('financing mix changes shares-per-share outputs but keeps enterprise totals invariant', async () => {
  const bodyA = await loadFixture();
  bodyA.financingPlan = { equity_fraction: 1, debt_fraction: 0 };
  const resultA = await runCorporateSnapshotPipeline({ body: bodyA, refresh: false });
  assert.equal(resultA.ok, true);
  if (!resultA.ok) return;

  const bodyB = await loadFixture();
  bodyB.financingPlan = { equity_fraction: 0, debt_fraction: 1 };
  const resultB = await runCorporateSnapshotPipeline({ body: bodyB, refresh: false });
  assert.equal(resultB.ok, true);
  if (!resultB.ok) return;

  assert.equal(resultA.snapshot.NPV_today_TargetCurrency, resultB.snapshot.NPV_today_TargetCurrency);
  assert.equal(resultA.snapshot.CF_LOM_TargetCurrency, resultB.snapshot.CF_LOM_TargetCurrency);
  assert.equal(resultA.snapshot.DCF_prodStart_present_TargetCurrency, resultB.snapshot.DCF_prodStart_present_TargetCurrency);

  assert.notEqual(resultA.snapshot.financing.shares_post_financing, resultB.snapshot.financing.shares_post_financing);
  assert.notEqual(resultA.snapshot.DCF_prodStart_present_perShare_TargetCurrency, resultB.snapshot.DCF_prodStart_present_perShare_TargetCurrency);
});

test('projects-mode per-share metrics default to post-financing FD shares while EV per share stays on common shares_current', async () => {
  const body = await loadFixture();
  const baseResult = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(baseResult.ok, true);
  if (!baseResult.ok) {
    return;
  }

  const fdBody = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const fdProjects = fdBody.projects as Array<Record<string, unknown>>;
  const fdRawJson = fdProjects[0].rawJson as Record<string, unknown>;
  fdRawJson.equity = { fdExtraShares: 500 };

  const fdResult = await runCorporateSnapshotPipeline({ body: fdBody, refresh: false });
  assert.equal(fdResult.ok, true);
  if (!fdResult.ok) {
    return;
  }

  assert.notEqual(baseResult.snapshot.CF_LOM_perShare_TargetCurrency, null);
  assert.notEqual(fdResult.snapshot.CF_LOM_perShare_TargetCurrency, null);
  assert.ok((fdResult.snapshot.CF_LOM_perShare_TargetCurrency as number) < (baseResult.snapshot.CF_LOM_perShare_TargetCurrency as number));

  assert.equal(fdResult.snapshot.EV_perShare_TargetCurrency, baseResult.snapshot.EV_perShare_TargetCurrency);
});

test('royaltiesDetail computes royalties from revenue rules and overrides series royalties when rules are computable', async () => {
  const baseBody = await loadFixture();
  const projects = baseBody.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const templateLength = (series.operatingCostsUSD as Array<number | null>).length;
  const allNullRoyalties = new Array<number | null>(templateLength).fill(null);

  rawJson.economicsBreakdown = {
    royaltiesDetail: [
      {
        id: 'nsr-1',
        label: 'NSR 1%',
        name: 'NSR 1%',
        base: 'revenue',
        rateType: 'NSR_pct',
        rate: 1,
        royaltyUSD: allNullRoyalties,
      },
      {
        id: 'nsr-3',
        label: 'NSR 3%',
        name: 'NSR 3%',
        base: 'revenue',
        rateType: 'NSR_pct',
        rate: 3,
        royaltyUSD: allNullRoyalties,
      },
    ],
  };

  series.royaltiesUSD = allNullRoyalties;
  const resultA = await runCorporateSnapshotPipeline({ body: baseBody, refresh: false });
  assert.equal(resultA.ok, true);
  if (!resultA.ok) return;

  const grossA = resultA.snapshot.series?.totalRevenue_USD ?? [];
  const royaltiesA = resultA.snapshot.series?.royaltiesUSD ?? [];
  assert.equal(grossA.length, royaltiesA.length);
  for (let t = 0; t < grossA.length; t += 1) {
    const gross = grossA[t];
    const royalty = royaltiesA[t];
    if (gross === null) {
      assert.equal(royalty, null);
      continue;
    }
    assert.ok(royalty !== null);
    assert.ok(Math.abs((royalty as number) - (gross * 0.04)) < 1e-6);
  }

  assert.ok(
    resultA.diagnostics.warnings.some((line) => line.includes('royalties: computed from royaltiesDetail (base=revenue')),
  );

  const bodyB = JSON.parse(JSON.stringify(baseBody)) as Record<string, unknown>;
  const projectsB = bodyB.projects as Array<Record<string, unknown>>;
  const rawJsonB = projectsB[0].rawJson as Record<string, unknown>;
  const seriesB = rawJsonB.series as Record<string, unknown>;
  const existingRoyalties = (seriesB.operatingCostsUSD as Array<number | null>).map((_, idx) => idx + 11);
  seriesB.royaltiesUSD = existingRoyalties;

  const resultB = await runCorporateSnapshotPipeline({ body: bodyB, refresh: false });
  assert.equal(resultB.ok, true);
  if (!resultB.ok) return;

  assert.notDeepEqual(resultB.snapshot.series?.royaltiesUSD, existingRoyalties);

  assert.ok(
    resultB.diagnostics.warnings.includes('royalties: computed royalties used; series.royaltiesUSD ignored due to royaltiesDetail precedence'),
  );
  const detail = resultB.snapshot.series?.royaltiesDetail ?? [];
  assert.equal(detail.length, 2);
  const derivedTotal = (detail[0].royaltyUSD ?? []).map((_, t) => {
    let sum = 0;
    let hasFinite = false;
    for (const item of detail) {
      const value = item.royaltyUSD?.[t] ?? null;
      if (typeof value === 'number' && Number.isFinite(value)) {
        hasFinite = true;
        sum += value;
      }
    }
    return hasFinite ? sum : null;
  });

  const grossB = resultB.snapshot.series?.totalRevenue_USD ?? [];
  for (let t = 0; t < grossB.length; t += 1) {
    const gross = grossB[t];
    const royalty = derivedTotal[t];
    if (gross === null) {
      assert.equal(royalty, null);
      continue;
    }
    assert.ok(royalty !== null);
    assert.ok(Math.abs((royalty as number) - (gross * 0.04)) < 1e-6);
  }
});

test('tax chain uses EBIT=EBITDA-depreciation and taxRate null yields null tax', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;

  rawJson.economics = { ...(rawJson.economics as Record<string, unknown>), taxRate: 0.25 };
  series.depreciationUSD = (series.operatingCostsUSD as Array<number | null>).map(() => 10);
  series.royaltiesUSD = (series.operatingCostsUSD as Array<number | null>).map(() => null);
  rawJson.economicsBreakdown = {
    royaltiesDetail: [
      { id: 'nsr-5', label: 'NSR 5%', base: 'revenue', rateType: 'NSR_pct', rate: 5 },
    ],
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const outSeries = result.snapshot.series;
  assert.ok(outSeries);
  const ebitda = outSeries?.ebitdaUSD ?? [];
  const ebit = outSeries?.ebitUSD ?? [];
  const dep = outSeries?.depreciationUSD ?? [];
  const tax = outSeries?.taxUSD ?? [];
  const taxableIncome = outSeries?.taxableIncomeUSD ?? [];
  const royalties = outSeries?.royaltiesUSD ?? [];

  for (let t = 0; t < ebitda.length; t += 1) {
    if (ebitda[t] === null || dep[t] === null) {
      assert.equal(ebit[t], null);
      continue;
    }
    assert.equal(ebit[t], (ebitda[t] as number) - (dep[t] as number));
    assert.ok(royalties[t] === null || royalties[t]! >= 0);
    const expectedTaxable = Math.max(0, ebit[t] as number);
    assert.equal(taxableIncome[t], expectedTaxable);
    assert.equal(tax[t], expectedTaxable * 0.25);
  }

  const nullTaxBody = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const nullProjects = nullTaxBody.projects as Array<Record<string, unknown>>;
  const nullRaw = nullProjects[0].rawJson as Record<string, unknown>;
  nullRaw.economics = { ...(nullRaw.economics as Record<string, unknown>), taxRate: null };

  const nullTaxResult = await runCorporateSnapshotPipeline({ body: nullTaxBody, refresh: false });
  assert.equal(nullTaxResult.ok, true);
  if (!nullTaxResult.ok) return;
  assert.ok((nullTaxResult.snapshot.series?.taxUSD ?? []).every((value) => value === null));
});


test('project FCFF identity counts reclamation once through EBIT', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  const length = operating.length;
  rawJson.economicsBreakdown = undefined;

  series.sustainingCapexUSD = operating.map((_, t) => (t >= 2 ? 7 : 0));
  series.reclamationUSD = operating.map((_, t) => (t === length - 1 ? 11 : 0));
  series.siteGandA_USD = operating.map(() => 0);
  series.byproductCreditsUSD = operating.map(() => 0);
  series.depreciationUSD = operating.map(() => 0);

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const warnings = result.diagnostics.warnings ?? [];
  assert.equal(warnings.some((warning) => warning.includes('FCFF identity')), false);

  const outSeries = result.snapshot.series;
  assert.ok(outSeries);
  const t = 2;
  const priorStyleFcff = (outSeries?.ebitUSD[t] as number) - (outSeries?.taxUSD[t] as number) + (outSeries?.depreciationUSD?.[t] as number) - (outSeries?.capexUSD[t] as number) - (outSeries?.workingCapitalDeltaUSD?.[t] as number);
  const fcffAtT = outSeries?.fcffUSD[t] as number;
  const sustainingAtT = outSeries?.sustainingCapexUSD[t] as number;
  assert.equal(fcffAtT - priorStyleFcff, -sustainingAtT);

  const last = (outSeries?.fcffUSD.length ?? 1) - 1;
  const priorAtLast = (outSeries?.ebitUSD[last] as number) - (outSeries?.taxUSD[last] as number) + (outSeries?.depreciationUSD?.[last] as number) - (outSeries?.capexUSD[last] as number) - (outSeries?.workingCapitalDeltaUSD?.[last] as number) - (outSeries?.sustainingCapexUSD[last] as number);
  assert.equal((outSeries?.fcffUSD[last] as number) - priorAtLast, 0);

  assert.equal(outSeries?.totalCapexUSD[t], (outSeries?.capexUSD[t] as number) + (outSeries?.sustainingCapexUSD[t] as number));
});

test('project identity checks report no failures on valid periods and cannot evaluate on null FCFF inputs', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const series = rawJson.series as Record<string, unknown>;
  const operating = series.operatingCostsUSD as Array<number | null>;
  rawJson.economicsBreakdown = undefined;
  series.sustainingCapexUSD = operating.map(() => 0);
  series.siteGandA_USD = operating.map(() => 0);
  series.reclamationUSD = operating.map(() => 0);
  series.byproductCreditsUSD = operating.map(() => 0);
  series.depreciationUSD = operating.map(() => 0);

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const identityWarnings = (result.diagnostics.warnings ?? []).filter((warning) => warning.includes('IDENTITY FAIL'));
  assert.equal(identityWarnings.length, 0);

  const cannotEvaluateWarnings = (result.diagnostics.warnings ?? []).filter((warning) => warning.includes('cannot evaluate FCFF identity'));
  assert.equal(cannotEvaluateWarnings.length, 0);

  const nullBody = await loadFixture();
  const nullProjects = nullBody.projects as Array<Record<string, unknown>>;
  const nullRawJson = nullProjects[0].rawJson as Record<string, unknown>;
  const nullSeries = nullRawJson.series as Record<string, unknown>;
  const baseArray = nullSeries.capexUSD as Array<number | null>;
  nullRawJson.economicsBreakdown = undefined;
  nullSeries.sustainingCapexUSD = baseArray.map(() => 0);
  nullSeries.siteGandA_USD = baseArray.map(() => 0);
  nullSeries.reclamationUSD = baseArray.map(() => 0);
  nullSeries.byproductCreditsUSD = undefined;
  nullSeries.depreciationUSD = baseArray.map(() => 0);

  const nullResult = await runCorporateSnapshotPipeline({ body: nullBody, refresh: false });
  assert.equal(nullResult.ok, true);
  if (!nullResult.ok) return;

  const nullWarnings = nullResult.diagnostics.warnings ?? [];
  assert.equal(nullWarnings.some((warning) => warning.includes('cannot evaluate FCFF identity')), false);
  assert.equal(nullWarnings.some((warning) => warning.includes('FCFF identity')), false);
});

test('delayPeriods=0 with report/spot prices reproduces baseline snapshot metrics', async () => {
  const baseBody = await loadFixture();
  const baseResult = await runCorporateSnapshotPipeline({ body: baseBody, refresh: false });
  assert.equal(baseResult.ok, true);
  if (!baseResult.ok) return;

  const delayedBody = JSON.parse(JSON.stringify(baseBody)) as Record<string, unknown>;
  delayedBody.scenario = { ...(delayedBody.scenario as Record<string, unknown>), delayPeriods: 0 };
  const delayedResult = await runCorporateSnapshotPipeline({ body: delayedBody, refresh: false });
  assert.equal(delayedResult.ok, true);
  if (!delayedResult.ok) return;

  const metrics: Array<keyof typeof baseResult.snapshot> = [
    'NPV_today_TargetCurrency',
    'CF_LOM_USD',
    'DCF_prodStart_exCapex_USD',
    'Payback_real_years',
  ];

  for (const metric of metrics) {
    assert.equal(delayedResult.snapshot[metric], baseResult.snapshot[metric]);
  }
});

test('delayPeriods edge case tp_eff > masterN yields null dependent metrics with failure reason', async () => {
  const body = await loadFixture();
  body.scenario = { ...(body.scenario as Record<string, unknown>), delayPeriods: 100 };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.snapshot.DCF_prodStart_exCapex_USD, null);
  assert.equal(result.snapshot.Payback_real_years, null);
  assert.ok(result.diagnostics.errors.some((line) => line.includes('failure_reason=tp_eff')));
});

test('corporate modeled aggregates debt by project financing fractions and keeps new shares equity-only', async () => {
  const body = await loadFixture();
  const secondProject = JSON.parse(JSON.stringify((body.projects as Array<Record<string, unknown>>)[0])) as Record<string, unknown>;
  secondProject.projectId = 'ABRA_MINIMAL_2';
  const secondRaw = secondProject.rawJson as Record<string, unknown>;
  (secondRaw.meta as Record<string, unknown>).projectId = 'ABRA_MINIMAL_2';
  (secondRaw.meta as Record<string, unknown>).projectName = 'Abra Minimal 2';
  ((secondRaw.series as Record<string, unknown>).capexUSD as number[])[0] = 100000000;
  ((secondRaw.series as Record<string, unknown>).capexUSD as number[])[1] = 50000000;
  const shiftProductionSeries = (record: Record<string, unknown>, shift: number) => { for (const [key, value] of Object.entries(record)) if (Array.isArray(value)) record[key] = value.map((_, index) => index < 2 + shift ? 0 : value[index - shift] ?? 0); };
  const secondTime = secondRaw.time as Record<string, unknown>;
  secondTime.productionStartPeriod = 3;
  secondTime.productionStartYear = new Date().getUTCFullYear() + 3;
  shiftProductionSeries(secondRaw.operations as Record<string, unknown>, 1);
  shiftProductionSeries((secondRaw.metals as Record<string, unknown>).payableQtyByMetal as Record<string, unknown>, 1);
  (body.projects as Array<Record<string, unknown>>).push(secondProject);
  const thirdProject = JSON.parse(JSON.stringify((body.projects as Array<Record<string, unknown>>)[0])) as Record<string, unknown>;
  thirdProject.projectId = 'ABRA_MINIMAL_3';
  const thirdRaw = thirdProject.rawJson as Record<string, unknown>;
  (thirdRaw.meta as Record<string, unknown>).projectId = 'ABRA_MINIMAL_3';
  (thirdRaw.meta as Record<string, unknown>).projectName = 'Abra Minimal 3';
  const thirdTime = thirdRaw.time as Record<string, unknown>;
  thirdTime.productionStartPeriod = 4;
  thirdTime.productionStartYear = new Date().getUTCFullYear() + 4;
  ((thirdRaw.series as Record<string, unknown>).capexUSD as number[])[0] = 100000000;
  ((thirdRaw.series as Record<string, unknown>).capexUSD as number[])[1] = 50000000;
  shiftProductionSeries(thirdRaw.operations as Record<string, unknown>, 2);
  shiftProductionSeries((thirdRaw.metals as Record<string, unknown>).payableQtyByMetal as Record<string, unknown>, 2);
  (body.projects as Array<Record<string, unknown>>).push(thirdProject);

  body.financingPlan = {
    equity_fraction: 0.5,
    debt_fraction: 0.5,
    equity_raise_price_TargetCurrency: 1,
  };
  body.financingPlanByProject = {
    ABRA_MINIMAL: { equity_fraction: 0.5, debt_fraction: 0.5 },
    ABRA_MINIMAL_2: { equity_fraction: 0.5, debt_fraction: 0.5 },
    ABRA_MINIMAL_3: { equity_fraction: 0.5, debt_fraction: 0.5 },
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const totalCapexToFinanceUSD = (200000000 + 120000000) + 2 * (100000000 + 50000000);
  const fx = (body.fx as Record<string, unknown>).manual_fx_USD_to_TargetCurrency as number;
  const initialCashUSD = ((body.balanceSheet as Record<string, number>).cash_t0_TargetCurrency ?? 0) / fx;
  const expectedExternalNeedUSD = totalCapexToFinanceUSD - initialCashUSD;
  const expectedDebtUSD = expectedExternalNeedUSD * 0.5;
  const expectedNewShares = (expectedExternalNeedUSD * 0.5 * fx) / 1;

  const financingDebug = result.diagnostics.meta.corporateFinancingDebug;
  assert.ok(financingDebug);
  assert.ok(financingDebug?.totalDebt_USD !== null);
  assert.ok(financingDebug?.totalNewShares !== null);
  assert.ok(Math.abs((financingDebug?.totalDebt_USD as number) - expectedDebtUSD) < 1e-6);
  assert.ok(Math.abs((financingDebug?.totalNewShares as number) - expectedNewShares) < 1e-6);
  const corporateTimeSeries = (result.snapshot as unknown as { corporateValuationTimeSeries?: { rows: Array<{ year: number; sharesPf: number | null; npvAbsolute: number | null; npvPerShare: number | null; dcfAbsolute: number | null; dcfPerShare: number | null }>; projectMarkers: Array<{ projectId: string; constructionStartPeriod: number | null; productionStartPeriod: number | null; productionStartYear: number | null; firstContributionPeriod: number | null }> } }).corporateValuationTimeSeries;
  assert.equal(corporateTimeSeries?.rows.length, result.snapshot.series?.yearsByPeriod.length);
  assert.deepEqual(corporateTimeSeries?.projectMarkers.map((marker) => marker.projectId).sort(), ['ABRA_MINIMAL','ABRA_MINIMAL_2','ABRA_MINIMAL_3']);
  assert.deepEqual(corporateTimeSeries?.projectMarkers.map((marker) => marker.productionStartPeriod).sort(), [2,3,4]);
  assert.equal(new Set(corporateTimeSeries?.rows.map((row) => row.sharesPf)).size, 1);
  for (const marker of corporateTimeSeries?.projectMarkers ?? []) assert.ok(corporateTimeSeries?.rows.some((row) => row.year === marker.productionStartYear));
  for (const marker of corporateTimeSeries?.projectMarkers ?? []) assert.equal(marker.firstContributionPeriod, marker.constructionStartPeriod);
  for (const row of corporateTimeSeries?.rows ?? []) {
    if (row.npvAbsolute !== null && row.sharesPf !== null) assert.ok(Math.abs((row.npvPerShare ?? 0) - row.npvAbsolute / row.sharesPf) < 1e-9);
    if (row.dcfAbsolute !== null && row.sharesPf !== null) assert.ok(Math.abs((row.dcfPerShare ?? 0) - row.dcfAbsolute / row.sharesPf) < 1e-9);
  }
});

test('corporate snapshot applies latest-quarter cash exactly once before debt/equity', async () => {
  const body = await loadFixture();
  const raw = ((body.projects as Array<Record<string, unknown>>)[0].rawJson as Record<string, unknown>);
  const series = raw.series as Record<string, unknown>;
  const capex = series.capexUSD as number[];
  series.capexUSD = capex.map((_, index) => index === 0 ? 300_000_000 : 0);
  body.balanceSheet = { cash_t0_TargetCurrency: 100_000_000, debt_t0_TargetCurrency: 0 };
  body.fx = { source: 'manual', anchor: 'today', manual_fx_USD_to_TargetCurrency: 1, scenario: { mode: 'spot' } };
  body.market = { shares_current: 300_000_000, price_current_TargetCurrency: 3 };
  body.financingPlan = { use_cash_first: false, cash_use_percent: 1, debt_fraction: 0, equity_fraction: 1, equity_raise_price_TargetCurrency: 3 };

  const disabled = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(disabled.ok, true);
  if (!disabled.ok) return;
  assert.equal(disabled.snapshot.financing.cash_used_for_build_TargetCurrency, 0);
  assert.equal(disabled.snapshot.financing.equity_raised_TargetCurrency, 300_000_000);
  assert.equal(disabled.snapshot.financing.new_shares, 100_000_000);
  assert.equal(disabled.snapshot.financing.shares_post_financing, 400_000_000);

  body.financingPlan = { use_cash_first: true, cash_use_percent: 1, debt_fraction: 0, equity_fraction: 1, equity_raise_price_TargetCurrency: 3 };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const financing = result.snapshot.financing;
  assert.equal(financing.cash_used_for_build_TargetCurrency, 100_000_000);
  assert.equal(financing.remaining_funding_need_TargetCurrency, 200_000_000);
  assert.equal(financing.new_debt_TargetCurrency, 0);
  assert.equal(financing.equity_raised_TargetCurrency, 200_000_000);
  assert.ok(Math.abs((financing.new_shares ?? 0) - 66_666_666.66666667) < 1e-6);
  assert.ok(Math.abs((financing.shares_post_financing ?? 0) - 366_666_666.6666667) < 1e-6);
  assert.equal(financing.corporate_cash_waterfall?.totalInitialCashUsed, 100_000_000);
  assert.equal(financing.corporate_cash_waterfall?.remainingExternalFundingNeed, 200_000_000);
  assert.equal(result.snapshot.financing.NPV_today_TargetCurrency, disabled.snapshot.financing.NPV_today_TargetCurrency);
  assert.equal(result.snapshot.financing.NAV_today_TargetCurrency, disabled.snapshot.financing.NAV_today_TargetCurrency);
  assert.equal(result.snapshot.DCF_prodStart_exCapex_TargetCurrency, disabled.snapshot.DCF_prodStart_exCapex_TargetCurrency);
  const corporateProdStart = result.snapshot as unknown as { NAV_prodStart_TargetCurrency: number | null; NAV_prodStart_perShare_TargetCurrency: number | null };
  const disabledProdStart = disabled.snapshot as unknown as { NAV_prodStart_TargetCurrency: number | null };
  assert.equal(corporateProdStart.NAV_prodStart_TargetCurrency, disabledProdStart.NAV_prodStart_TargetCurrency);
  assert.notEqual(result.snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency, disabled.snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency);

  const snapshotSeries = result.snapshot.series as { fcffUSD: Array<number | null>; capexUSD: Array<number | null>; totalRevenue_USD: Array<number | null>; ebitUSD: Array<number | null> };
  const productionStartPeriod = ((raw.time as Record<string, unknown>).productionStartPeriod as number);
  const projectEquivalent = computeProjectViewMetrics({
    targetCurrency: 'CAD', fxUSDToTarget: 1, discountRate: body.discountRate as number, masterN: snapshotSeries.fcffUSD.length - 1,
    sharesCurrent: 300_000_000, sharesPostFinancingInput: financing.shares_post_financing, priceCurrentTarget: 3,
    cashCurrentTarget: 100_000_000, debtCurrentTarget: 0, enterpriseAdjustmentsTarget: 0,
    fcfUSD: snapshotSeries.fcffUSD, capexUSD: snapshotSeries.capexUSD, grossRevenueUSD: snapshotSeries.totalRevenue_USD,
    ebitUSD: snapshotSeries.ebitUSD, payableAuEqOz: new Array(snapshotSeries.fcffUSD.length).fill(1), sustainingCostUSD: new Array(snapshotSeries.fcffUSD.length).fill(0),
    productionStartPeriod, financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
  });
  assert.equal(corporateProdStart.NAV_prodStart_TargetCurrency, projectEquivalent.list2.NAV_prodStart.value);
  assert.equal(result.snapshot.DCF_prodStart_exCapex_TargetCurrency, projectEquivalent.list2.DCF_Target.value);
  assert.equal(corporateProdStart.NAV_prodStart_perShare_TargetCurrency, projectEquivalent.list2.NAV_prodStart_perShare.value);
  assert.equal(result.snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency, projectEquivalent.list2.DCF_perShare.value);
  const chartFlows = (result.snapshot as unknown as { project?: { chartFlows?: {
    dcfProdstartExCapexPerShareSeries: Array<number | null>;
    navByPeriodPerShareSeries: Array<number | null>;
    yearsByPeriod: number[];
    productionStartPeriod: number;
    discountRate: number;
  } } }).project?.chartFlows;
  assert.ok(chartFlows);
  assert.equal(chartFlows.productionStartPeriod, productionStartPeriod);
  assert.equal(chartFlows.discountRate, body.discountRate);
  assert.equal(chartFlows.yearsByPeriod[productionStartPeriod] - chartFlows.yearsByPeriod[0], productionStartPeriod);
  const corporateRows = (result.snapshot as unknown as { corporateValuationTimeSeries: { rows: Array<{ dcfExCapexPerShare: number | null; navPerShare: number | null }> } }).corporateValuationTimeSeries.rows;
  for (let period = 0; period < chartFlows.dcfProdstartExCapexPerShareSeries.length; period += 1) {
    assert.equal(chartFlows.dcfProdstartExCapexPerShareSeries[period], corporateRows[period].dcfExCapexPerShare);
    assert.equal(chartFlows.navByPeriodPerShareSeries[period], corporateRows[period].navPerShare);
  }
});

test('reported debt changes NAV but cannot alter the corporate cash waterfall or High absolute', async () => {
  const body = await loadFixture();
  body.balanceSheet = { cash_t0_TargetCurrency: 100_000_000, debt_t0_TargetCurrency: 0 };
  body.fx = { source: 'manual', anchor: 'today', manual_fx_USD_to_TargetCurrency: 1, scenario: { mode: 'spot' } };
  body.financingPlan = { use_cash_first: false, cash_use_percent: 1, debt_fraction: 0, equity_fraction: 1, equity_raise_price_TargetCurrency: 3 };
  const debtFree = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(debtFree.ok, true);
  if (!debtFree.ok) return;
  body.balanceSheet = { cash_t0_TargetCurrency: 100_000_000, debt_t0_TargetCurrency: 50_000_000 };
  const indebted = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(indebted.ok, true);
  if (!indebted.ok) return;
  assert.deepEqual(indebted.snapshot.financing.corporate_cash_waterfall, debtFree.snapshot.financing.corporate_cash_waterfall);
  assert.equal(indebted.snapshot.DCF_prodStart_exCapex_TargetCurrency, debtFree.snapshot.DCF_prodStart_exCapex_TargetCurrency);
  const debtFreeNav = (debtFree.snapshot as unknown as { NAV_prodStart_TargetCurrency: number }).NAV_prodStart_TargetCurrency;
  const indebtedNav = (indebted.snapshot as unknown as { NAV_prodStart_TargetCurrency: number }).NAV_prodStart_TargetCurrency;
  assert.equal(
    debtFreeNav - indebtedNav,
    50_000_000,
  );
});

test('corporate modeled milestones exclude tp=0 projects and include future tp>0 projects', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const futureProject = JSON.parse(JSON.stringify(projects[0])) as Record<string, unknown>;
  const firstProjectRaw = projects[0].rawJson as Record<string, unknown>;
  const firstTime = firstProjectRaw.time as Record<string, unknown>;
  const corporateNowYear = (firstTime.productionStartYear as number) - (firstTime.productionStartPeriod as number);

  firstTime.productionStartPeriod = 0;
  firstTime.productionStartYear = corporateNowYear;
  const firstOperations = firstProjectRaw.operations as Record<string, unknown>;
  const firstMetals = firstProjectRaw.metals as Record<string, unknown>;
  const oreMined = [...(firstOperations.oreMinedTonnes as Array<number | null>)];
  const oreMilled = [...(firstOperations.oreMilledTonnes as Array<number | null>)];
  const payableByMetal = firstMetals.payableQtyByMetal as Record<string, Array<number | null>>;
  oreMined[0] = typeof oreMined[0] === 'number' && oreMined[0] > 0 ? oreMined[0] : oreMined.find((value) => typeof value === 'number' && value > 0) ?? 1;
  oreMilled[0] = typeof oreMilled[0] === 'number' && oreMilled[0] > 0 ? oreMilled[0] : oreMilled.find((value) => typeof value === 'number' && value > 0) ?? 1;
  firstOperations.oreMinedTonnes = oreMined;
  firstOperations.oreMilledTonnes = oreMilled;
  for (const [metal, series] of Object.entries(payableByMetal)) {
    const nextSeries = [...series];
    nextSeries[0] = typeof nextSeries[0] === 'number' && nextSeries[0] > 0 ? nextSeries[0] : nextSeries.find((value) => typeof value === 'number' && value > 0) ?? 1;
    payableByMetal[metal] = nextSeries;
  }

  futureProject.projectId = 'ABRA_FUTURE_MILESTONE';
  const futureRaw = futureProject.rawJson as Record<string, unknown>;
  (futureRaw.meta as Record<string, unknown>).projectId = 'ABRA_FUTURE_MILESTONE';
  (futureRaw.meta as Record<string, unknown>).projectName = 'Abra Future Milestone';
  const futureTime = futureRaw.time as Record<string, unknown>;
  futureTime.productionStartPeriod = 2;
  futureTime.productionStartYear = corporateNowYear + 2;
  projects.push(futureProject);

  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const markers = (result.snapshot.modeledValuationTimeline?.markers ?? []) as Array<{
    yearLabelUsed: string | null;
    lista2Metrics?: {
      DCF_prodStart_exCapex_TargetCurrency: number | null;
      NPV_prodStart_TargetCurrency: number | null;
      NAV_prodStart_TargetCurrency: number | null;
      InitialCAPEX_incremental_TargetCurrency: number | null;
    };
  }>;
  assert.equal(markers.some((marker) => marker.yearLabelUsed === String(corporateNowYear)), false);
  assert.equal(markers.some((marker) => marker.yearLabelUsed === String(corporateNowYear + 2)), true);
});


test('corporate prod-start markers apply incremental initial capex windows to NPV and NAV', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const template = JSON.parse(JSON.stringify(projects[0])) as Record<string, unknown>;
  const templateRaw = template.rawJson as Record<string, unknown>;
  const templateTime = templateRaw.time as Record<string, unknown>;
  const corporateNowYear = (templateTime.productionStartYear as number) - (templateTime.productionStartPeriod as number);

  const makeProject = (projectId: string, tp: number, capexByTp: Record<number, number>): Record<string, unknown> => {
    const project = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;
    const raw = project.rawJson as Record<string, unknown>;
    const time = raw.time as Record<string, unknown>;
    const meta = raw.meta as Record<string, unknown>;
    const series = raw.series as Record<string, unknown>;

    project.projectId = projectId;
    meta.projectId = projectId;
    meta.projectName = projectId;
    time.productionStartPeriod = tp;
    time.productionStartYear = corporateNowYear + tp;

    const capexTemplate = series.capexUSD as Array<number | null>;
    const sustainingTemplate = series.sustainingCapexUSD as Array<number | null>;
    const capex = capexTemplate.map(() => 0);
    const sustaining = sustainingTemplate.map(() => 0);
    for (const [tpKey, value] of Object.entries(capexByTp)) {
      const idx = Number(tpKey);
      if (Number.isInteger(idx) && idx >= 0 && idx < capex.length) {
        capex[idx] = value;
      }
    }
    series.capexUSD = capex;
    series.sustainingCapexUSD = sustaining;

    const operations = raw.operations as Record<string, unknown>;
    const metals = raw.metals as Record<string, unknown>;
    const oreMined = [...(operations.oreMinedTonnes as Array<number | null>)];
    const oreMilled = [...(operations.oreMilledTonnes as Array<number | null>)];
    const oreMinedPositive = oreMined.find((value) => typeof value === 'number' && value > 0) ?? 1;
    const oreMilledPositive = oreMilled.find((value) => typeof value === 'number' && value > 0) ?? 1;
    for (let i = 0; i < oreMined.length; i += 1) oreMined[i] = i < tp ? 0 : (i === tp ? oreMinedPositive : oreMined[i]);
    for (let i = 0; i < oreMilled.length; i += 1) oreMilled[i] = i < tp ? 0 : (i === tp ? oreMilledPositive : oreMilled[i]);
    operations.oreMinedTonnes = oreMined;
    operations.oreMilledTonnes = oreMilled;

    const payableByMetal = metals.payableQtyByMetal as Record<string, Array<number | null>>;
    for (const [metal, seriesByMetal] of Object.entries(payableByMetal)) {
      const nextSeries = [...seriesByMetal];
      const positive = nextSeries.find((value) => typeof value === 'number' && value > 0) ?? 1;
      for (let i = 0; i < nextSeries.length; i += 1) {
        nextSeries[i] = i < tp ? 0 : (i === tp ? positive : nextSeries[i]);
      }
      payableByMetal[metal] = nextSeries;
    }

    return project;
  };

  body.projects = [
    makeProject('ABRA_TP0', 0, {}),
    makeProject('ABRA_2029', 2, { 0: 40, 1: 60 }),
    makeProject('ABRA_2031', 4, { 2: 50 }),
  ];


  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const markers = (result.snapshot.modeledValuationTimeline?.markers ?? []) as Array<{
    yearLabelUsed: string | null;
    lista2Metrics?: {
      DCF_prodStart_exCapex_TargetCurrency: number | null;
      NPV_prodStart_TargetCurrency: number | null;
      NAV_prodStart_TargetCurrency: number | null;
      InitialCAPEX_incremental_TargetCurrency: number | null;
    };
  }>;
  const years = markers.map((marker) => marker.yearLabelUsed);
  assert.deepEqual(years, [String(corporateNowYear + 2), String(corporateNowYear + 4)]);

  for (const marker of markers) {
    const metrics = marker.lista2Metrics;
    assert.ok(metrics);
    assert.notEqual(metrics?.DCF_prodStart_exCapex_TargetCurrency, null);
    assert.notEqual(metrics?.NPV_prodStart_TargetCurrency, null);
    assert.notEqual(metrics?.InitialCAPEX_incremental_TargetCurrency, null);
    assert.notEqual(metrics?.NAV_prodStart_TargetCurrency, null);

    const dcf = metrics?.DCF_prodStart_exCapex_TargetCurrency as number;
    const npv = metrics?.NPV_prodStart_TargetCurrency as number;
    const nav = metrics?.NAV_prodStart_TargetCurrency as number;
    const initialCapex = metrics?.InitialCAPEX_incremental_TargetCurrency as number;

    if (initialCapex > 0) {
      assert.notEqual(dcf, npv);
    }
    assert.ok(Math.abs((dcf - npv) - initialCapex) <= 0.01);
    const cashForNav: number | null = result.snapshot.financing.cash_for_nav_TargetCurrency ?? null;
    const debtPost: number | null = result.snapshot.financing.debt_t0_post_TargetCurrency;
    assert.notEqual(cashForNav, null);
    assert.notEqual(debtPost, null);
    assert.ok(Math.abs(nav - (npv + (cashForNav as number) - (debtPost as number))) <= 0.01);
  }
});


test('corporate DCF produktionsstart nuvärde scalar uses earliest milestone only and per-share uses shares_post_financing', () => {
  const result = computeEarliestMilestoneDcfPresentScalars({
    milestones: [
      { milestoneYear: 2031, tp_k: 6, dcfProdStartExCapex_TargetCurrency: 999 },
      { milestoneYear: 2029, tp_k: 4, dcfProdStartExCapex_TargetCurrency: 100 },
    ],
    discountRate: 0.10,
    shares_post_financing: 20,
  });

  const expectedPresent = 100 * (1 / (1.1 ** 4));
  assert.ok(Math.abs((result.DCF_prodStart_present_TargetCurrency as number) - expectedPresent) <= 1e-12);
  assert.ok(Math.abs((result.DCF_prodStart_present_perShare_TargetCurrency as number) - (expectedPresent / 20)) <= 1e-12);
});

test('corporate lista3 metrics are populated from corporate aggregates', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const lista3 = result.snapshot.corporate?.lista3Metrics;
  assert.ok(lista3);
  assert.ok(Array.isArray(result.diagnostics.meta.corporateLista3Debug?.series.fcfUSD_total));
  assert.ok(Array.isArray(result.diagnostics.meta.corporateLista3Debug?.series.capexUSD_total));
  assert.ok([
    lista3?.Payback_approx_years,
    lista3?.Payback_real_years,
    lista3?.ROI_10Y_pct,
    lista3?.IRR,
    lista3?.AISC_LOM,
    lista3?.BreakEven_AuEq,
    lista3?.CAPEX_per_Annual_AuEq,
    lista3?.LOM_avg_EBIT_ROCE,
    lista3?.LOM_discounted_EBIT_ROCE,
    lista3?.Kapitalavkastning_LOM,
    lista3?.Kapitalavkastning_per_Year,
  ].some((value) => value !== null));

  assert.equal(typeof lista3?.Kapitalavkastning_LOM === 'number', true);
  assert.equal(typeof lista3?.Kapitalavkastning_per_Year === 'number', true);

  const kapitalLomDebug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.Kapitalavkastning_LOM;
  assert.ok(kapitalLomDebug);
  assert.equal(typeof kapitalLomDebug?.intermediates?.fcf_sum_LOM, 'number');
  assert.equal(typeof kapitalLomDebug?.intermediates?.LOM_periods, 'number');
  assert.equal(Array.isArray(kapitalLomDebug?.missingInputs), true);

  const roicDebug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.Corporate_ROIC;
  const avgNopatRoicDebug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.LOM_avg_NOPAT_ROIC;
  assert.ok(roicDebug);
  assert.ok(avgNopatRoicDebug);
  assert.equal(roicDebug?.output?.value, null);
  assert.equal(typeof avgNopatRoicDebug?.output?.value === 'number', true);
  assert.equal(roicDebug?.missingInputs?.includes('nopatUSD_total') ?? false, false);
  assert.equal(roicDebug?.missingInputs?.includes('investedCapitalUSD_total'), true);
  assert.equal(avgNopatRoicDebug?.missingInputs?.includes('nopatUSD_total') ?? false, false);

  const debugMetric = result.diagnostics.meta.corporateLista3Debug?.perMetric?.AISC_LOM;
  assert.ok(debugMetric);
  assert.equal(typeof debugMetric?.output?.computedValuePreview !== 'undefined', true);
  assert.equal(typeof debugMetric?.output?.storedValue !== 'undefined', true);
});



test('corporate NOPAT sampleEbitUSD aligns with snapshot series ebitUSD (single source)', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const snapshotEbit = result.snapshot.series?.ebitUSD ?? [];
  const sampleEbit = result.diagnostics.meta.corporateLista3Debug?.corporateNopatInputs?.projectInputs?.[0]?.sampleEbitUSD ?? [];
  assert.ok(sampleEbit.length > 0);
  assert.deepEqual(snapshotEbit.slice(0, sampleEbit.length), sampleEbit);
});

test('corporate nopat aggregation populates Lista3 LOM_avg_NOPAT_ROIC when all project tax inputs exist', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const lista3 = result.snapshot.corporate?.lista3Metrics;
  const nopatSeries = result.diagnostics.meta.corporateLista3Debug?.series?.nopatUSD_total;
  assert.ok(Array.isArray(nopatSeries));

  const hasNullInLomRange = (() => {
    const tpMain = result.diagnostics.meta.corporateLista3Debug?.tp_main;
    if (!Array.isArray(nopatSeries) || typeof tpMain !== 'number' || tpMain < 0) return true;
    return nopatSeries.slice(tpMain).some((value) => value === null);
  })();

  if (hasNullInLomRange) {
    assert.equal(lista3?.LOM_avg_NOPAT_ROIC, null);
  } else {
    assert.equal(typeof lista3?.LOM_avg_NOPAT_ROIC, 'number');
  }
});

test('corporate nopat strict mode nulls periods when any project taxRate is missing', async () => {
  const body = await loadFixture();
  const projects = body.projects as Array<Record<string, unknown>>;
  const rawJson = projects[0].rawJson as Record<string, unknown>;
  const economics = (rawJson.economics ?? {}) as Record<string, unknown>;
  economics.taxRate = null;
  rawJson.economics = economics;

  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const lista3 = result.snapshot.corporate?.lista3Metrics;
  assert.equal(lista3?.LOM_avg_NOPAT_ROIC, null);

  const nopatSeries = result.diagnostics.meta.corporateLista3Debug?.series?.nopatUSD_total ?? [];
  assert.equal(nopatSeries.some((value) => value === null), true);

  const missing = result.diagnostics.meta.corporateLista3Debug?.corporateNopatInputs?.missingInputs ?? [];
  assert.equal(missing.length > 0, true);
  assert.equal(missing.some((entry) => entry.projectId === String(projects[0].projectId ?? projects[0].project_id)), true);
});

test('project npv spot range includes scenario metrics beyond npv', async () => {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const range = result.snapshot.project?.modeled?.npvSpotRange;
  assert.ok(range);
  assert.equal(Object.prototype.hasOwnProperty.call(range?.base ?? {}, 'irr'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(range?.base ?? {}, 'payback'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(range?.base ?? {}, 'lomAvgEbitRoce'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(range?.base ?? {}, 'kapitalavkastningLom'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(range?.base ?? {}, 'inSitu10YUsd'), true);
  assert.equal(typeof range?.base.irr === 'number' || range?.base.irr === null, true);
  assert.equal(typeof range?.base.payback === 'number' || range?.base.payback === null, true);
});

test('stressOptions taxPlus5pp recomputes tax series in engine outputs', async () => {
  const body = await loadFixture();
  const baseResult = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(baseResult.ok, true);
  if (!baseResult.ok) return;

  const stressedBody = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  stressedBody.stressOptions = { taxPlus5pp: true };
  const stressedResult = await runCorporateSnapshotPipeline({ body: stressedBody, refresh: false });
  assert.equal(stressedResult.ok, true);
  if (!stressedResult.ok) return;

  const baseTax = baseResult.snapshot.series?.taxUSD ?? [];
  const stressedTax = stressedResult.snapshot.series?.taxUSD ?? [];
  const idx = baseTax.findIndex((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  assert.ok(idx >= 0, 'expected positive tax period in base case');
  assert.ok((stressedTax[idx] as number) > (baseTax[idx] as number), 'stressed tax should be higher when tax rate is increased');
});
