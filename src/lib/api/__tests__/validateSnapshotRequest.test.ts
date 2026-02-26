import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { validateSnapshotRequest } from '../validateSnapshotRequest.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runTests() {
  const rawJson = getProjectJsonV1Template();

  const legacyAccepted = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 12.5,
    },
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(legacyAccepted.ok, 'legacy top-level fx should validate');

  const autoWithoutLegacy = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 12.5,
    },
    fx: {
      source: 'auto',
      anchor: 'today',
      scenario: { mode: 'spot' },
    },
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(autoWithoutLegacy.ok, 'auto fx request without manual fallback should validate');

  const manualInvalid = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 12.5,
    },
    fx: {
      source: 'manual',
      manual_fx_USD_to_TargetCurrency: 0,
    },
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(!manualInvalid.ok, 'manual fx with invalid value should fail');
  if (!manualInvalid.ok) {
    assert(
      manualInvalid.errors.some((error) => error.includes('fx.manual_fx_USD_to_TargetCurrency')),
      'manual fx invalid should produce manual fx validation error',
    );
  }

  const scenarioOmitted = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
    projects: [{ projectId: 'p1', rawJson }],
  });

  assert(scenarioOmitted.ok, 'scenario omitted should validate');
  if (scenarioOmitted.ok) {
    assert(scenarioOmitted.value.scenario.mode === 'spot', 'scenario omitted defaults to spot mode');
  }

  console.log('validateSnapshotRequest tests passed');
})();
