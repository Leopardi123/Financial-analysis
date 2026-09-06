import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import {
  SCOTTIE_CAD_TO_USD,
  SCOTTIE_PEA_V3,
  SCOTTIE_REPORT_CLOSURE_CAD,
  SCOTTIE_REPORT_INITIAL_CAPEX_CAD,
  SCOTTIE_REPORT_PERIODS,
  SCOTTIE_REPORT_RECOVERED_AU_OZ,
  SCOTTIE_REPORT_SALVAGE_CAD,
  SCOTTIE_REPORT_SMELTER_PAYABILITY,
  SCOTTIE_REPORT_SUSTAINING_INCL_CLOSURE_CAD,
} from './fixtures/scottiePea.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function sum(series: Array<number | null> | readonly number[]): number {
  return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0);
}

(async function runScottiePeaV3Test(): Promise<void> {
  const raw = SCOTTIE_PEA_V3;

  assert(raw.time.masterN === 8, 'Scottie PEA must preserve -1,Y1..Y8 as 9 periods / masterN=8');
  assert(raw.time.productionStartPeriod === 1, 'Scottie PEA Y1 must be t=1 after the single pre-production period');
  assert(raw.time.reportPeriodLabels?.join(',') === SCOTTIE_REPORT_PERIODS.join(','), 'Scottie report period labels must remain exact');
  assert(raw.time.phaseByPeriod[0] === 'construction', 'Scottie t=0 must remain the pre-production construction period');
  assert(raw.time.phaseByPeriod[8] === 'closure', 'Scottie terminal Y8 must remain a closure/terminal period');
  assert(raw.time.runtimePlacement?.productionStart?.year === 2029, 'Figure 24-1 must anchor full-scale commercial production in 2029');

  const runtimeParsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: true,
    taxScenario: 'runtime',
    fiscalScenario: 'runtime',
  });
  const runtimeYears = runtimeParsed.engineInputWithoutPrices.yearsByPeriod;
  assert(runtimeYears[1] === 2029 && runtimeYears[0] === 2028, 'Runtime placement must map -1 to 2028 and Y1 to 2029');

  const recovered = raw.metals.metalInProductQtyByMetal?.Au;
  const payable = raw.metals.payableQtyByMetal.Au;
  assert(recovered && recovered.length === 9 && payable.length === 9, 'Scottie Au series must span the full report axis');
  assert(Math.abs(sum(recovered) - SCOTTIE_REPORT_RECOVERED_AU_OZ) < 1e-6, 'Recovered Au must preserve the PEA 457,600 oz LOM total');
  for (let t = 1; t <= 7; t += 1) {
    assert(finite(recovered[t]) && finite(payable[t]), `Scottie Au must be finite at production t=${t}`);
    assert(Math.abs((payable[t] as number) / (recovered[t] as number) - SCOTTIE_REPORT_SMELTER_PAYABILITY) < 1e-12,
      `Scottie smelter payability must remain exactly 88.3% at t=${t}`);
  }
  assert(Math.abs(sum(payable) - SCOTTIE_REPORT_RECOVERED_AU_OZ * SCOTTIE_REPORT_SMELTER_PAYABILITY) < 1e-6,
    'Scottie revenue-bearing payable Au must equal recovered Au x 88.3%');

  assert(Math.abs(sum(raw.capital.capexUSD) - SCOTTIE_REPORT_INITIAL_CAPEX_CAD * SCOTTIE_CAD_TO_USD) < 1,
    'Scottie initial CAPEX must preserve C$128.6m at report FX');
  assert(Math.abs(
    sum(raw.capital.sustainingCapexUSD) + sum(raw.capital.closureUSD)
      - SCOTTIE_REPORT_SUSTAINING_INCL_CLOSURE_CAD * SCOTTIE_CAD_TO_USD,
  ) < 1, 'Scottie sustaining + closure must preserve the disclosed C$76.7m total');
  assert(Math.abs(sum(raw.capital.closureUSD) - SCOTTIE_REPORT_CLOSURE_CAD * SCOTTIE_CAD_TO_USD) < 1,
    'Scottie closure proxy must preserve the disclosed C$15m total');
  assert(Math.abs(sum(raw.capital.workingCapitalDeltaUSD ?? [])) < 1e-6,
    'Scottie runtime WC proxy must unwind fully by terminal Y8');
  assert(raw.capital.terminalProceedsUSD?.[8] === SCOTTIE_REPORT_SALVAGE_CAD * SCOTTIE_CAD_TO_USD,
    'Scottie C$12.9m salvage must be a terminal proceed in Y8');

  const report = raw.verification?.report;
  assert(report, 'Scottie fixture requires verification.report evidence');
  assert(report.priceDeckByKey.XAU_USD_TOZ === 2600, 'Scottie report Au deck must remain US$2,600/oz');
  assert(report.discountRate === 0.05 && report.discountConvention === 'mid_year',
    'Scottie report reconciliation must use 5% mid-year discounting');
  assert(report.reportNPVPreTaxUSD === 326_100_000 * SCOTTIE_CAD_TO_USD, 'Scottie pre-tax report NPV5 must remain C$326.1m');
  assert(report.reportNPVPostTaxUSD === 215_800_000 * SCOTTIE_CAD_TO_USD, 'Scottie post-tax report NPV5 must remain C$215.8m');
  assert(report.reportIRRPreTax === 0.825 && report.reportIRRPostTax === 0.603, 'Scottie report IRRs must remain 82.5% / 60.3%');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'NOT_VERIFIED',
    `Scottie must remain Ej verifierad while annual sustaining/WC/tax/NPI report series are unpublished: ${JSON.stringify(reconciliation.hardChecks)}`);

  const structuralChecks = reconciliation.hardChecks.filter((check) =>
    !['npv_reconciliation', 'irr_reconciliation', 'npv_pre_tax_reconciliation', 'irr_pre_tax_reconciliation'].includes(check.check));
  assert(structuralChecks.every((check) => check.status === 'PASS'),
    `Scottie source-mapping/CAPEX/closure/terminal/price hard checks must pass even though economic reconciliation does not: ${JSON.stringify(structuralChecks)}`);
  const irrChecks = reconciliation.hardChecks.filter((check) => check.check.includes('irr'));
  assert(irrChecks.some((check) => check.status === 'FAIL'),
    'At least one Scottie IRR reconciliation must remain failed; do not calibrate unpublished annual cash flows to force a match');

  const input = await resolveProjectPricesToEngineInput({
    parsed: runtimeParsed,
    scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: 2600 } },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'scottie-pea-2025-unverified',
  });
  input.phase2.discountRate = 0.05;
  const runtime = computeProjectEngineFullProductionV1(input);
  assert(runtime.phase1.fcffUSD.every(finite), 'Scottie runtime proxy must remain fully computable despite report reconciliation being Ej verifierad');

  console.log(
    `Scottie PEA V3 EJ VERIFIERAD | NPV5 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference}`
    + ` | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference}`
    + ` | NPV5 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference}`
    + ` | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference}`,
  );
})();
