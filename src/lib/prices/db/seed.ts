import { batch } from "../../../../api/_db.js";
import { PRICE_KEY_DEFINITIONS, type PriceKind } from "../keys.js";
import { FRED_COMMODITY_PRICE_MAPPINGS } from "../providers/fred.js";
import { IMF_COMMODITY_PRICE_MAPPINGS } from "../providers/imfCommodity.js";
import { PRICE_TABLES } from "./schema.js";

interface ProviderMapping {
  priceKey: string;
  provider: "FMP" | "FRED" | "IMF";
  providerSymbol: string;
  providerKind: PriceKind;
  notes: string;
}

const FMP_PROVIDER_MAPPINGS: readonly ProviderMapping[] = [
  { priceKey: "XAU_USD_TOZ", provider: "FMP", providerSymbol: "GCUSD", providerKind: "commodity", notes: "unit=USD_PER_TOZ; verified FMP Legacy commodity symbol" },
  { priceKey: "XAG_USD_TOZ", provider: "FMP", providerSymbol: "SIUSD", providerKind: "commodity", notes: "unit=USD_PER_TOZ; verified FMP Legacy commodity symbol" },
  { priceKey: "XPT_USD_TOZ", provider: "FMP", providerSymbol: "PLUSD", providerKind: "commodity", notes: "unit=USD_PER_TOZ; verified FMP Legacy commodity symbol" },
  { priceKey: "XPD_USD_TOZ", provider: "FMP", providerSymbol: "PAUSD", providerKind: "commodity", notes: "unit=USD_PER_TOZ; verified FMP Legacy commodity symbol" },
  {
    priceKey: "CU_USD_LB",
    provider: "FMP",
    providerSymbol: "HGUSD",
    providerKind: "commodity",
    notes: "unit=USD_PER_LB; COMEX HG basis; verified FMP Legacy commodity symbol",
  },
  {
    priceKey: "AL_USD_TONNE",
    provider: "FMP",
    providerSymbol: "ALIUSD",
    providerKind: "commodity",
    notes: "unit=USD_PER_TONNE; verified FMP Legacy commodity symbol",
  },
  { priceKey: "USD_SEK", provider: "FMP", providerSymbol: "USDSEK", providerKind: "forex", notes: "Major FX pair" },
  { priceKey: "EUR_USD", provider: "FMP", providerSymbol: "EURUSD", providerKind: "forex", notes: "Major FX pair" },
  { priceKey: "USD_CAD", provider: "FMP", providerSymbol: "USDCAD", providerKind: "forex", notes: "Major FX pair" },
] as const;

const FRED_PROVIDER_MAPPINGS: readonly ProviderMapping[] = FRED_COMMODITY_PRICE_MAPPINGS.map((mapping) => ({
  priceKey: mapping.priceKey,
  provider: "FRED" as const,
  providerSymbol: mapping.fredSeriesId,
  providerKind: "commodity" as const,
  notes: `unit=${mapping.providerUnit}; ${mapping.description}; frequency=${mapping.frequency}; not spot`,
}));

const IMF_PROVIDER_MAPPINGS: readonly ProviderMapping[] = IMF_COMMODITY_PRICE_MAPPINGS.map((mapping) => ({
  priceKey: mapping.priceKey,
  provider: "IMF" as const,
  providerSymbol: mapping.datasetSeriesId,
  providerKind: "commodity" as const,
  notes: `unit=${mapping.providerUnit}; ${mapping.description}; frequency=${mapping.frequency}; official IMF monthly workbook; not spot`,
}));

export const DEFAULT_PROVIDER_MAPPINGS: readonly ProviderMapping[] = [
  ...FMP_PROVIDER_MAPPINGS,
  ...FRED_PROVIDER_MAPPINGS,
  ...IMF_PROVIDER_MAPPINGS,
];

export async function seedPriceRegistry(): Promise<void> {
  await batch([
    ...PRICE_KEY_DEFINITIONS.map((definition) => ({
      sql: `INSERT INTO ${PRICE_TABLES.registry} (price_key, canonical_unit, kind, description, decimals)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(price_key) DO UPDATE SET
              canonical_unit = excluded.canonical_unit,
              kind = excluded.kind,
              description = excluded.description,
              decimals = excluded.decimals`,
      args: [
        definition.priceKey,
        definition.canonicalUnit,
        definition.kind,
        definition.description,
        definition.decimals,
      ],
    })),
    ...DEFAULT_PROVIDER_MAPPINGS.map((mapping) => ({
      sql: `INSERT INTO ${PRICE_TABLES.providerMap} (price_key, provider, provider_symbol, provider_kind, notes)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(price_key) DO UPDATE SET
              provider = excluded.provider,
              provider_symbol = excluded.provider_symbol,
              provider_kind = excluded.provider_kind,
              notes = excluded.notes`,
      args: [mapping.priceKey, mapping.provider, mapping.providerSymbol, mapping.providerKind, mapping.notes],
    }))
  ]);
}
