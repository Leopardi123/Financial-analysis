export type CanonicalSectorCategory = "main_sector" | "subsector" | "macro_bucket";

export type CanonicalSectorNode = {
  id: string;
  title: string;
  category: CanonicalSectorCategory;
  parentId?: string | null;
  aliases: string[];
  assetDrivers: string[];
  notes?: string;
};

export type MacroSectorUniverse = {
  sectors: CanonicalSectorNode[];
};

export const macroSectorUniverse: MacroSectorUniverse = {
  sectors: [
    { id: "energy", title: "Energy", category: "main_sector", parentId: null, aliases: ["energy-sector"], assetDrivers: ["energy", "localUnrestOverlay", "energyShockOverlay", "inflationCostShockOverlay"] },
    { id: "materials", title: "Materials", category: "main_sector", parentId: null, aliases: ["materials-resources", "resource-equities"], assetDrivers: ["copper", "gold"] },
    { id: "industrials", title: "Industrials", category: "main_sector", parentId: null, aliases: ["broad-market-industrials"], assetDrivers: ["industrials", "broadEquities"] },
    { id: "financials", title: "Financials", category: "main_sector", parentId: null, aliases: ["financials-cyclicals-softened"], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "tech", title: "Tech", category: "main_sector", parentId: null, aliases: ["growth-tech", "long-duration-tech"], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "utilities", title: "Utilities", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay"] },
    { id: "consumer_discretionary", title: "Consumer discretionary", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["smallCaps", "broadEquities"] },
    { id: "consumer_staples", title: "Consumer staples", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "healthcare", title: "Healthcare", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "Balanced"] },
    { id: "real_estate", title: "Real estate", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["durationAssets", "creditFundingOverlay"] },
    { id: "communication_services", title: "Communication services", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "defense", title: "Defense", category: "main_sector", parentId: null, aliases: ["defense-energy-logistics"], assetDrivers: ["localUnrestOverlay"] },
    { id: "transportation_logistics", title: "Transportation and logistics", category: "main_sector", parentId: null, aliases: ["shipping-logistics", "shipping_logistics"], assetDrivers: ["energy", "localUnrestOverlay", "broadEquities"] },

    { id: "gold_miners", title: "Gold miners", category: "subsector", parentId: "materials", aliases: ["gold-miners", "gold-hard-assets-safehaven", "hard-asset-defensives"], assetDrivers: ["gold", "safeHavenRiskOffOverlay", "localUnrestOverlay"] },
    { id: "diversified_miners", title: "Diversified miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper", "gold", "materials"] },
    { id: "copper_miners", title: "Copper miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper"] },
    { id: "uranium", title: "Uranium", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "oil_gas_producers", title: "Oil and gas producers", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "energyShockOverlay"] },
    { id: "oil_services", title: "Oil services", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "refiners", title: "Refiners", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "defense_contractors", title: "Defense contractors", category: "subsector", parentId: "defense", aliases: [], assetDrivers: ["localUnrestOverlay"] },
    { id: "shipping_logistics", title: "Shipping logistics", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "localUnrestOverlay"] },
    { id: "industrial_cyclicals", title: "Industrial cyclicals", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials", "broadEquities"] },
    { id: "capital_goods", title: "Capital goods", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials"] },
    { id: "banks", title: "Banks", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "insurers", title: "Insurers", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["creditFundingOverlay", "Balanced"] },
    { id: "asset_managers", title: "Asset managers", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["broadEquities", "creditFundingOverlay"] },
    { id: "semiconductors", title: "Semiconductors", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "software", title: "Software", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "long_duration_tech", title: "Long duration tech", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "regulated_utilities", title: "Regulated utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "power_grid_utilities", title: "Power grid utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "consumer_cyclicals", title: "Consumer cyclicals", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["smallCaps", "broadEquities", "creditFundingOverlay"] },
    { id: "consumer_defensives", title: "Consumer defensives", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "reits_rate_sensitive", title: "Rate-sensitive REITs", category: "subsector", parentId: "real_estate", aliases: [], assetDrivers: ["durationAssets", "creditFundingOverlay"] },

    { id: "hard_asset_equities", title: "Hard asset equities", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["gold", "energy", "copper", "safeHavenRiskOffOverlay"] },
    { id: "small_caps", title: "Small caps", category: "macro_bucket", parentId: null, aliases: ["small-caps-cyclicals"], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "duration_sensitive_equities", title: "Duration-sensitive equities", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["durationAssets", "growthEquities", "liquidityOverlay"] },
    { id: "credit_sensitive_cyclicals", title: "Credit-sensitive cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "value_cyclicals", title: "Value cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["energy", "materials", "industrials"] },
    { id: "quality_defensives", title: "Quality defensives", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk", "localUnrestOverlay"] },
  ],
};

const sectorById = new Map(macroSectorUniverse.sectors.map((sector) => [sector.id, sector]));
const aliasToIds = new Map<string, string[]>();

macroSectorUniverse.sectors.forEach((sector) => {
  const aliases = [...sector.aliases, sector.id];
  aliases.forEach((alias) => {
    const current = aliasToIds.get(alias) ?? [];
    if (!current.includes(sector.id)) current.push(sector.id);
    aliasToIds.set(alias, current);
  });
});

const explicitAliasTargets: Record<string, string[]> = {
  "defense-energy-logistics": ["defense", "defense_contractors", "shipping_logistics", "transportation_logistics", "energy"],
  "hard-asset-defensives": ["hard_asset_equities", "quality_defensives", "gold_miners"],
  "gold-hard-assets-safehaven": ["gold_miners", "hard_asset_equities", "quality_defensives"],
  "financials-cyclicals-softened": ["financials", "banks", "credit_sensitive_cyclicals"],
  "resource-equities": ["materials", "diversified_miners", "value_cyclicals"],
  "materials-resources": ["materials", "diversified_miners", "copper_miners"],
  "growth-tech": ["tech", "semiconductors", "software", "long_duration_tech", "duration_sensitive_equities"],
  "long-duration-tech": ["long_duration_tech", "duration_sensitive_equities", "tech"],
  "small-caps-cyclicals": ["small_caps", "consumer_cyclicals", "credit_sensitive_cyclicals"],
  "broad-market-industrials": ["industrials", "industrial_cyclicals", "capital_goods", "value_cyclicals"],
};

export function resolveCanonicalSectorTargets(candidateId: string): string[] {
  if (explicitAliasTargets[candidateId]) return explicitAliasTargets[candidateId];
  return aliasToIds.get(candidateId) ?? [];
}

export function getCanonicalSectorTitle(canonicalId: string): string | null {
  return sectorById.get(canonicalId)?.title ?? null;
}

export function getMacroSectorUniverseNode(id: string): CanonicalSectorNode | null {
  return sectorById.get(id) ?? null;
}
