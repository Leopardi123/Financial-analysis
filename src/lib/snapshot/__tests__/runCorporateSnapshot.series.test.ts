import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  return JSON.parse(fixtureRaw) as Record<string, unknown>;
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
    assert.ok(taxAtT !== null);
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

  operations.oreMilledTonnes = [1000, null, 1200];
  operations.oreMinedTonnes = [900, null];
  operations.gradeByMetal = { Au: [null, 1.2, null] };
  operations.recoveryPctByMetal = { Au: [0.9, null] };

  const payableQtyByMetal = metals.payableQtyByMetal as Record<string, Array<number | null>>;
  const firstMetal = Object.keys(payableQtyByMetal)[0];
  payableQtyByMetal[firstMetal] = [100, null, 130, null];

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

test('royaltiesDetail derives royaltyUSD from revenue NSR_pct and only backfills series royalties when missing', async () => {
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
    resultA.diagnostics.warnings.includes('royaltiesDetail: derived royaltyUSD from base=revenue using NSR_pct rate(s); summed into series.royaltiesUSD'),
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

  assert.deepEqual(resultB.snapshot.series?.royaltiesUSD, existingRoyalties);
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
