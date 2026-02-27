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

  assert.equal(result.snapshot.series?.operatingCostsUSD[2], null);
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
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes('market: missing market block')));
});
