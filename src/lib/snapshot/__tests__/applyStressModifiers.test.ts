import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyStressModifiers } from '../applyStressModifiers.ts';
import type { SnapshotRequest } from '../../api/validateSnapshotRequest.ts';

async function loadFixture(): Promise<SnapshotRequest> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(fixtureRaw) as SnapshotRequest;
  const currentYear = new Date().getUTCFullYear();
  for (const project of parsed.projects) {
    const rawJson = project.rawJson as Record<string, unknown>;
    const time = rawJson.time as Record<string, unknown>;
    const tp = Number.isInteger(time.productionStartPeriod) ? (time.productionStartPeriod as number) : 0;
    time.productionStartYear = currentYear + tp;
  }
  return parsed;
}

test('applyStressModifiers updates tax, opex, sustaining and capex split in inputs', async () => {
  const base = await loadFixture();
  const project = base.projects[0].rawJson as Record<string, unknown>;
  const time = project.time as Record<string, unknown>;
  time.productionStartPeriod = 2;
  const economics = project.economics as Record<string, unknown>;
  economics.taxRate = 0.3;
  const series = project.series as Record<string, unknown>;
  series.capexUSD = [10, 20, 30, 40, 50];
  series.sustainingCapexUSD = [1, 1, 1, 1, 1];
  series.operatingCostsUSD = [2, 2, 2, 2, 2];
  series.reclamationUSD = [3, 3, 3, 3, 3];

  const out = applyStressModifiers(base, {
    initialCapex2x: true,
    sustainingCapex15: true,
    opex25: true,
    taxPlus5pp: true,
    closure2x: true,
    tpPlus2: true,
  });

  assert.deepEqual(out.edgeCases, []);
  const stressedProject = out.stressedInput.projects[0].rawJson as Record<string, unknown>;
  const stressedSeries = stressedProject.series as Record<string, unknown>;
  assert.deepEqual(stressedSeries.capexUSD, [20, 40, 30, 40, 50]);
  assert.deepEqual(stressedSeries.sustainingCapexUSD, [1.5, 1.5, 1.5, 1.5, 1.5]);
  assert.deepEqual(stressedSeries.operatingCostsUSD, [2.5, 2.5, 2.5, 2.5, 2.5]);
  assert.deepEqual(stressedSeries.reclamationUSD, [6, 6, 6, 6, 6]);
  assert.equal((stressedProject.economics as Record<string, unknown>).taxRate, 0.35);
  assert.equal(out.stressedInput.scenario.delayPeriods, 2);
});

test('applyStressModifiers reports explicit tp edge case when tp+2 exceeds masterN', async () => {
  const base = await loadFixture();
  const raw = base.projects[0].rawJson as Record<string, unknown>;
  const time = raw.time as Record<string, unknown>;
  time.masterN = 2;
  time.productionStartPeriod = 2;

  const out = applyStressModifiers(base, { tpPlus2: true });
  assert.ok(out.edgeCases.some((line) => line.includes('out of bounds')));
});
