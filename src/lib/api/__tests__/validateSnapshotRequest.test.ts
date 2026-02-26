import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { validateSnapshotRequest } from '../validateSnapshotRequest.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runTests() {
  const rawJson = getProjectJsonV1Template();

  const inlineProjectsValid = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 12.5,
    },
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(inlineProjectsValid.ok, 'inline projects mode should validate');

  const symbolOnlyValid = validateSnapshotRequest({
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
    symbol: 'ABRA.V',
  });
  assert(symbolOnlyValid.ok, 'symbol-only mode should validate');

  const symbolAndProjectsInvalid = validateSnapshotRequest({
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
    symbol: 'ABRA.V',
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(!symbolAndProjectsInvalid.ok, 'symbol + projects must fail validation');
  if (!symbolAndProjectsInvalid.ok) {
    assert(
      symbolAndProjectsInvalid.errors.some((error) => error.includes('Exactly one of symbol or projects')),
      'symbol + projects should emit XOR error',
    );
  }

  const emptySymbolInvalid = validateSnapshotRequest({
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
    symbol: '   ',
  });
  assert(!emptySymbolInvalid.ok, 'empty symbol should fail validation');

  const missingSymbolInvalid = validateSnapshotRequest({
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
  });
  assert(!missingSymbolInvalid.ok, 'missing symbol/projects should fail validation');

  console.log('validateSnapshotRequest tests passed');
})();
