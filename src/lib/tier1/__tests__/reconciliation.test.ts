import assert from 'node:assert/strict';
import {
  MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE,
  assessCompanyProjectReconciliation,
  assessProjectReconciliation,
} from '../reconciliation.ts';

const verifiedRaw = {
  reconciliation: {
    report: {
      sourceId: 'fs-2025',
      pageOrTable: 'Table 22-3, p. 22-15',
      discountRate: 0.05,
      npv: 1_000_000_000,
      npvCurrency: 'USD',
      irrAfterTax: 0.25,
      priceDeckByMetal: {
        Au: { value: 2_000, unit: 'USD/toz' },
      },
    },
    jsonCheck: {
      npvAtReportDiscountRate: 1_010_000_000,
      irrAfterTax: 0.2525,
    },
    checks: {
      periodMappingVerified: true,
      capexPlacementVerified: true,
      closureWorkingCapitalVerified: true,
      reportPricesAndAssumptionsVerified: true,
      cashFlowDefinitionVerified: true,
    },
    toleranceRelative: 0.02,
  },
};

const verified = assessProjectReconciliation(verifiedRaw, 'p1');
assert.equal(verified.status, 'VERIFIED');
assert.equal(verified.npvRelativeDiff, 0.01);
assert.ok(verified.irrRelativeDiff !== null && Math.abs(verified.irrRelativeDiff - 0.01) < 1e-12);

const missing = assessProjectReconciliation({}, 'p2');
assert.equal(missing.status, 'NOT_VERIFIED');
assert.ok(missing.reason.includes('reconciliation saknas'));

const badTimeline = structuredClone(verifiedRaw);
badTimeline.reconciliation.checks.periodMappingVerified = false;
assert.equal(assessProjectReconciliation(badTimeline, 'p3').status, 'NOT_VERIFIED');

const outsideTolerance = structuredClone(verifiedRaw);
outsideTolerance.reconciliation.jsonCheck.npvAtReportDiscountRate = 1_030_000_000;
assert.equal(assessProjectReconciliation(outsideTolerance, 'p4').status, 'NOT_VERIFIED');

const tooLooseTolerance = structuredClone(verifiedRaw);
tooLooseTolerance.reconciliation.toleranceRelative = 0.05;
const tooLoose = assessProjectReconciliation(tooLooseTolerance, 'p5');
assert.equal(tooLoose.status, 'NOT_VERIFIED');
assert.equal(tooLoose.toleranceRelative, MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE);

const company = assessCompanyProjectReconciliation([
  { projectId: 'p1', rawJson: verifiedRaw },
  { projectId: 'p2', rawJson: {} },
]);
assert.equal(company.allVerified, false);
assert.equal(company.projects.length, 2);

console.log('reconciliation.test.ts passed');
