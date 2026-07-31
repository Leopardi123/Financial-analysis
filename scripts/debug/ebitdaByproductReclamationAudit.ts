import assert from 'node:assert/strict';
import { computeProjectPhase1 } from '../../src/lib/project/phase1.ts';
import { computeProjectRevenue } from '../../src/lib/project/revenue/engine.ts';
import { computeProjectPhase2 } from '../../src/lib/project/phase2.ts';
import { computeProjectAisc } from '../../src/lib/project/aisc/engine.ts';
import { computeCorporateCashWaterfall } from '../../src/lib/corporate/financing/cashWaterfall.ts';

const close = (actual: number | null, expected: number, label: string) => {
  assert.notEqual(actual, null, `${label}: expected finite value`);
  assert.ok(Math.abs((actual as number) - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
};

const onePeriod = (overrides: Partial<{
  revenue: number; operating: number; sustaining: number; ga: number; royalties: number;
  reclamation: number; credits: number; depreciation: number; taxRate: number;
  capex: number; wc: number;
}> = {}) => computeProjectPhase1({
  masterN: 0, productionStartPeriod: 0,
  revenueUSD: [overrides.revenue ?? 100],
  operatingCostsUSD: [overrides.operating ?? 40],
  sustainingCapexUSD: [overrides.sustaining ?? 10],
  siteGandA_USD: [overrides.ga ?? 5],
  royaltiesUSD: [overrides.royalties ?? 3],
  reclamationUSD: [overrides.reclamation ?? 2],
  byproductCreditsUSD: [overrides.credits ?? 4],
  depreciationUSD: [overrides.depreciation ?? 6],
  taxRate: overrides.taxRate ?? 0.25,
  capexUSD: [overrides.capex ?? 0],
  workingCapitalDeltaUSD: [overrides.wc ?? 0],
});

// A — requested clean definition.
const clean = onePeriod();
close(clean.ebitdaUSD[0], 54, 'A EBITDA');
close(clean.sustainingAdjustedOperatingEarningsUSD[0], 44, 'A operating earnings');
close(clean.ebitUSD[0], 38, 'A EBIT');
close(clean.taxUSD[0], 9.5, 'A tax');
close(clean.nopatUSD[0], 28.5, 'A NOPAT');
close(clean.fcffUSD[0], 34.5, 'A FCFF');

// B — all payable metals are already in gross revenue; a separate credit still adds again.
const metalRevenue = computeProjectRevenue({
  masterN: 0,
  payableQtyByMetal: { Au: [8], Cu: [4] },
  priceUSDByMetal: { Au: [10], Cu: [5] },
});
assert.deepEqual(metalRevenue.byMetalRevenueUSD, { Au: [80], Cu: [20] });
assert.deepEqual(metalRevenue.grossRevenueUSD, [100]);
const noCredit = onePeriod({ operating: 0, sustaining: 0, ga: 0, royalties: 0, reclamation: 0, credits: 0, depreciation: 0, taxRate: 0 });
const duplicateCredit = onePeriod({ operating: 0, sustaining: 0, ga: 0, royalties: 0, reclamation: 0, credits: 20, depreciation: 0, taxRate: 0 });
close(noCredit.ebitdaUSD[0], 100, 'B EBITDA without credit');
close(duplicateCredit.ebitdaUSD[0], 120, 'B EBITDA with duplicate credit');

// C — reclamation behaves as a tax-deductible operating expense and AISC numerator.
const reclamationBase = onePeriod({ reclamation: 0 });
const reclamationPlus10 = onePeriod({ reclamation: 10 });
close((reclamationBase.ebitdaUSD[0] as number) - (reclamationPlus10.ebitdaUSD[0] as number), 10, 'C EBITDA delta');
close((reclamationBase.sustainingAdjustedOperatingEarningsUSD[0] as number) - (reclamationPlus10.sustainingAdjustedOperatingEarningsUSD[0] as number), 10, 'C operating earnings delta');
close((reclamationBase.ebitUSD[0] as number) - (reclamationPlus10.ebitUSD[0] as number), 10, 'C EBIT delta');
close((reclamationBase.taxUSD[0] as number) - (reclamationPlus10.taxUSD[0] as number), 2.5, 'C tax shield');
close((reclamationBase.fcffUSD[0] as number) - (reclamationPlus10.fcffUSD[0] as number), 7.5, 'C FCFF delta');
const aiscBase = computeProjectAisc({ masterN: 0, productionStartPeriod: 0, grossRevenueUSD: [100], auPriceUSDPerOz: [100], sustainingCostUSD: reclamationBase.sustainingCostUSD });
const aiscReclamation = computeProjectAisc({ masterN: 0, productionStartPeriod: 0, grossRevenueUSD: [100], auPriceUSDPerOz: [100], sustainingCostUSD: reclamationPlus10.sustainingCostUSD });
close((aiscReclamation.aiscAuEqUSDPerOz_LOM as number) - (aiscBase.aiscAuEqUSDPerOz_LOM as number), 10, 'C AISC delta');

// D — same terminal nominal amount in reclamation, capex, or both.
const terminalCase = (reclamation: number, capex: number) => {
  const phase1 = computeProjectPhase1({
    masterN: 2, productionStartPeriod: 1, taxRate: 0.25,
    revenueUSD: [0, 100, 100], operatingCostsUSD: [0, 20, 20],
    sustainingCapexUSD: [0, 0, 0], siteGandA_USD: [0, 0, 0], royaltiesUSD: [0, 0, 0],
    reclamationUSD: [0, 0, reclamation], byproductCreditsUSD: [0, 0, 0],
    depreciationUSD: [0, 0, 0], capexUSD: [100, 0, capex], workingCapitalDeltaUSD: [0, 0, 0],
  });
  const phase2 = computeProjectPhase2({ masterN: 2, productionStartPeriod: 1, discountRate: 0.1, fcffUSD: phase1.fcffUSD });
  const aisc = computeProjectAisc({ masterN: 2, productionStartPeriod: 1, grossRevenueUSD: [0, 100, 100], auPriceUSDPerOz: [100, 100, 100], sustainingCostUSD: phase1.sustainingCostUSD });
  return { phase1, phase2, aisc: aisc.aiscAuEqUSDPerOz_LOM };
};
const terminalBase = terminalCase(0, 0);
const terminalReclamation = terminalCase(10, 0);
const terminalCapex = terminalCase(0, 10);
const terminalBoth = terminalCase(10, 10);
close((terminalBase.phase1.fcffUSD[2] as number) - (terminalReclamation.phase1.fcffUSD[2] as number), 7.5, 'D reclamation FCFF delta');
close((terminalBase.phase1.fcffUSD[2] as number) - (terminalCapex.phase1.fcffUSD[2] as number), 10, 'D capex FCFF delta');
close((terminalBase.phase1.fcffUSD[2] as number) - (terminalBoth.phase1.fcffUSD[2] as number), 17.5, 'D both FCFF delta');
assert.ok((terminalReclamation.phase2.npvToday_USD as number) > (terminalBoth.phase2.npvToday_USD as number));
assert.ok((terminalCapex.phase2.irr as number) > (terminalBoth.phase2.irr as number));
close((terminalReclamation.aisc as number) - (terminalBase.aisc as number), 5, 'D reclamation AISC delta');
close(terminalCapex.aisc as number, terminalBase.aisc as number, 'D capex leaves AISC unchanged');

// E — sustaining CAPEX exactly once, after tax.
const sustaining0 = onePeriod({ sustaining: 0 });
const sustaining10 = onePeriod({ sustaining: 10 });
close(sustaining0.ebitdaUSD[0], sustaining10.ebitdaUSD[0] as number, 'E EBITDA invariant');
close((sustaining0.sustainingAdjustedOperatingEarningsUSD[0] as number) - (sustaining10.sustainingAdjustedOperatingEarningsUSD[0] as number), 10, 'E operating earnings delta');
close((sustaining0.taxUSD[0] as number) - (sustaining10.taxUSD[0] as number), 2.5, 'E tax shield');
close((sustaining0.fcffUSD[0] as number) - (sustaining10.fcffUSD[0] as number), 7.5, 'E FCFF delta');

// F — capex is a full cash deduction and construction funding need.
const capex0 = onePeriod({ capex: 0 });
const capex10 = onePeriod({ capex: 10 });
assert.deepEqual({ ebitda: capex10.ebitdaUSD, operating: capex10.sustainingAdjustedOperatingEarningsUSD, ebit: capex10.ebitUSD, tax: capex10.taxUSD }, { ebitda: capex0.ebitdaUSD, operating: capex0.sustainingAdjustedOperatingEarningsUSD, ebit: capex0.ebitUSD, tax: capex0.taxUSD });
close((capex0.fcffUSD[0] as number) - (capex10.fcffUSD[0] as number), 10, 'F FCFF delta');
const waterfall = computeCorporateCashWaterfall({
  yearsByPeriod: [2026], latestQuarterlyCash: 0, useLatestQuarterlyCash: true, cashUsedPercent: 1,
  minimumCashReserve: 0, debtPercent: 0,
  projects: [{ projectId: 'p', constructionStartPeriod: 0, capexNeedByPeriod: [10], fcffIncludesConstructionCapex: true, fcffByPeriod: [-10] }],
});
close(waterfall.remainingExternalFundingNeed, 10, 'F funding need');

// G — working capital has no result/tax effect and a symmetric FCFF sign.
const wc0 = onePeriod({ wc: 0 });
const wcBuild = onePeriod({ wc: 10 });
const wcRelease = onePeriod({ wc: -10 });
assert.deepEqual({ ebitda: wcBuild.ebitdaUSD, operating: wcBuild.sustainingAdjustedOperatingEarningsUSD, ebit: wcBuild.ebitUSD, tax: wcBuild.taxUSD }, { ebitda: wc0.ebitdaUSD, operating: wc0.sustainingAdjustedOperatingEarningsUSD, ebit: wc0.ebitUSD, tax: wc0.taxUSD });
close((wc0.fcffUSD[0] as number) - (wcBuild.fcffUSD[0] as number), 10, 'G WC build');
close((wcRelease.fcffUSD[0] as number) - (wc0.fcffUSD[0] as number), 10, 'G WC release');

console.log(JSON.stringify({
  A: { ebitda: clean.ebitdaUSD[0], operatingEarnings: clean.sustainingAdjustedOperatingEarningsUSD[0], ebit: clean.ebitUSD[0], tax: clean.taxUSD[0], nopat: clean.nopatUSD[0], fcff: clean.fcffUSD[0] },
  B: { metalRevenue: metalRevenue.byMetalRevenueUSD, grossRevenue: metalRevenue.grossRevenueUSD[0], ebitdaNoCredit: noCredit.ebitdaUSD[0], ebitdaDuplicateCredit: duplicateCredit.ebitdaUSD[0] },
  C: { ebitdaDelta: 10, taxShield: 2.5, fcffDelta: 7.5, aiscDelta: 10 },
  D: {
    terminalFcff: { base: terminalBase.phase1.fcffUSD[2], reclamation: terminalReclamation.phase1.fcffUSD[2], capex: terminalCapex.phase1.fcffUSD[2], both: terminalBoth.phase1.fcffUSD[2] },
    npv: { base: terminalBase.phase2.npvToday_USD, reclamation: terminalReclamation.phase2.npvToday_USD, capex: terminalCapex.phase2.npvToday_USD, both: terminalBoth.phase2.npvToday_USD },
    irr: { base: terminalBase.phase2.irr, reclamation: terminalReclamation.phase2.irr, capex: terminalCapex.phase2.irr, both: terminalBoth.phase2.irr },
    aisc: { base: terminalBase.aisc, reclamation: terminalReclamation.aisc, capex: terminalCapex.aisc, both: terminalBoth.aisc },
  },
  E: { ebitdaDelta: 0, operatingEarningsDelta: 10, taxShield: 2.5, fcffDelta: 7.5 },
  F: { fcffDelta: 10, externalFundingNeed: waterfall.remainingExternalFundingNeed },
  G: { buildFcffDelta: -10, releaseFcffDelta: 10 },
}, null, 2));
