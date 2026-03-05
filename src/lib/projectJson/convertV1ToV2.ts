const V1_VERSION = 'project_json_v1';
const V2_VERSION = 'project_json_v2';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimeSeriesArray(value: unknown): value is Array<number | null> {
  return Array.isArray(value) && value.every((entry) => entry === null || typeof entry === 'number');
}

function collectSeriesArrays(
  value: unknown,
  collector: Record<string, Array<number | null>>,
): void {
  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (isTimeSeriesArray(nested)) {
      collector[key] = nested;
      continue;
    }

    if (isRecord(nested)) {
      collectSeriesArrays(nested, collector);
    }
  }
}

export function convertProjectJsonV1ToV2(input: unknown): JsonRecord {
  if (!isRecord(input)) {
    throw new Error('JSON root must be an object.');
  }

  if (input.version !== V1_VERSION) {
    throw new Error('Only project_json_v1 can be converted.');
  }

  if (!isRecord(input.meta)) {
    throw new Error('v1.meta must be an object.');
  }

  if (!isRecord(input.time)) {
    throw new Error('v1.time must be an object.');
  }

  const masterNRaw = input.time.masterN;
  if (!Number.isInteger(masterNRaw)) {
    throw new Error('v1.time.masterN must be an integer.');
  }

  const masterN = masterNRaw as number;

  const series: Record<string, Array<number | null>> = {};
  for (const [topLevelKey, topLevelValue] of Object.entries(input)) {
    if (['version', '_choices_version', 'meta', 'time', 'economics', 'metals'].includes(topLevelKey)) {
      continue;
    }

    if (isRecord(topLevelValue)) {
      collectSeriesArrays(topLevelValue, series);
    }
  }

  for (const [key, values] of Object.entries(series)) {
    if (values.length !== masterN + 1 && values.length !== masterN) {
      console.warn(`[convertProjectJsonV1ToV2] series.${key} has length=${values.length}; expected ${masterN} or ${masterN + 1}.`);
    }
  }

  return {
    version: V2_VERSION,
    _choices_version: [V1_VERSION],
    meta: {
      projectId: input.meta.projectId,
      projectName: input.meta.projectName,
      currency: input.meta.currency,
      _choices_currency: [input.meta.currency],
      notes: typeof input.meta.notes === 'string' ? input.meta.notes : '',
    },
    time: {
      masterN: input.time.masterN,
      productionStartPeriod: input.time.productionStartPeriod,
      productionStartYear: Object.prototype.hasOwnProperty.call(input.time, 'productionStartYear')
        ? input.time.productionStartYear
        : null,
      periodEndDatesUtc: Object.prototype.hasOwnProperty.call(input.time, 'periodEndDatesUtc')
        ? input.time.periodEndDatesUtc
        : null,
    },
    economics: Object.prototype.hasOwnProperty.call(input, 'economics') ? input.economics : null,
    metals: Object.prototype.hasOwnProperty.call(input, 'metals') ? input.metals : null,
    series,
    sources: {
      raw: null,
    },
  };
}
