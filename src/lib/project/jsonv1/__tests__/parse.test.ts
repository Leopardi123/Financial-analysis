import { parseProjectJsonV1 } from '../parse.ts';
import { getProjectJsonV1Template } from '../template.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
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

(function runParseProjectJsonV1Tests() {
  const happy = getProjectJsonV1Template();
  happy.metals.payableQtyByMetal.Au[2] = 100;
  happy.series.operatingCostsUSD[2] = 400;
  happy.series.capexUSD[0] = -1000;

  const parsed = parseProjectJsonV1(happy);
  assertEqual(parsed.engineInputWithoutPrices.payableQtyByMetal.Au[2], 100, 'happy path payable qty');
  assertEqual(parsed.engineInputWithoutPrices.phase1.capexUSD[0], 1000, 'negative capex normalized to spend');
  assert(parsed.warnings.includes('capexUSD: detected negative values; normalized to spend (abs).'), 'negative capex warning emitted');
  assertEqual(parsed.engineInputWithoutPrices.priceKeyByMetal.Au, 'XAU_USD_TOZ', 'price key parsed');
  assertEqual(parsed.engineInputWithoutPrices.payableQtyUnitByMetal.Au, 'toz', 'qty unit parsed');
  assertEqual(parsed.engineInputWithoutPrices.auPriceKey, 'XAU_USD_TOZ', 'au price key parsed');
  assert(parsed.context.operations != null, 'happy path context operations should be present');
  assertEqual(parsed.context.equity?.fdExtraShares, 0, 'fd extra shares defaults to 0 when omitted');

  (happy as Record<string, unknown>)._choices_version = ['project_json_v1'];
  (happy.meta as Record<string, unknown>)._choices_currency = ['USD'];
  ((happy.operations?.capacity ?? {}) as Record<string, unknown>)._choices_throughputUnit = ['tpa', 'tpd'];
  (happy.economicsBreakdown?.meta as Record<string, unknown>)._choices_defaultSource = ['FS', 'Other', 'PEA', 'PFS'];
  const firstTakeItem = (happy.takeItems?.[0] ?? null) as Record<string, unknown> | null;
  if (firstTakeItem) {
    firstTakeItem._choices_type = ['AD_VALOREM', 'NSR'];
    (firstTakeItem.appliesTo as Record<string, unknown>)._choices_scope = ['metalSpecific', 'project'];
    const tiers = (firstTakeItem.rateDefinition as Record<string, unknown>).tiers;
    if (Array.isArray(tiers) && tiers[0] && typeof tiers[0] === 'object') {
      (tiers[0] as Record<string, unknown>)._choices_thresholdType = ['price', 'revenue'];
    }
  }
  const withChoicesParsed = parseProjectJsonV1(happy);
  assertEqual(withChoicesParsed.engineInputWithoutPrices.auPriceKey, 'XAU_USD_TOZ', 'parse ignores _choices_ keys at root and nested levels');

  const withFdEquity = getProjectJsonV1Template();
  withFdEquity.equity = { fdExtraShares: 125, fdNotes: 'options + warrants' };
  const parsedWithFdEquity = parseProjectJsonV1(withFdEquity);
  assertEqual(parsedWithFdEquity.context.equity?.fdExtraShares, 125, 'fd extra shares parsed when provided');
  assertEqual(parsedWithFdEquity.context.equity?.fdNotes, 'options + warrants', 'fd notes parsed when provided');

  const wrongVersion = getProjectJsonV1Template();
  (wrongVersion as { version: string }).version = 'wrong';
  assertThrows(() => parseProjectJsonV1(wrongVersion), /Only project_json_v2 supported in rolling model\./, 'throws on wrong version');

  const badMasterN = getProjectJsonV1Template();
  (badMasterN.time as { masterN: number | string }).masterN = 1.2;
  assertThrows(() => parseProjectJsonV1(badMasterN), /time\.masterN/, 'throws on non-integer masterN');

  const shortCapexSeries = getProjectJsonV1Template();
  shortCapexSeries.series.capexUSD = [1, 2, 3];
  const parsedShortCapexSeries = parseProjectJsonV1(shortCapexSeries);
  assertEqual(parsedShortCapexSeries.engineInputWithoutPrices.phase1.capexUSD.length, 6, 'required capex series normalized to masterN+1');
  assertEqual(parsedShortCapexSeries.engineInputWithoutPrices.phase1.capexUSD[5], 0, 'required capex series padded with zero');


  const workingCapitalSeries = getProjectJsonV1Template();
  workingCapitalSeries.series.workingCapitalDeltaUSD = new Array(workingCapitalSeries.time.masterN + 1).fill(10);
  workingCapitalSeries.series.workingCapitalDeltaUSD[2] = Number.NaN;
  const parsedWorkingCapital = parseProjectJsonV1(workingCapitalSeries);
  assertEqual(parsedWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.[0], 10, 'working capital series is carried to engine input');
  assertEqual(parsedWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.[2], 0, 'working capital non-finite values normalize to zero');

  const shortWorkingCapitalLength = getProjectJsonV1Template();
  shortWorkingCapitalLength.series.workingCapitalDeltaUSD = [1, 2, 3];
  const parsedShortWorkingCapital = parseProjectJsonV1(shortWorkingCapitalLength);
  assertEqual(parsedShortWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.length, 6, 'optional working capital series normalized to masterN+1');
  assertEqual(parsedShortWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.[5], 0, 'optional working capital tail padded with 0');


  const withDocHelpers = getProjectJsonV1Template();
  (withDocHelpers.time as Record<string, unknown>)._description_masterN = 'ignored';
  (withDocHelpers.time as Record<string, unknown>)._example_productionStartPeriod = 2;
  (withDocHelpers.series as Record<string, unknown>)._description_capexUSD = 'ignored';
  (withDocHelpers.series as Record<string, unknown>)._example_capexUSD = [1, 2, 3];
  const parsedWithDocHelpers = parseProjectJsonV1(withDocHelpers);
  assertEqual(parsedWithDocHelpers.engineInputWithoutPrices.masterN, withDocHelpers.time.masterN, 'parse ignores _description_/_example_ helper keys');


  const metalMismatchUnits = getProjectJsonV1Template();
  metalMismatchUnits.metals.payableQtyUnitByMetal = { Au: 'toz' };
  assertThrows(() => parseProjectJsonV1(metalMismatchUnits), /payableQtyUnitByMetal/, 'throws on payable/unit metal mismatch');

  const metalMismatchPrices = getProjectJsonV1Template();
  metalMismatchPrices.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };
  assertThrows(() => parseProjectJsonV1(metalMismatchPrices), /priceKeyByMetal/, 'throws on payable/price-key mismatch');

  const unknownPriceKey = getProjectJsonV1Template();
  unknownPriceKey.metals.priceKeyByMetal.Au = 'auu';
  assertThrows(
    () => parseProjectJsonV1(unknownPriceKey),
    /priceKeyByMetal\.Au must be one of: \[[^\]]*XAU_USD_TOZ[^\]]*XAG_USD_TOZ[^\]]*\]\. Received "AUU"\. Example: XAU_USD_TOZ\./,
    'unknown price key error includes valid keys and example',
  );

  const invalidCuPriceKey = getProjectJsonV1Template();
  invalidCuPriceKey.metals.priceKeyByMetal.Cu = 'cu';
  assertThrows(
    () => parseProjectJsonV1(invalidCuPriceKey),
    /metals\.priceKeyByMetal\.Cu must be one of: \[CU_USD_LB, CU_USD_TONNE\]\. Received "CU"\./,
    'Cu validator rejects non-canonical shorthand key',
  );

  const aliasPriceKeys = getProjectJsonV1Template();
  aliasPriceKeys.metals.payableQtyByMetal.Ag = [...aliasPriceKeys.metals.payableQtyByMetal.Au];
  aliasPriceKeys.metals.payableQtyUnitByMetal.Ag = 'toz';
  aliasPriceKeys.metals.priceKeyByMetal.Au = 'au';
  aliasPriceKeys.metals.priceKeyByMetal.Ag = 'ag';
  const parsedAliasPriceKeys = parseProjectJsonV1(aliasPriceKeys);
  assertEqual(parsedAliasPriceKeys.engineInputWithoutPrices.priceKeyByMetal.Au, 'XAU_USD_TOZ', 'Au alias normalized to canonical key');
  assertEqual(parsedAliasPriceKeys.engineInputWithoutPrices.priceKeyByMetal.Ag, 'XAG_USD_TOZ', 'Ag alias normalized to canonical key');
  assert(
    parsedAliasPriceKeys.diagnostics.normalization.some((entry) => entry.path === 'metals.priceKeyByMetal.Au' && entry.rule === 'price_key_normalized'),
    'price key normalization diagnostics include Au alias conversion',
  );

  const autoFillAuPriceKey = getProjectJsonV1Template();
  autoFillAuPriceKey.metals.auPriceKey = '';
  const parsedAutoFillAuPriceKey = parseProjectJsonV1(autoFillAuPriceKey);
  assertEqual(parsedAutoFillAuPriceKey.engineInputWithoutPrices.auPriceKey, 'XAU_USD_TOZ', 'auPriceKey auto-filled from priceKeyByMetal.Au');
  assert(
    parsedAutoFillAuPriceKey.diagnostics.normalization.some((entry) => entry.rule === 'au_price_key_autofill' && entry.path === 'metals.auPriceKey'),
    'auPriceKey auto-fill emits diagnostic',
  );

  const mismatchAuPriceKey = getProjectJsonV1Template();
  mismatchAuPriceKey.metals.auPriceKey = 'XAG_USD_TOZ';
  assertThrows(
    () => parseProjectJsonV1(mismatchAuPriceKey),
    /Set auPriceKey equal to priceKeyByMetal\.Au to keep AuEq calculations consistent\./,
    'auPriceKey mismatch error includes fix suggestion',
  );

  const negativeQty = getProjectJsonV1Template();
  negativeQty.metals.payableQtyByMetal.Au[2] = -1;
  assertThrows(() => parseProjectJsonV1(negativeQty), /payableQtyByMetal\.Au\[2\]/, 'throws on negative payable qty');

  const legacy = getProjectJsonV1Template();
  legacy.metals.spotPriceUSDByMetal = { Au: new Array(legacy.time.masterN + 1).fill(10), Cu: new Array(legacy.time.masterN + 1).fill(4) };
  legacy.metals.auPriceUSDPerOz = new Array(legacy.time.masterN + 1).fill(1999);
  const parsedLegacy = parseProjectJsonV1(legacy);
  assertEqual(parsedLegacy.priceOverrides.spotPriceUSDByMetal?.Au[0], 10, 'legacy spot price carried as override');
  assertEqual(parsedLegacy.priceOverrides.auPriceUSDPerOz?.[0], 1999, 'legacy au price carried as override');

  const positiveCapex = getProjectJsonV1Template();
  positiveCapex.series.capexUSD = [100, 0, 0, 5, 8, 10];
  const parsedPositiveCapex = parseProjectJsonV1(positiveCapex);
  assertEqual(parsedPositiveCapex.engineInputWithoutPrices.phase1.capexUSD[0], 100, 'positive capex remains unchanged');
  assert(parsedPositiveCapex.warnings.includes('Normalized series length to masterN+1; padded/truncated as needed; null→0 for safe-to-zero series.'), 'normalization warning emitted when safe-to-zero nulls are present');

  const mixedNullCapex = getProjectJsonV1Template();
  mixedNullCapex.series.capexUSD = [null, -25, null, 0, -5, null];
  mixedNullCapex.series.sustainingCapexUSD = [null, -1, 2, null, -3, null];
  const parsedMixedNullCapex = parseProjectJsonV1(mixedNullCapex);
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[0], 0, 'capex null normalized to zero at index 0');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[1], 25, 'capex negative normalized with nulls preserved');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[5], 0, 'capex trailing null normalized to zero');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[0], 0, 'sustaining capex null normalized to zero at index 0');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[1], 1, 'sustaining capex negative normalized with nulls preserved');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[5], 0, 'sustaining capex trailing null normalized to zero');
  assert(parsedMixedNullCapex.warnings.includes('capexUSD: detected negative values; normalized to spend (abs).'), 'mixed null capex warning emitted');
  assert(parsedMixedNullCapex.warnings.includes('sustainingCapexUSD: detected negative values; normalized to spend (abs).'), 'mixed null sustaining capex warning emitted');
  assert(parsedMixedNullCapex.warnings.includes('Normalized series length to masterN+1; padded/truncated as needed; null→0 for safe-to-zero series.'), 'normalization warning emitted');


  const withBreakdown = getProjectJsonV1Template();
  withBreakdown.series.siteGandA_USD = new Array(withBreakdown.time.masterN + 1).fill(null);
  withBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: new Array(withBreakdown.time.masterN + 1).fill(10),
      siteGandA_USD: new Array(withBreakdown.time.masterN + 1).fill(5),
    },
    selling: {
      tcRcUSD: new Array(withBreakdown.time.masterN + 1).fill(3),
      transportUSD: new Array(withBreakdown.time.masterN + 1).fill(2),
    },
    royaltiesDetail: [
      {
        id: 'roy1',
        label: 'NSR',
        base: 'revenue',
        rate: 0.01,
      },
    ],
    taxesDetail: {
      federalIncomeTaxUSD: new Array(withBreakdown.time.masterN + 1).fill(1),
    },
  };
  const parsedBreakdown = parseProjectJsonV1(withBreakdown);
  assertEqual(parsedBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[0], 10, 'economics breakdown mining parsed');

  const sparseOperations = getProjectJsonV1Template();
  if (sparseOperations.operations == null) {
    throw new Error('template.operations must be present');
  }
  sparseOperations.time.productionStartPeriod = 0;
  sparseOperations.time.productionStartYear = new Date().getUTCFullYear();
  sparseOperations.operations.oreMilledTonnes = [10, 20];
  const parsedSparseOperations = parseProjectJsonV1(sparseOperations);
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.length, 6, 'sparse operations series padded to masterN+1');
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.[0], 10, 'sparse operations first value preserved');
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.[5], 0, 'sparse operations trailing values padded with zero');

  const sparseBreakdown = getProjectJsonV1Template();
  sparseBreakdown.series.siteGandA_USD = new Array(sparseBreakdown.time.masterN + 1).fill(null);
  sparseBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: [1, 2, 3],
    },
  };
  const parsedSparseBreakdown = parseProjectJsonV1(sparseBreakdown);
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.length, 6, 'sparse economics breakdown series padded to masterN+1');
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[2], 3, 'sparse economics breakdown value preserved');
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[5], null, 'sparse economics breakdown trailing values padded');

  const tooLongSparseBreakdown = getProjectJsonV1Template();
  tooLongSparseBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: [1, 2, 3, 4, 5, 6, 7],
    },
  };
  assertThrows(
    () => parseProjectJsonV1(tooLongSparseBreakdown),
    /economicsBreakdown\.cogs\.miningUSD length 7 exceeds expected max length 6/,
    'throws on sparse series longer than masterN+1 with path and expected max length',
  );

  const breakdownMetadata = getProjectJsonV1Template();
  breakdownMetadata.economicsBreakdown = {
    royaltiesDetail: [
      {
        id: 'roy-meta',
        label: 'Audited FS Royalty',
        base: 'revenue',
        rate: 0.02,
        source: 'FS',
        notes: 'from audited FS',
      },
    ],
  };
  const parsedBreakdownMetadata = parseProjectJsonV1(breakdownMetadata);
  assertEqual(parsedBreakdownMetadata.context.economicsBreakdown?.royaltiesDetail?.[0]?.source, 'FS', 'royalties metadata source accepted');
  assertEqual(parsedBreakdownMetadata.context.economicsBreakdown?.royaltiesDetail?.[0]?.notes, 'from audited FS', 'royalties metadata notes accepted');

  const duplicateSiteGanda = getProjectJsonV1Template();
  duplicateSiteGanda.series.siteGandA_USD[1] = 9;
  duplicateSiteGanda.economicsBreakdown = {
    cogs: {
      siteGandA_USD: new Array(duplicateSiteGanda.time.masterN + 1).fill(1),
    },
  };
  assertThrows(() => parseProjectJsonV1(duplicateSiteGanda), /economicsBreakdown\.cogs\.siteGandA_USD/, 'throws on siteGandA duplication');


  const scalarGrade = getProjectJsonV1Template();
  if (scalarGrade.operations == null) {
    throw new Error('template.operations must be present');
  }
  (scalarGrade.operations.gradeByMetal as Record<string, unknown>).Au = 6.86;
  const parsedScalarGrade = parseProjectJsonV1(scalarGrade);
  assertEqual(parsedScalarGrade.context.operations?.gradeByMetal?.Au?.length, scalarGrade.time.masterN + 1, 'scalar grade auto-broadcasts to masterN+1');
  assertEqual(parsedScalarGrade.context.operations?.gradeByMetal?.Au?.[0], 6.86, 'scalar grade broadcast keeps value');

  const scalarGradeBad = getProjectJsonV1Template();
  if (scalarGradeBad.operations == null) {
    throw new Error('template.operations must be present');
  }
  (scalarGradeBad.operations.gradeByMetal as Record<string, unknown>).Au = 'bad';
  assertThrows(
    () => parseProjectJsonV1(scalarGradeBad),
    /operations\.gradeByMetal\.Au must be an array of length 6 \(masterN\+1\).*Example: \[0, 0, 0, 0, 0, 0\].*Fill array with scalar/,
    'gradeByMetal scalar mismatch error includes expected length and example',
  );

  const ozUnit = getProjectJsonV1Template();
  (ozUnit.metals.payableQtyUnitByMetal as Record<string, unknown>).Au = 'oz';
  const parsedOzUnit = parseProjectJsonV1(ozUnit);
  assertEqual(parsedOzUnit.engineInputWithoutPrices.payableQtyUnitByMetal.Au, 'toz', 'oz unit auto-normalizes to toz');

  const duplicateSiteGandaIdentical = getProjectJsonV1Template();
  duplicateSiteGandaIdentical.series.siteGandA_USD = [0, 9, 0, 0, 0, 0];
  duplicateSiteGandaIdentical.economicsBreakdown = {
    cogs: {
      siteGandA_USD: [0, 9, 0, 0, 0, 0],
    },
  };
  const parsedDedup = parseProjectJsonV1(duplicateSiteGandaIdentical);
  assertEqual(parsedDedup.context.economicsBreakdown?.cogs?.siteGandA_USD, undefined, 'identical duplicate siteGandA is deduped from economicsBreakdown');

  const duplicateSiteGandaNullZeroEquivalent = getProjectJsonV1Template();
  duplicateSiteGandaNullZeroEquivalent.series.siteGandA_USD = [0, null, 5, 0, null, 3];
  duplicateSiteGandaNullZeroEquivalent.economicsBreakdown = {
    cogs: {
      siteGandA_USD: [null, 0, 5, null, 0, 3],
    },
  };
  const parsedNullZeroDedup = parseProjectJsonV1(duplicateSiteGandaNullZeroEquivalent);
  assertEqual(parsedNullZeroDedup.context.economicsBreakdown?.cogs?.siteGandA_USD, undefined, 'null vs 0 equivalent duplicate siteGandA is deduped from economicsBreakdown');

  const duplicateSiteGandaMismatch = getProjectJsonV1Template();
  duplicateSiteGandaMismatch.series.siteGandA_USD = [0, 9, 0, 0, 0, 0];
  duplicateSiteGandaMismatch.economicsBreakdown = {
    cogs: {
      siteGandA_USD: [0, 8, 0, 0, 0, 0],
    },
  };
  assertThrows(
    () => parseProjectJsonV1(duplicateSiteGandaMismatch),
    /First difference at index 1: economicsBreakdown=8, series=9\. Editor cannot auto-resolve because arrays differ\./,
    'siteGandA mismatch reports first differing index',
  );

  const nullFd = getProjectJsonV1Template();
  nullFd.equity = { fdExtraShares: null, fdNotes: '' };
  assertThrows(
    () => parseProjectJsonV1(nullFd),
    /equity\.fdExtraShares must be a finite number >= 0\. Received null\. Example: 0/,
    'fdExtraShares null has guidance message',
  );

  assert(parsedDedup.diagnostics.normalization.some((item) => item.rule === 'dedup_identical_site_ganda_overlap'), 'dedup diagnostics captured');
  assert(parsedNullZeroDedup.diagnostics.normalization.some((item) => item.summary.includes('Auto-resolved duplicate siteGandA')), 'null/zero equivalent dedup diagnostics captured');
  assert(parsedOzUnit.diagnostics.normalization.some((item) => item.rule === 'qty_unit_oz_to_toz'), 'unit normalization diagnostics captured');

  const invalidOperations = getProjectJsonV1Template();
  if (invalidOperations.operations == null) {
    throw new Error('template.operations must be present');
  }
  invalidOperations.operations.capacity.nameplateThroughput = 0;
  assertThrows(
    () => parseProjectJsonV1(invalidOperations),
    /operations\.capacity\.nameplateThroughput/,
    'throws on invalid operations capacity',
  );

  console.log('Project JSON v1 parse tests passed');
})();
