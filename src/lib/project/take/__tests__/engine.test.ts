import { computeProjectTakeMVI } from '../engine.ts';

(function runTakeEngineWrapperTests() {
  const output = computeProjectTakeMVI({
    masterN: 1,
    grossRevenueUSD: [100, 200],
    items: [{
      id: 'nsr',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.1,
    }],
  });

  if (JSON.stringify(output.totalTakeUSD) !== JSON.stringify([10, 20])) {
    throw new Error('wrapper total take mismatch');
  }
  if (JSON.stringify(output.netRevenueAfterTakeUSD) !== JSON.stringify([90, 180])) {
    throw new Error('wrapper net revenue mismatch');
  }

  console.log('Take engine wrapper tests passed');
})();
