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

export type DashboardSectorOption = {
  id: string;
  title: string;
  subsectors: Array<{
    id: string;
    title: string;
    macroTargetIds: string[];
  }>;
};

export type SubsectorMacroRouting = {
  subsectorId: string;
  explicitTargetIds: string[];
  sectorFallbackId: string;
  macroBucketFallbackIds: string[];
  coverage: "explicit" | "limited";
};

export const macroSectorUniverse: MacroSectorUniverse = {
  sectors: [
    { id: "energy", title: "Energy", category: "main_sector", parentId: null, aliases: ["energy-sector", "oil"], assetDrivers: ["energy", "localUnrestOverlay", "energyShockOverlay", "inflationCostShockOverlay"] },
    { id: "materials", title: "Materials", category: "main_sector", parentId: null, aliases: ["materials-resources", "resource-equities", "commodities"], assetDrivers: ["copper", "gold"] },
    { id: "industrials", title: "Industrials", category: "main_sector", parentId: null, aliases: ["broad-market-industrials"], assetDrivers: ["industrials", "broadEquities"] },
    { id: "financials", title: "Financials", category: "main_sector", parentId: null, aliases: ["financials-cyclicals-softened"], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "tech", title: "Information technology", category: "main_sector", parentId: null, aliases: ["information_technology", "growth-tech", "long-duration-tech"], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "utilities", title: "Utilities", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay"] },
    { id: "consumer_discretionary", title: "Consumer discretionary", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["smallCaps", "broadEquities"] },
    { id: "consumer_staples", title: "Consumer staples", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "healthcare", title: "Healthcare", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "Balanced"] },
    { id: "real_estate", title: "Real estate", category: "main_sector", parentId: null, aliases: ["property"], assetDrivers: ["durationAssets", "creditFundingOverlay"] },
    { id: "communication_services", title: "Communication services", category: "main_sector", parentId: null, aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "defense", title: "Defense", category: "main_sector", parentId: null, aliases: ["defense-energy-logistics"], assetDrivers: ["localUnrestOverlay"] },
    { id: "transportation_logistics", title: "Transportation and logistics", category: "main_sector", parentId: null, aliases: ["shipping-logistics", "shipping_logistics", "transport"], assetDrivers: ["energy", "localUnrestOverlay", "broadEquities"] },

    { id: "oil_gas_producers", title: "Oil and gas producers", category: "subsector", parentId: "energy", aliases: ["exploration_production"], assetDrivers: ["energy", "energyShockOverlay"] },
    { id: "integrated_energy", title: "Integrated energy", category: "subsector", parentId: "energy", aliases: ["majors"], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "oil_services", title: "Oil services", category: "subsector", parentId: "energy", aliases: ["ofs"], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "refiners", title: "Refiners", category: "subsector", parentId: "energy", aliases: ["downstream"], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "midstream", title: "Midstream", category: "subsector", parentId: "energy", aliases: ["pipelines"], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "coal", title: "Coal", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "uranium", title: "Uranium", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "renewable_developers", title: "Renewable developers", category: "subsector", parentId: "energy", aliases: ["renewables"], assetDrivers: ["energy", "durationAssets"] },
    { id: "energy_equipment", title: "Energy equipment", category: "subsector", parentId: "energy", aliases: [], assetDrivers: ["energy", "industrials"] },

    { id: "gold_miners", title: "Gold miners", category: "subsector", parentId: "materials", aliases: ["gold-miners", "gold-hard-assets-safehaven", "hard-asset-defensives", "gold"], assetDrivers: ["gold", "safeHavenRiskOffOverlay", "localUnrestOverlay"] },
    { id: "silver_miners", title: "Silver miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["gold", "copper"] },
    { id: "copper_miners", title: "Copper miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper"] },
    { id: "diversified_miners", title: "Diversified miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper", "gold", "materials"] },
    { id: "steel", title: "Steel", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper", "industrials"] },
    { id: "chemicals", title: "Chemicals", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["energy", "industrials"] },
    { id: "fertilizers", title: "Fertilizers", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["energy", "materials"] },
    { id: "construction_materials", title: "Construction materials", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["industrials", "broadEquities"] },
    { id: "precious_metals", title: "Precious metals", category: "subsector", parentId: "materials", aliases: ["precious_metals_miners"], assetDrivers: ["gold", "safeHavenRiskOffOverlay"] },
    { id: "base_metals", title: "Base metals", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper", "industrials"] },
    { id: "lithium_miners", title: "Lithium miners", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["copper", "growthEquities"] },
    { id: "paper_packaging", title: "Paper and packaging", category: "subsector", parentId: "materials", aliases: [], assetDrivers: ["broadEquities", "industrials"] },

    { id: "capital_goods", title: "Capital goods", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials"] },
    { id: "machinery", title: "Machinery", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials", "broadEquities"] },
    { id: "electrical_equipment", title: "Electrical equipment", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials", "energy"] },
    { id: "engineering_construction", title: "Engineering and construction", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials", "broadEquities"] },
    { id: "building_products", title: "Building products", category: "subsector", parentId: "industrials", aliases: [], assetDrivers: ["industrials", "housing_related"] },

    { id: "rail", title: "Rail", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "broadEquities"] },
    { id: "trucking", title: "Trucking", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "broadEquities"] },
    { id: "shipping", title: "Shipping", category: "subsector", parentId: "transportation_logistics", aliases: ["shipping_logistics"], assetDrivers: ["energy", "localUnrestOverlay"] },
    { id: "airlines", title: "Airlines", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "consumer_cyclicals"] },
    { id: "logistics", title: "Logistics", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "broadEquities"] },
    { id: "ports_infrastructure", title: "Ports and infrastructure", category: "subsector", parentId: "transportation_logistics", aliases: [], assetDrivers: ["energy", "localUnrestOverlay"] },

    { id: "defense_contractors", title: "Defense contractors", category: "subsector", parentId: "defense", aliases: ["military_contractors"], assetDrivers: ["localUnrestOverlay"] },
    { id: "aerospace_defense", title: "Aerospace and defense", category: "subsector", parentId: "defense", aliases: [], assetDrivers: ["localUnrestOverlay", "industrials"] },

    { id: "banks", title: "Banks", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "regional_banks", title: "Regional banks", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "insurers", title: "Insurers", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["creditFundingOverlay", "Balanced"] },
    { id: "asset_managers", title: "Asset managers", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["broadEquities", "creditFundingOverlay"] },
    { id: "brokers_exchanges", title: "Brokers and exchanges", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["broadEquities", "growthEquities"] },
    { id: "specialty_finance", title: "Specialty finance", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "payment_networks", title: "Payment networks", category: "subsector", parentId: "financials", aliases: [], assetDrivers: ["consumer_cyclicals", "broadEquities"] },

    { id: "software", title: "Software", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "semiconductors", title: "Semiconductors", category: "subsector", parentId: "tech", aliases: ["chips"], assetDrivers: ["growthEquities", "durationAssets", "liquidityOverlay"] },
    { id: "hardware", title: "Hardware", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "it_services", title: "IT services", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "broadEquities"] },
    { id: "cybersecurity", title: "Cybersecurity", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "defense"] },
    { id: "long_duration_tech", title: "Long duration tech", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "cloud_infrastructure", title: "Cloud infrastructure", category: "subsector", parentId: "tech", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },

    { id: "regulated_utilities", title: "Regulated utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "power_grid_utilities", title: "Power grid utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "independent_power", title: "Independent power producers", category: "subsector", parentId: "utilities", aliases: ["ipp"], assetDrivers: ["energy", "inflationCostShockOverlay"] },
    { id: "water_utilities", title: "Water utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "Balanced"] },
    { id: "multi_utilities", title: "Multi-utilities", category: "subsector", parentId: "utilities", aliases: [], assetDrivers: ["energy", "safeHavenRiskOffOverlay"] },

    { id: "consumer_cyclicals", title: "Consumer cyclicals", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["smallCaps", "broadEquities", "creditFundingOverlay"] },
    { id: "autos", title: "Autos", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["consumer_cyclicals", "energy"] },
    { id: "retail", title: "Retail", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["consumer_cyclicals", "smallCaps"] },
    { id: "housing_related", title: "Housing-related", category: "subsector", parentId: "consumer_discretionary", aliases: ["homebuilders"], assetDrivers: ["durationAssets", "smallCaps"] },
    { id: "travel_leisure", title: "Travel and leisure", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["consumer_cyclicals", "energy"] },
    { id: "apparel_luxury", title: "Apparel and luxury", category: "subsector", parentId: "consumer_discretionary", aliases: [], assetDrivers: ["consumer_cyclicals", "broadEquities"] },

    { id: "consumer_defensives", title: "Consumer defensives", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk"] },
    { id: "food_beverage", title: "Food and beverage", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["consumer_defensives", "inflationCostShockOverlay"] },
    { id: "household_products", title: "Household products", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["consumer_defensives", "safeHavenRiskOffOverlay"] },
    { id: "personal_care", title: "Personal care", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["consumer_defensives", "broadEquities"] },
    { id: "tobacco", title: "Tobacco", category: "subsector", parentId: "consumer_staples", aliases: [], assetDrivers: ["consumer_defensives", "safeHavenRiskOffOverlay"] },

    { id: "pharma", title: "Pharma", category: "subsector", parentId: "healthcare", aliases: ["pharmaceuticals"], assetDrivers: ["safeHavenRiskOffOverlay", "Balanced"] },
    { id: "biotech", title: "Biotech", category: "subsector", parentId: "healthcare", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "healthcare_equipment", title: "Healthcare equipment", category: "subsector", parentId: "healthcare", aliases: [], assetDrivers: ["healthcare", "broadEquities"] },
    { id: "healthcare_services", title: "Healthcare services", category: "subsector", parentId: "healthcare", aliases: [], assetDrivers: ["healthcare", "consumer_defensives"] },
    { id: "diagnostics", title: "Diagnostics", category: "subsector", parentId: "healthcare", aliases: [], assetDrivers: ["healthcare", "growthEquities"] },
    { id: "life_sciences_tools", title: "Life sciences tools", category: "subsector", parentId: "healthcare", aliases: [], assetDrivers: ["healthcare", "growthEquities"] },

    { id: "telecom", title: "Telecom", category: "subsector", parentId: "communication_services", aliases: [], assetDrivers: ["communication_services", "safeHavenRiskOffOverlay"] },
    { id: "media", title: "Media", category: "subsector", parentId: "communication_services", aliases: [], assetDrivers: ["communication_services", "broadEquities"] },
    { id: "internet_platforms", title: "Internet platforms", category: "subsector", parentId: "communication_services", aliases: [], assetDrivers: ["growthEquities", "durationAssets"] },
    { id: "advertising_gaming", title: "Advertising and gaming", category: "subsector", parentId: "communication_services", aliases: [], assetDrivers: ["consumer_cyclicals", "growthEquities"] },

    { id: "reits_rate_sensitive", title: "Rate-sensitive REITs", category: "subsector", parentId: "real_estate", aliases: [], assetDrivers: ["durationAssets", "creditFundingOverlay"] },
    { id: "industrial_reits", title: "Industrial REITs", category: "subsector", parentId: "real_estate", aliases: [], assetDrivers: ["broadEquities", "logistics"] },
    { id: "residential_reits", title: "Residential REITs", category: "subsector", parentId: "real_estate", aliases: [], assetDrivers: ["durationAssets", "housing_related"] },
    { id: "data_center_reits", title: "Data-center REITs", category: "subsector", parentId: "real_estate", aliases: [], assetDrivers: ["durationAssets", "growthEquities"] },

    { id: "small_caps", title: "Small caps", category: "macro_bucket", parentId: null, aliases: ["small-caps-cyclicals"], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "duration_sensitive_equities", title: "Duration-sensitive equities", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["durationAssets", "growthEquities", "liquidityOverlay"] },
    { id: "credit_sensitive_cyclicals", title: "Credit-sensitive cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["smallCaps", "creditFundingOverlay"] },
    { id: "hard_asset_equities", title: "Hard-asset equities", category: "macro_bucket", parentId: null, aliases: ["hard_asset_defensives"], assetDrivers: ["gold", "energy", "copper", "safeHavenRiskOffOverlay"] },
    { id: "real_asset_equities", title: "Real-asset equities", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["energy", "materials", "real_estate"] },
    { id: "quality_defensives", title: "Quality defensives", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "FiscalDominanceRisk", "localUnrestOverlay"] },
    { id: "deep_cyclicals", title: "Deep cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["industrials", "materials", "consumer_cyclicals"] },
    { id: "domestic_demand_cyclicals", title: "Domestic-demand cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["consumer_cyclicals", "smallCaps", "housing_related"] },
    { id: "global_trade_sensitives", title: "Global-trade sensitives", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["shipping", "logistics", "industrials"] },
    { id: "rate_sensitive_real_estate", title: "Rate-sensitive real estate", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["reits_rate_sensitive", "durationAssets"] },
    { id: "inflation_hedges", title: "Inflation hedges", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["gold", "energy", "materials", "inflationCostShockOverlay"] },
    { id: "safe_haven_equities", title: "Safe-haven equities", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["safeHavenRiskOffOverlay", "consumer_defensives", "regulated_utilities"] },
    { id: "value_cyclicals", title: "Value cyclicals", category: "macro_bucket", parentId: null, aliases: [], assetDrivers: ["energy", "materials", "industrials"] },
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
  "defense-energy-logistics": ["defense", "defense_contractors", "aerospace_defense", "shipping", "transportation_logistics", "energy"],
  "hard-asset-defensives": ["hard_asset_equities", "safe_haven_equities", "gold_miners"],
  "gold-hard-assets-safehaven": ["gold_miners", "precious_metals", "hard_asset_equities", "safe_haven_equities"],
  "financials-cyclicals-softened": ["financials", "banks", "regional_banks", "credit_sensitive_cyclicals"],
  "resource-equities": ["materials", "diversified_miners", "base_metals", "inflation_hedges"],
  "materials-resources": ["materials", "diversified_miners", "copper_miners", "precious_metals"],
  "growth-tech": ["tech", "semiconductors", "software", "long_duration_tech", "duration_sensitive_equities"],
  "long-duration-tech": ["long_duration_tech", "duration_sensitive_equities", "tech"],
  "small-caps-cyclicals": ["small_caps", "consumer_cyclicals", "credit_sensitive_cyclicals", "domestic_demand_cyclicals"],
  "broad-market-industrials": ["industrials", "capital_goods", "machinery", "value_cyclicals"],
  shipping_logistics: ["shipping", "logistics", "transportation_logistics", "global_trade_sensitives"],
};

const subsectorRoutingOverrides: Record<string, Omit<SubsectorMacroRouting, "subsectorId">> = {
  gold_miners: { explicitTargetIds: ["gold_miners", "precious_metals", "safe_haven_equities"], sectorFallbackId: "materials", macroBucketFallbackIds: ["hard_asset_equities", "inflation_hedges"], coverage: "explicit" },
  silver_miners: { explicitTargetIds: ["silver_miners", "precious_metals"], sectorFallbackId: "materials", macroBucketFallbackIds: ["hard_asset_equities"], coverage: "explicit" },
  copper_miners: { explicitTargetIds: ["copper_miners", "base_metals"], sectorFallbackId: "materials", macroBucketFallbackIds: ["deep_cyclicals", "global_trade_sensitives"], coverage: "explicit" },
  diversified_miners: { explicitTargetIds: ["diversified_miners", "base_metals", "precious_metals"], sectorFallbackId: "materials", macroBucketFallbackIds: ["hard_asset_equities", "deep_cyclicals"], coverage: "explicit" },
  steel: { explicitTargetIds: ["steel", "base_metals"], sectorFallbackId: "materials", macroBucketFallbackIds: ["deep_cyclicals"], coverage: "explicit" },
  chemicals: { explicitTargetIds: ["chemicals"], sectorFallbackId: "materials", macroBucketFallbackIds: ["deep_cyclicals"], coverage: "explicit" },
  fertilizers: { explicitTargetIds: ["fertilizers"], sectorFallbackId: "materials", macroBucketFallbackIds: ["inflation_hedges"], coverage: "explicit" },
  oil_gas_producers: { explicitTargetIds: ["oil_gas_producers", "integrated_energy"], sectorFallbackId: "energy", macroBucketFallbackIds: ["hard_asset_equities", "inflation_hedges"], coverage: "explicit" },
  integrated_energy: { explicitTargetIds: ["integrated_energy"], sectorFallbackId: "energy", macroBucketFallbackIds: ["hard_asset_equities"], coverage: "explicit" },
  oil_services: { explicitTargetIds: ["oil_services"], sectorFallbackId: "energy", macroBucketFallbackIds: ["value_cyclicals"], coverage: "explicit" },
  refiners: { explicitTargetIds: ["refiners"], sectorFallbackId: "energy", macroBucketFallbackIds: ["value_cyclicals"], coverage: "explicit" },
  uranium: { explicitTargetIds: ["uranium"], sectorFallbackId: "energy", macroBucketFallbackIds: ["real_asset_equities"], coverage: "explicit" },
  coal: { explicitTargetIds: ["coal"], sectorFallbackId: "energy", macroBucketFallbackIds: ["real_asset_equities"], coverage: "explicit" },
  banks: { explicitTargetIds: ["banks", "regional_banks"], sectorFallbackId: "financials", macroBucketFallbackIds: ["credit_sensitive_cyclicals"], coverage: "explicit" },
  insurers: { explicitTargetIds: ["insurers"], sectorFallbackId: "financials", macroBucketFallbackIds: ["quality_defensives"], coverage: "explicit" },
  asset_managers: { explicitTargetIds: ["asset_managers"], sectorFallbackId: "financials", macroBucketFallbackIds: ["deep_cyclicals"], coverage: "explicit" },
  brokers_exchanges: { explicitTargetIds: ["brokers_exchanges"], sectorFallbackId: "financials", macroBucketFallbackIds: ["deep_cyclicals"], coverage: "explicit" },
  software: { explicitTargetIds: ["software"], sectorFallbackId: "tech", macroBucketFallbackIds: ["duration_sensitive_equities"], coverage: "explicit" },
  semiconductors: { explicitTargetIds: ["semiconductors"], sectorFallbackId: "tech", macroBucketFallbackIds: ["duration_sensitive_equities", "deep_cyclicals"], coverage: "explicit" },
  hardware: { explicitTargetIds: ["hardware"], sectorFallbackId: "tech", macroBucketFallbackIds: ["duration_sensitive_equities"], coverage: "explicit" },
  long_duration_tech: { explicitTargetIds: ["long_duration_tech"], sectorFallbackId: "tech", macroBucketFallbackIds: ["duration_sensitive_equities"], coverage: "explicit" },
  consumer_cyclicals: { explicitTargetIds: ["consumer_cyclicals", "retail", "autos"], sectorFallbackId: "consumer_discretionary", macroBucketFallbackIds: ["domestic_demand_cyclicals"], coverage: "explicit" },
  consumer_defensives: { explicitTargetIds: ["consumer_defensives"], sectorFallbackId: "consumer_staples", macroBucketFallbackIds: ["quality_defensives", "safe_haven_equities"], coverage: "explicit" },
  household_products: { explicitTargetIds: ["household_products"], sectorFallbackId: "consumer_staples", macroBucketFallbackIds: ["quality_defensives"], coverage: "explicit" },
  food_beverage: { explicitTargetIds: ["food_beverage"], sectorFallbackId: "consumer_staples", macroBucketFallbackIds: ["quality_defensives"], coverage: "explicit" },
  regulated_utilities: { explicitTargetIds: ["regulated_utilities"], sectorFallbackId: "utilities", macroBucketFallbackIds: ["safe_haven_equities"], coverage: "explicit" },
  reits_rate_sensitive: { explicitTargetIds: ["reits_rate_sensitive"], sectorFallbackId: "real_estate", macroBucketFallbackIds: ["rate_sensitive_real_estate"], coverage: "explicit" },
  power_grid_utilities: { explicitTargetIds: ["power_grid_utilities"], sectorFallbackId: "utilities", macroBucketFallbackIds: ["real_asset_equities"], coverage: "explicit" },
  shipping: { explicitTargetIds: ["shipping", "ports_infrastructure"], sectorFallbackId: "transportation_logistics", macroBucketFallbackIds: ["global_trade_sensitives"], coverage: "explicit" },
  airlines: { explicitTargetIds: ["airlines"], sectorFallbackId: "transportation_logistics", macroBucketFallbackIds: ["global_trade_sensitives"], coverage: "explicit" },
  logistics: { explicitTargetIds: ["logistics"], sectorFallbackId: "transportation_logistics", macroBucketFallbackIds: ["global_trade_sensitives"], coverage: "explicit" },
  defense_contractors: { explicitTargetIds: ["defense_contractors", "aerospace_defense"], sectorFallbackId: "defense", macroBucketFallbackIds: ["quality_defensives"], coverage: "explicit" },
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

export function getSubsectorMacroRouting(sectorId: string, subsectorId: string): SubsectorMacroRouting {
  const override = subsectorRoutingOverrides[subsectorId];
  if (override) {
    return {
      subsectorId,
      ...override,
    };
  }
  return {
    subsectorId,
    explicitTargetIds: [subsectorId],
    sectorFallbackId: sectorId,
    macroBucketFallbackIds: [],
    coverage: "limited",
  };
}

export function getSectorDashboardUniverse(): DashboardSectorOption[] {
  const mainSectors = macroSectorUniverse.sectors
    .filter((item) => item.category === "main_sector")
    .sort((a, b) => a.title.localeCompare(b.title));

  return mainSectors.map((sector) => {
    const subsectors = macroSectorUniverse.sectors
      .filter((item) => item.category === "subsector" && item.parentId === sector.id)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((subsector) => {
        const routing = getSubsectorMacroRouting(sector.id, subsector.id);
        return {
          id: subsector.id,
          title: subsector.title,
          macroTargetIds: [...routing.explicitTargetIds, routing.sectorFallbackId, ...routing.macroBucketFallbackIds],
        };
      });

    return {
      id: sector.id,
      title: sector.title,
      subsectors,
    };
  }).filter((sector) => sector.subsectors.length > 0);
}
