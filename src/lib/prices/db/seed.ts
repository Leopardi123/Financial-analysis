import { batch } from "../../../../api/_db.js";
import { PRICE_KEY_DEFINITIONS, type PriceKind } from "../keys.ts";
import { PRICE_TABLES } from "./schema.ts";

interface ProviderMapping {
  priceKey: string;
  provider: "FMP";
  providerSymbol: string;
  providerKind: PriceKind;
  notes: string;
}

export const DEFAULT_PROVIDER_MAPPINGS: readonly ProviderMapping[] = [
  { priceKey: "XAU_USD_TOZ", provider: "FMP", providerSymbol: "GCUSD", providerKind: "commodity", notes: "Gold CFD mapping" },
  { priceKey: "XAG_USD_TOZ", provider: "FMP", providerSymbol: "SIUSD", providerKind: "commodity", notes: "Silver CFD mapping" },
  {
    priceKey: "CU_USD_LB",
    provider: "FMP",
    providerSymbol: "HGUSD",
    providerKind: "commodity",
    notes: "TEMP: COMEX HG proxy for copper until dedicated FMP spot symbol is validated",
  },
  { priceKey: "ZN_USD_LB", provider: "FMP", providerSymbol: "ZNUSD", providerKind: "commodity", notes: "TODO: verify FMP zinc symbol in production" },
  { priceKey: "PB_USD_LB", provider: "FMP", providerSymbol: "PBUSD", providerKind: "commodity", notes: "TODO: verify FMP lead symbol in production" },
  { priceKey: "NI_USD_LB", provider: "FMP", providerSymbol: "NIUSD", providerKind: "commodity", notes: "TODO: verify FMP nickel symbol in production" },
  { priceKey: "USD_SEK", provider: "FMP", providerSymbol: "USDSEK", providerKind: "forex", notes: "Major FX pair" },
  { priceKey: "EUR_USD", provider: "FMP", providerSymbol: "EURUSD", providerKind: "forex", notes: "Major FX pair" },
  { priceKey: "USD_CAD", provider: "FMP", providerSymbol: "USDCAD", providerKind: "forex", notes: "Major FX pair" },
] as const;

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
