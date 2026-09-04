import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runCorporateSnapshotPipeline } from '../../../snapshot/runCorporateSnapshot.ts';

const body = JSON.parse(await readFile('scripts/fixtures/snapshot-requests/abra_minimal.json', 'utf8'));
for (const project of body.projects) {
  project.rawJson.version = 'project_json_v2';
  project.rawJson.time.productionStartYear = body.valuationYear + project.rawJson.time.productionStartPeriod;
}

test('snapshot publishes isolated Corporate equity value without replacing canonical NAV/DCF', async () => {
  const result = await runCorporateSnapshotPipeline({ body, refresh: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const snapshot = result.snapshot as Record<string, any>;
  const output = snapshot.corporateEquityValue;
  assert.ok(output);
  assert.equal(output.basis, 'opening_balance');
  assert.equal(output.definition, 'remaining_corporate_dcf_plus_opening_net_cash');
  assert.equal(output.valuationYear, body.valuationYear);

  const today = snapshot.canonicalValuationTimeline.periods.find(
    (row: Record<string, any>) => row.calendarYear === body.valuationYear,
  );
  assert.ok(today);
  assert.equal(output.current.year, body.valuationYear);
  assert.equal(output.current.underlyingAssetValueTargetCurrency, today.dcfAtPeriodTarget);
  assert.equal(
    output.current.valueTargetCurrency,
    today.dcfAtPeriodTarget + body.balanceSheet.cash_t0_TargetCurrency - body.balanceSheet.debt_t0_TargetCurrency,
  );

  // Existing canonical NAV remains its own contract; the new equity field is additive.
  assert.equal(snapshot.NAV_today_TargetCurrency, snapshot.financing.NAV_today_TargetCurrency);

  const futureMarkers = snapshot.projectStartMilestones as Array<Record<string, any>>;
  assert.equal(output.productionStarts.length, futureMarkers.length);
  for (const point of output.productionStarts) {
    const period = snapshot.canonicalValuationTimeline.periods.find(
      (row: Record<string, any>) => row.calendarYear === point.year,
    );
    assert.ok(period);
    assert.equal(point.underlyingAssetValueTargetCurrency, period.dcfAtPeriodTarget);
    assert.equal(
      point.valueTargetCurrency,
      point.underlyingAssetValueTargetCurrency + point.openingCashTargetCurrency - point.openingDebtTargetCurrency,
    );
  }
});
