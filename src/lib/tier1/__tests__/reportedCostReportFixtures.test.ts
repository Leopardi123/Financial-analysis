import './warintzaCostBridge.test.ts';
import assert from 'node:assert/strict';
import { extractReportedCostEvidence, extractReportedCostEvidenceCandidates } from '../reportedCost.ts';
import { assessReportedCostBenchmarkCompatibility } from '../reportedCostCompatibility.ts';
import { TIER1_COST_BENCHMARKS } from '../config.ts';

const vizcachitas = {
  economicsBreakdown: {
    reportedCostMetrics: [
      {
        metric: 'C1_CU_USD_PER_LB',
        reportedLabel: 'C1 Cost',
        value: 0.93,
        unit: 'USD/lb',
        definitionNotes: 'PFS Section 21.2.3: C1 includes site operating costs (mining, processing) and excludes indirect, head-office G&A and exploration expenses. Reported per pound copper produced.',
        primaryMetal: 'Cu',
        basis: 'reported_other',
        denominator: 'produced_primary_metal',
        period: { kind: 'FIRST_N_OPERATING_YEARS', years: 8 },
        byProductTreatment: 'excluded',
        royaltyTreatment: 'excluded',
        offSiteTreatment: 'excluded',
        costBaseYear: 2023,
        quality: 'reported_exact',
        sourceId: 'vizcachitas-pfs-2023',
        pageOrTable: 'Table 21.11, p.349-350',
      },
      {
        metric: 'C1_CU_USD_PER_LB',
        reportedLabel: 'C1 Cost',
        value: 1.25,
        unit: 'USD/lb',
        definitionNotes: 'PFS Section 21.2.3: C1 includes site operating costs (mining, processing) and excludes indirect, head-office G&A and exploration expenses. Reported per pound copper produced.',
        primaryMetal: 'Cu',
        basis: 'reported_other',
        denominator: 'produced_primary_metal',
        period: { kind: 'LOM' },
        byProductTreatment: 'excluded',
        royaltyTreatment: 'excluded',
        offSiteTreatment: 'excluded',
        costBaseYear: 2023,
        quality: 'reported_exact',
        sourceId: 'vizcachitas-pfs-2023',
        pageOrTable: 'Table 21.11, p.349-350',
      },
    ],
  },
};

const vizCandidates = extractReportedCostEvidenceCandidates(vizcachitas, 'C1_CU_USD_PER_LB');
assert.equal(vizCandidates.length, 2);
const vizLom = extractReportedCostEvidence(vizcachitas, 'C1_CU_USD_PER_LB');
assert.equal(vizLom.status, 'AVAILABLE');
assert.equal(vizLom.value, 1.25);
assert.equal(vizLom.period?.kind, 'LOM');
assert.equal(vizLom.denominator, 'produced_primary_metal');
assert.equal(vizLom.quality, 'reported_exact');
assert.equal(assessReportedCostBenchmarkCompatibility({ evidence: vizLom, benchmark: TIER1_COST_BENCHMARKS.Cu }).status, 'NOT_COMPARABLE');

const berg = {
  economicsBreakdown: {
    reportedCostMetrics: [
      {
        metric: 'C1_CU_USD_PER_LB',
        reportedLabel: 'C1 cost – by-product basis',
        value: -0.17,
        unit: 'USD/lb',
        definitionNotes: 'PFS Table 22-3 footnote 1: mine + mill + G&A + off-site costs + royalties less by-product credits. Table 22-4 annual identities reproduce the published C1 rows using payable Cu, so the denominator is source-verified as payable primary metal.',
        primaryMetal: 'Cu',
        basis: 'net_by_product',
        denominator: 'payable_primary_metal',
        period: { kind: 'LOM' },
        byProductTreatment: 'credited',
        royaltyTreatment: 'included',
        offSiteTreatment: 'included',
        costBaseYear: 2026,
        quality: 'reported_exact',
        sourceId: 'berg-pfs-2026',
        pageOrTable: 'Table 22-3, pp.320-321; Table 22-4, pp.322-324',
      },
      {
        metric: 'C1_CU_USD_PER_LB',
        reportedLabel: 'C1 cost – co-product basis',
        value: 1.95,
        unit: 'USD/lb',
        definitionNotes: 'PFS Table 22-3 footnote 3: mine + mill + G&A + off-site costs + royalties. Denominator is CuEq defined in footnote 5.',
        primaryMetal: 'Cu',
        basis: 'co_product',
        denominator: 'metal_equivalent',
        period: { kind: 'LOM' },
        byProductTreatment: 'co_product_allocation',
        royaltyTreatment: 'included',
        offSiteTreatment: 'included',
        coProductMethod: 'metal_equivalent_denominator',
        equivalentFormula: 'Cu mass + (Mo mass * (Mo price / Cu price)) + (Ag mass * (Ag price / 1000 / Cu price)) + (Au mass * (Au price / 1000 / Cu price))',
        costBaseYear: 2026,
        quality: 'reported_exact',
        sourceId: 'berg-pfs-2026',
        pageOrTable: 'Table 22-3, pp.320-321; Table 22-4, pp.322-324',
      },
    ],
  },
};

const bergCandidates = extractReportedCostEvidenceCandidates(berg, 'C1_CU_USD_PER_LB');
assert.equal(bergCandidates.length, 2);
assert.equal(bergCandidates[0].value, -0.17);
assert.equal(bergCandidates[0].basis, 'net_by_product');
assert.equal(bergCandidates[0].denominator, 'payable_primary_metal');
assert.equal(bergCandidates[1].value, 1.95);
assert.equal(bergCandidates[1].basis, 'co_product');
assert.equal(bergCandidates[1].denominator, 'metal_equivalent');
assert.equal(bergCandidates[1].coProductMethod, 'metal_equivalent_denominator');
assert.match(bergCandidates[1].equivalentFormula ?? '', /Mo mass/);

const bergSingle = extractReportedCostEvidence(berg, 'C1_CU_USD_PER_LB');
assert.equal(bergSingle.status, 'INVALID');
assert.match(bergSingle.reason, /Arrayordning får inte avgöra/);

const bergByProductCompatibility = assessReportedCostBenchmarkCompatibility({ evidence: bergCandidates[0], benchmark: TIER1_COST_BENCHMARKS.Cu });
assert.equal(bergByProductCompatibility.status, 'NOT_COMPARABLE');
const bergCoProductCompatibility = assessReportedCostBenchmarkCompatibility({ evidence: bergCandidates[1], benchmark: TIER1_COST_BENCHMARKS.Cu });
assert.equal(bergCoProductCompatibility.status, 'INSUFFICIENT_DEFINITION');

const warintza = {
  economicsBreakdown: {
    reportedCostMetrics: [
      {
        metric: 'C1_CU_USD_PER_LB',
        reportedLabel: 'C1 Cash cost',
        value: 1.01,
        unit: 'USD/lb',
        definitionNotes: 'PFS Table 22.4: mining + processing + G&A + Cu/Mo TCRCs + royalties + streaming less Au/Ag/Mo by-product credits, expressed per payable Cu lb. Royal Gold stream economics are part of the reported definition.',
        primaryMetal: 'Cu',
        basis: 'net_by_product',
        denominator: 'payable_primary_metal',
        period: { kind: 'LOM' },
        byProductTreatment: 'credited',
        royaltyTreatment: 'included',
        offSiteTreatment: 'included',
        costBaseYear: null,
        quality: 'reported_exact',
        sourceId: 'warintza-pfs-2025',
        pageOrTable: 'Table 22.4 p.345; Section 22.1.4 p.344',
      },
    ],
  },
};

const warintzaEvidence = extractReportedCostEvidence(warintza, 'C1_CU_USD_PER_LB');
assert.equal(warintzaEvidence.status, 'AVAILABLE');
assert.equal(warintzaEvidence.value, 1.01);
assert.equal(warintzaEvidence.basis, 'net_by_product');
assert.equal(warintzaEvidence.denominator, 'payable_primary_metal');
assert.equal(warintzaEvidence.byProductTreatment, 'credited');
assert.equal(warintzaEvidence.royaltyTreatment, 'included');
assert.equal(warintzaEvidence.offSiteTreatment, 'included');
assert.equal(warintzaEvidence.costBaseYear, null);
assert.equal(
  assessReportedCostBenchmarkCompatibility({ evidence: warintzaEvidence, benchmark: TIER1_COST_BENCHMARKS.Cu }).status,
  'NOT_COMPARABLE',
);

console.log('reportedCostReportFixtures.test.ts passed');
