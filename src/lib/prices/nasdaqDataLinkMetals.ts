const LB_PER_TONNE = 2204.6226218;

export type NasdaqDataLinkMetal = 'zinc' | 'nickel' | 'lead';

export type NasdaqDataLinkMetalPrice = {
  metal: NasdaqDataLinkMetal;
  date: string;
  price: number;
  unit: string;
  source: 'nasdaq_data_link';
  datasetId: string;
};

export type NasdaqDataLinkResolution =
  | { ok: true; value: NasdaqDataLinkMetalPrice }
  | { ok: false; missingSourceReason: string; datasetId: string | null; unit: string | null };

const METAL_CONFIG: Record<NasdaqDataLinkMetal, {
  datasetIdEnvVar: string;
  unitEnvVar: string;
  priceColumnEnvVar: string;
}> = {
  zinc: {
    datasetIdEnvVar: 'NASDAQ_DATA_LINK_ZINC_DATASET_ID',
    unitEnvVar: 'NASDAQ_DATA_LINK_ZINC_UNIT',
    priceColumnEnvVar: 'NASDAQ_DATA_LINK_ZINC_PRICE_COLUMN',
  },
  nickel: {
    datasetIdEnvVar: 'NASDAQ_DATA_LINK_NICKEL_DATASET_ID',
    unitEnvVar: 'NASDAQ_DATA_LINK_NICKEL_UNIT',
    priceColumnEnvVar: 'NASDAQ_DATA_LINK_NICKEL_PRICE_COLUMN',
  },
  lead: {
    datasetIdEnvVar: 'NASDAQ_DATA_LINK_LEAD_DATASET_ID',
    unitEnvVar: 'NASDAQ_DATA_LINK_LEAD_UNIT',
    priceColumnEnvVar: 'NASDAQ_DATA_LINK_LEAD_PRICE_COLUMN',
  },
};

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDatasetConfig(metal: NasdaqDataLinkMetal): { datasetId: string; unit: string; priceColumn: string } | { missingSourceReason: string; datasetId: string | null; unit: string | null } {
  const config = METAL_CONFIG[metal];
  const datasetId = readEnv(config.datasetIdEnvVar);
  const unit = readEnv(config.unitEnvVar);
  const priceColumn = readEnv(config.priceColumnEnvVar);

  if (!datasetId) {
    return {
      missingSourceReason: `Missing explicit dataset mapping for ${metal}: env ${config.datasetIdEnvVar} is not set.`,
      datasetId: null,
      unit: unit ?? null,
    };
  }
  if (!unit) {
    return {
      missingSourceReason: `Missing explicit unit mapping for ${metal}: env ${config.unitEnvVar} is not set.`,
      datasetId,
      unit: null,
    };
  }
  if (!priceColumn) {
    return {
      missingSourceReason: `Missing explicit price-column mapping for ${metal}: env ${config.priceColumnEnvVar} is not set.`,
      datasetId,
      unit,
    };
  }

  const parts = datasetId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      missingSourceReason: `Invalid datasetId '${datasetId}' for ${metal}. Expected DATABASE_CODE/DATASET_CODE.`,
      datasetId,
      unit,
    };
  }

  return { datasetId, unit, priceColumn };
}

type DatasetDataResponse = {
  dataset_data?: {
    column_names?: unknown;
    data?: unknown;
  };
};

export async function fetchNasdaqDataLinkMetalPrice(args: {
  metal: NasdaqDataLinkMetal;
  apiKey?: string | null;
  fetchFn?: typeof fetch;
}): Promise<NasdaqDataLinkResolution> {
  const apiKey = (args.apiKey ?? readEnv('NASDAQ_DATA_LINK_API_KEY'))?.trim() ?? '';
  if (!apiKey) {
    return {
      ok: false,
      datasetId: null,
      unit: null,
      missingSourceReason: 'Missing NASDAQ_DATA_LINK_API_KEY env for Nasdaq Data Link metal pricing.',
    };
  }

  const resolvedConfig = resolveDatasetConfig(args.metal);
  if ('missingSourceReason' in resolvedConfig) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: resolvedConfig.missingSourceReason,
    };
  }

  const [databaseCode, datasetCode] = resolvedConfig.datasetId.split('/');
  const fetchFn = args.fetchFn ?? fetch;
  const endpoint = `https://data.nasdaq.com/api/v3/datasets/${encodeURIComponent(databaseCode)}/${encodeURIComponent(datasetCode)}/data.json?rows=1&order=desc&api_key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetchFn(endpoint);
  } catch (error) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Nasdaq Data Link request failed for ${resolvedConfig.datasetId}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Nasdaq Data Link returned HTTP ${response.status} for ${resolvedConfig.datasetId}.`,
    };
  }

  const body = (await response.json()) as DatasetDataResponse;
  const columnNames = Array.isArray(body.dataset_data?.column_names) ? body.dataset_data?.column_names : null;
  const rows = Array.isArray(body.dataset_data?.data) ? body.dataset_data?.data : null;
  if (!columnNames || !rows || rows.length === 0) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Nasdaq Data Link dataset ${resolvedConfig.datasetId} returned no rows.`,
    };
  }

  const firstRow = rows[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Nasdaq Data Link dataset ${resolvedConfig.datasetId} returned an invalid row shape.`,
    };
  }

  const priceColumnIndex = columnNames.findIndex((name) => typeof name === 'string' && name.toLowerCase() === resolvedConfig.priceColumn.toLowerCase());
  if (priceColumnIndex < 0) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Configured price column '${resolvedConfig.priceColumn}' not found in ${resolvedConfig.datasetId}.`,
    };
  }

  const dateRaw = firstRow[0];
  const priceRaw = firstRow[priceColumnIndex];
  if (typeof dateRaw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Invalid date value returned by ${resolvedConfig.datasetId}.`,
    };
  }

  if (typeof priceRaw !== 'number' || !Number.isFinite(priceRaw)) {
    return {
      ok: false,
      datasetId: resolvedConfig.datasetId,
      unit: resolvedConfig.unit,
      missingSourceReason: `Invalid price value returned by ${resolvedConfig.datasetId} column ${resolvedConfig.priceColumn}.`,
    };
  }

  return {
    ok: true,
    value: {
      metal: args.metal,
      date: dateRaw,
      price: priceRaw,
      unit: resolvedConfig.unit,
      source: 'nasdaq_data_link',
      datasetId: resolvedConfig.datasetId,
    },
  };
}

export function normalizeNasdaqMetalPriceUnit(args: {
  price: number;
  fromUnit: string;
  toUnit: string;
}): { ok: true; normalizedPrice: number; conversionNote: string | null } | { ok: false; missingSourceReason: string } {
  const from = args.fromUnit.trim().toLowerCase();
  const to = args.toUnit.trim().toLowerCase();

  if (from === to) {
    return { ok: true, normalizedPrice: args.price, conversionNote: null };
  }

  if (from === 'usd/tonne' && to === 'usd/lb') {
    return {
      ok: true,
      normalizedPrice: args.price / LB_PER_TONNE,
      conversionNote: 'Converted Nasdaq Data Link price from USD/tonne to USD/lb using 1 tonne = 2204.6226218 lb.',
    };
  }

  if (from === 'usd/lb' && to === 'usd/tonne') {
    return {
      ok: true,
      normalizedPrice: args.price * LB_PER_TONNE,
      conversionNote: 'Converted Nasdaq Data Link price from USD/lb to USD/tonne using 1 tonne = 2204.6226218 lb.',
    };
  }

  return {
    ok: false,
    missingSourceReason: `Unsupported Nasdaq Data Link unit conversion from ${args.fromUnit} to ${args.toUnit}.`,
  };
}

export function metalCodeToNasdaqMetal(code: string): NasdaqDataLinkMetal | null {
  if (code === 'Zn') return 'zinc';
  if (code === 'Ni') return 'nickel';
  if (code === 'Pb') return 'lead';
  return null;
}
