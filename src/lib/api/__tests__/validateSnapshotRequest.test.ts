import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { buildProjectJsonV3Template } from '../../project/jsonv3/template.ts';
import { validateSnapshotRequest } from '../validateSnapshotRequest.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

(function runTests() {
  const rawJson = getProjectJsonV1Template();

  const inlineProjectsValid = validateSnapshotRequest({
    targetCurrency: 'SEK', valuationYear: 2026, discountRate: 0.1, fx_USD_to_TargetCurrency: 10,
    market: { shares_current: 100000000, price_current_TargetCurrency: 12.5 },
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(inlineProjectsValid.ok, 'inline projects mode should validate');
  if (inlineProjectsValid.ok) assert(inlineProjectsValid.value.valuationYear === 2026, 'explicit valuationYear should be preserved');

  const v3 = buildProjectJsonV3Template();
  v3.metals.payableQtyByMetal.Au[2] = 1000;
  const v3Inline = validateSnapshotRequest({
    targetCurrency: 'SEK', valuationYear: 2026, discountRate: 0.1, fx_USD_to_TargetCurrency: 10,
    projects: [{ projectId: 'v3', rawJson: v3 }],
  });
  assert(v3Inline.ok, 'inline project_json_v3 mode should validate through canonical parser');
  if (v3Inline.ok) {
    assert(v3Inline.value.projects[0].rawJson.version === 'project_json_v3', 'request validation must restore original v3 document before runtime');
  }

  const invalidV3 = JSON.parse(JSON.stringify(v3));
  invalidV3.economics.costModel.components = [];
  const invalidV3Result = validateSnapshotRequest({
    targetCurrency: 'SEK', valuationYear: 2026, discountRate: 0.1, fx_USD_to_TargetCurrency: 10,
    projects: [{ projectId: 'v3', rawJson: invalidV3 }],
  });
  assert(!invalidV3Result.ok, 'invalid V3 single-source contract should fail inline snapshot validation');

  const invalidValuationYear = validateSnapshotRequest({
    targetCurrency: 'SEK', valuationYear: 2026.5, discountRate: 0.1,
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(!invalidValuationYear.ok, 'fractional valuationYear should fail validation');

  const projectsWithoutMarketValid = validateSnapshotRequest({
    targetCurrency: 'SEK', discountRate: 0.1, fx_USD_to_TargetCurrency: 10,
    projects: [{ projectId: 'p1', rawJson }],
  });
  assert(projectsWithoutMarketValid.ok, 'projects mode without market should validate');
  if (projectsWithoutMarketValid.ok) {
    assert(projectsWithoutMarketValid.value.market?.shares_current === null, 'missing market shares should normalize to null');
    assert(projectsWithoutMarketValid.value.market?.price_current_TargetCurrency === null, 'missing market price should normalize to null');
    assert(projectsWithoutMarketValid.warnings.some((warning) => warning.includes('market missing; EV/multiples will be null.')), 'projects mode without market should emit warning');
  }

  const symbolOnlyValid = validateSnapshotRequest({
    targetCurrency: 'SEK', discountRate: 0.1,
    market: { shares_current: 100000000, price_current_TargetCurrency: 12.5 },
    fx: { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } },
    symbol: 'ABRA.V',
  });
  assert(symbolOnlyValid.ok, 'symbol-only mode should validate');

  const symbolAndProjectsInvalid = validateSnapshotRequest({
    targetCurrency: 'SEK', discountRate: 0.1,
    market: { shares_current: 100000000, price_current_TargetCurrency: 12.5 },
    fx: { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } },
    symbol: 'ABRA.V', projects: [{ projectId: 'p1', rawJson }],
  });
  assert(!symbolAndProjectsInvalid.ok, 'symbol + projects must fail validation');
  if (!symbolAndProjectsInvalid.ok) assert(symbolAndProjectsInvalid.errors.some((error) => error.includes('Exactly one of symbol or projects')), 'symbol + projects should emit XOR error');

  const emptySymbolInvalid = validateSnapshotRequest({
    targetCurrency: 'SEK', discountRate: 0.1,
    market: { shares_current: 100000000, price_current_TargetCurrency: 12.5 },
    fx: { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } },
    symbol: '   ',
  });
  assert(!emptySymbolInvalid.ok, 'empty symbol should fail validation');

  const missingSymbolInvalid = validateSnapshotRequest({
    targetCurrency: 'SEK', discountRate: 0.1,
    market: { shares_current: 100000000, price_current_TargetCurrency: 12.5 },
    fx: { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } },
  });
  assert(!missingSymbolInvalid.ok, 'missing symbol/projects should fail validation');

  console.log('validateSnapshotRequest tests passed');
})();
