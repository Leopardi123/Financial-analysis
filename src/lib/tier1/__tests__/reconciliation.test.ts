import assert from 'node:assert/strict';
import {
  MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE,
  assessCompanyProjectReconciliation,
  assessProjectReconciliation,
} from '../reconciliation.ts';

const verifiedRaw = {
  time: {
    masterN: 5,
    productionStartPeriod: 2,
    productionStartYear: 2030,
  },
  reconciliation: {
    report: {
      sourceId: 'fs-2025',
      pageOrTable: 'Table 22-3, p. 22-15',
      timeline: {
        periodYears: [2024, 2025, 2026, 2027, 2028, 2029],
        productionStartPeriod: 2,
      },
      discountRate: 0.05,
      npv: 1_000_000_000,
      npvCurrency: 'USD',
      irrAfterTax: 0.25,
      priceDeckByMetal: {
        Au: { value: 2_000, unit: 'USD/toz' },
      },
    },
    calendarShiftYears: 4,
    jsonCheck: {
      npvAtReportDiscountRate: 1_010_000_000,
      irrAfterTax: 0.2525,
    },
    checks: {
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
assert.equal(verified.calendarShiftYears, 4);
assert.equal(verified.reportProductionStartYear, 2026);
assert.equal(verified.jsonProductionStartYear, 2030);
assert.equal(verified.reportStartYear, 2024);
assert.equal(verified.jsonStartYear, 2028);
assert.equal(verified.npvRelativeDiff, 0.01);
assert.ok(verified.irrRelativeDiff !== null && Math.abs(verified.irrRelativeDiff - 0.01) < 1e-12);

const missing = assessProjectReconciliation({}, 'p2');
assert.equal(missing.status, 'NOT_VERIFIED');
assert.ok(missing.reason.includes('reconciliation saknas'));

const wrongDeclaredShift = structuredClone(verifiedRaw);
wrongDeclaredShift.reconciliation.calendarShiftYears = 3;
const badShift = assessProjectReconciliation(wrongDeclaredShift, 'p3');
assert.equal(badShift.status, 'NOT_VERIFIED');
assert.ok(badShift.reason.includes('uniform kalenderförskjutning'));

const wrongProductionStartPeriod = structuredClone(verifiedRaw);
wrongProductionStartPeriod.reconciliation.report.timeline.productionStartPeriod = 1;
const badTp = assessProjectReconciliation(wrongProductionStartPeriod, 'p4');
assert.equal(badTp.status, 'NOT_VERIFIED');
assert.ok(badTp.reason.includes('productionStartPeriod mismatch'));

const nonAnnualReportTimeline = structuredClone(verifiedRaw);
nonAnnualReportTimeline.reconciliation.report.timeline.periodYears[3] = 2028;
const badTimeline = assessProjectReconciliation(nonAnnualReportTimeline, 'p5');
assert.equal(badTimeline.status, 'NOT_VERIFIED');
assert.ok(badTimeline.reason.includes('inte en sammanhängande årsaxel'));

const outsideTolerance = structuredClone(verifiedRaw);
outsideTolerance.reconciliation.jsonCheck.npvAtReportDiscountRate = 1_030_000_000;
assert.equal(assessProjectReconciliation(outsideTolerance, 'p6').status, 'NOT_VERIFIED');

const tooLooseTolerance = structuredClone(verifiedRaw);
tooLooseTolerance.reconciliation.toleranceRelative = 0.05;
const tooLoose = assessProjectReconciliation(tooLooseTolerance, 'p7');
assert.equal(tooLoose.status, 'NOT_VERIFIED');
assert.equal(tooLoose.toleranceRelative, MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE);

const zeroShift = structuredClone(verifiedRaw);
zeroShift.time.productionStartYear = 2026;
zeroShift.reconciliation.calendarShiftYears = 0;
const exactCalendar = assessProjectReconciliation(zeroShift, 'p8');
assert.equal(exactCalendar.status, 'VERIFIED');
assert.equal(exactCalendar.calendarShiftYears, 0);

const company = assessCompanyProjectReconciliation([
  { projectId: 'p1', rawJson: verifiedRaw },
  { projectId: 'p2', rawJson: {} },
]);
assert.equal(company.allVerified, false);
assert.equal(company.projects.length, 2);

console.log('reconciliation.test.ts passed');
