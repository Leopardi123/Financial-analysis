import {
  computeCorporateScenarioRunner,
  type CorporateScenarioRunnerInput,
} from '../corporateScenarioRunner.ts';
import type { CorporateFullPipelineFromProjectInputsInput } from '../../corporate/pipeline/fromProjectInputs.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

function makeBaseInput(): CorporateFullPipelineFromProjectInputsInput {
  return {
    projects: {
      discountRate: 0.1,
      masterN: 0,
      projects: [
        {
          id: 'P1',
          input: {
            masterN: 0,
            streamsByMetal: null,
            payableQtyByMetal: {
              Au: [100],
            },
            spotPriceUSDByMetal: {
              Au: [10],
            },
            takeItems: [],
            phase1: {
              masterN: 0,
              productionStartPeriod: 0,
              taxRate: 0,
              capexUSD: [0],
              operatingCostsUSD: [0],
              sustainingCapexUSD: [0],
              siteGandA_USD: [0],
              reclamationUSD: [0],
            },
            phase2: {
              discountRate: 0.1,
            },
            aisc: {
              auPriceUSDPerOz: [1800],
            },
          },
        },
      ],
    },
    financing: {
      fx_USD_to_TargetCurrency: 1,
      cash_TargetCurrency_t0: 0,
      debt_TargetCurrency_t0: 0,
      cashUsedForProjectFinancing_TargetCurrency_t0: 0,
    },
    market: {
      price_current_TargetCurrency: 1,
      shares_current: 100,
    },
    equityFinancing: {
      equityNeeded_TargetCurrency: 0,
      equityRaisePrice_TargetCurrency_perShare: 1,
    },
  };
}

(function runCorporateScenarioRunnerTests() {
  const base = makeBaseInput();

  const scenarioInput: CorporateScenarioRunnerInput = {
    base,
    pricesByScenario: {
      SPOT: { Au: [10] },
      LOW: { Au: [8] },
      HIGH: { Au: [12] },
    },
  };

  const out = computeCorporateScenarioRunner(scenarioInput);

  assert(
    (out.SPOT.corporateProjects.npvToday_USD_total as number) >
      (out.LOW.corporateProjects.npvToday_USD_total as number),
    'SPOT NPV should be greater than LOW NPV',
  );
  assert(
    (out.HIGH.corporateProjects.npvToday_USD_total as number) >
      (out.SPOT.corporateProjects.npvToday_USD_total as number),
    'HIGH NPV should be greater than SPOT NPV',
  );

  const missingCoverage = makeBaseInput();
  missingCoverage.projects.projects[0].input.payableQtyByMetal = {
    Au: [100],
    Ag: [50],
  };

  assertThrows(
    () =>
      computeCorporateScenarioRunner({
        base: missingCoverage,
        pricesByScenario: {
          SPOT: { Au: [10] },
          LOW: { Au: [8] },
          HIGH: { Au: [12] },
        },
      }),
    /missing price series for metal Ag/,
    'strict coverage should throw when a payable metal is missing in scenario prices',
  );

  assertThrows(
    () =>
      computeCorporateScenarioRunner({
        base: makeBaseInput(),
        pricesByScenario: {
          SPOT: { Au: [10, 11] },
          LOW: { Au: [8] },
          HIGH: { Au: [12] },
        },
      }),
    /has price series length 2, expected 1/,
    'strict coverage should throw when scenario price series length mismatches masterN+1',
  );

  console.log('Corporate scenario runner tests passed');
})();
