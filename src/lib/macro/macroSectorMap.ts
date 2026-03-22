import type { MacroAssetMap, MacroAssetMapItem, MacroAssetBucket } from "./macroAssetMap";
import { getCanonicalSectorTitle, resolveCanonicalSectorTargets } from "./macroSectorUniverse.ts";

export type MacroSectorMapItem = {
  id: string;
  title: string;
  strength: "strong" | "moderate" | "weak";
  rationale: string;
  sourceAssets: Array<{ id: string; title: string }>;
};

export type MacroSectorMap = {
  favored: MacroSectorMapItem[];
  neutral: MacroSectorMapItem[];
  underPressure: MacroSectorMapItem[];
  metadata: {
    derivedFromAssetMap: true;
  };
};

type SectorCandidate = {
  id: string;
  title: string;
  rationale: string;
  bucketMode?: "align" | "inverse" | "neutral";
};

const ASSET_TO_SECTORS: Record<string, SectorCandidate[]> = {
  gold: [
    { id: "gold-miners", title: "Gold miners", rationale: "Gold is macro-favored, supporting gold-linked equities." },
    { id: "silver_miners", title: "Silver miners", rationale: "Gold-led stress episodes can spill into silver-linked miners." },
    { id: "precious_metals", title: "Precious metals", rationale: "Gold stress/safe-haven demand supports precious-metals exposure." },
    { id: "hard-asset-defensives", title: "Hard-asset defensives", rationale: "Hard-asset preference supports defensive real-asset equity exposure." },
    { id: "materials-resources", title: "Materials and resources", rationale: "Gold strength often spills over into broader materials and miners." },
  ],
  energy: [
    { id: "energy-sector", title: "Energy", rationale: "Energy asset signal maps directly to energy equities." },
    { id: "oil_gas_producers", title: "Oil and gas producers", rationale: "Macro energy support reinforces upstream producer exposure." },
    { id: "integrated_energy", title: "Integrated energy", rationale: "Integrated majors absorb broad energy-cycle swings with diversified balance sheets." },
    { id: "oil_services", title: "Oil services", rationale: "Sustained energy pressure supports capex/service parts of the value chain." },
    { id: "refiners", title: "Refiners", rationale: "Refiners are energy-linked but differ from upstream producers via margin-spread dynamics." },
    { id: "coal", title: "Coal", rationale: "Acute supply stress can rotate toward legacy fuel alternatives." },
    { id: "uranium", title: "Uranium", rationale: "Energy security shocks can support nuclear fuel/value-chain exposure." },
    { id: "shipping", title: "Shipping", rationale: "Energy and route dislocations can lift tanker and shipping volatility.", bucketMode: "align" },
    { id: "airlines", title: "Airlines", rationale: "Higher energy cost pressure can weigh on airline margins.", bucketMode: "inverse" },
    { id: "value_cyclicals", title: "Value cyclicals", rationale: "Energy-linked cyclicality usually aligns with value cyclicals." },
  ],
  copper: [
    { id: "materials-resources", title: "Materials", rationale: "Commodity/real-asset support benefits materials and resource producers." },
    { id: "resource-equities", title: "Resource equities", rationale: "Commodity beta from copper supports resource-heavy equities." },
    { id: "copper_miners", title: "Copper miners", rationale: "Copper demand proxies map directly to copper-focused miners." },
    { id: "steel", title: "Steel", rationale: "Base-metal and industrial-cycle acceleration often supports steel-linked equities." },
    { id: "chemicals", title: "Chemicals", rationale: "Industrial demand impulse can broaden into chemical producers." },
    { id: "fertilizers", title: "Fertilizers", rationale: "Input-cost and commodity regime shifts can spill into fertilizer pricing power." },
    { id: "industrial_cyclicals", title: "Industrial cyclicals", rationale: "Copper cyclicality often co-moves with industrial cyclicals." },
  ],
  durationAssets: [
    { id: "long-duration-tech", title: "Long-duration tech", rationale: "Duration sensitivity channels into long-duration growth/tech valuation pressure." },
    { id: "duration_sensitive_equities", title: "Duration-sensitive equities", rationale: "Rate-duration moves directly affect duration-sensitive equity cohorts." },
    { id: "reits_rate_sensitive", title: "Rate-sensitive REITs", rationale: "Duration shifts also spill into rate-sensitive real estate equities." },
    { id: "regulated_utilities", title: "Regulated utilities", rationale: "Defensive utilities are typically rate-sensitive and valuation-duration aware." },
  ],
  smallCaps: [
    { id: "small-caps-cyclicals", title: "Small caps & funding-sensitive cyclicals", rationale: "Small-cap stress translates to funding-sensitive cyclical pressure." },
    { id: "credit_sensitive_cyclicals", title: "Credit-sensitive cyclicals", rationale: "Funding stress maps into credit-sensitive cyclicals." },
    { id: "consumer_cyclicals", title: "Consumer cyclicals", rationale: "Small-cap conditions tend to impact cyclical consumer exposures." },
    { id: "banks", title: "Banks", rationale: "Credit stress has first-order impact on funding and lending-sensitive banks.", bucketMode: "inverse" },
  ],
  broadEquities: [
    { id: "broad-market-industrials", title: "Industrials / broad market", rationale: "Broad-equity neutrality suggests benchmark cyclicals remain balanced absent strong overlay change." },
    { id: "financials", title: "Financials", rationale: "Broad equity tone can carry into diversified financial exposure." },
    { id: "insurers", title: "Insurers", rationale: "Insurers often carry more defensive earnings mix than core banks." },
    { id: "asset_managers", title: "Asset managers", rationale: "Asset managers are broad-equity beta via fee AUM sensitivity." },
    { id: "brokers_exchanges", title: "Brokers and exchanges", rationale: "Market activity and sentiment regime can lift brokers/exchanges cyclicality." },
  ],
  growthEquities: [
    { id: "growth-tech", title: "Growth tech", rationale: "Growth-equity signal maps into duration-sensitive growth sectors." },
    { id: "semiconductors", title: "Semiconductors", rationale: "Semiconductors are both liquidity-sensitive and cycle-sensitive relative to software." },
    { id: "software", title: "Software", rationale: "Software is growth-sensitive but typically less inventory-cycle sensitive than semis." },
    { id: "hardware", title: "Hardware", rationale: "Hardware demand follows capex/device replacement cycles." },
  ],
  industrials: [
    { id: "industrials", title: "Industrials", rationale: "Direct industrial signal maps to industrial sector stance." },
    { id: "capital_goods", title: "Capital goods", rationale: "Industrial activity maps into capital-goods sensitivity." },
    { id: "industrial_cyclicals", title: "Industrial cyclicals", rationale: "Macro industrial tone maps into industrial cyclicals." },
    { id: "transportation_logistics", title: "Transportation and logistics", rationale: "Industrial backdrop supports transportation and logistics demand." },
    { id: "logistics", title: "Logistics", rationale: "Industrial throughput and trade volumes feed logistics demand." },
    { id: "shipping", title: "Shipping", rationale: "Industrial and trade impulses can lift shipping utilization and pricing." },
  ],
};

function bucketForAsset(item: MacroAssetMapItem): MacroAssetBucket {
  if (item.bucket === "favored" || item.bucket === "neutral" || item.bucket === "underPressure") return item.bucket;
  return "neutral";
}

function normalizeMacroSectorBucket(items: MacroSectorMapItem[]): MacroSectorMapItem[] {
  const merged = new Map<string, MacroSectorMapItem & { rationaleParts: string[] }>();

  items.forEach((item) => {
    const targets = resolveCanonicalSectorTargets(item.id);
    targets.forEach((canonicalId) => {
      const canonicalTitle = getCanonicalSectorTitle(canonicalId);
      if (!canonicalTitle) return;
      const existing = merged.get(canonicalId);
      if (!existing) {
        merged.set(canonicalId, {
          id: canonicalId,
          title: canonicalTitle,
          strength: item.strength,
          rationale: item.rationale,
          rationaleParts: [item.rationale],
          sourceAssets: [...item.sourceAssets],
        });
        return;
      }

      if (!existing.rationaleParts.includes(item.rationale)) {
        existing.rationaleParts.push(item.rationale);
      }

      item.sourceAssets.forEach((asset) => {
        if (!existing.sourceAssets.some((existingAsset) => existingAsset.id === asset.id)) {
          existing.sourceAssets.push(asset);
        }
      });
    });
  });

  return [...merged.values()].map(({ rationaleParts, ...item }) => ({
    ...item,
    rationale: rationaleParts.join(" | "),
  }));
}

function classifyStrength(item: MacroSectorMapItem, bucket: MacroAssetBucket): "strong" | "moderate" | "weak" {
  const rationale = item.rationale.toLowerCase();
  const hasOverlayBoost =
    rationale.includes("safe-haven")
    || rationale.includes("overlay")
    || rationale.includes("credit/funding")
    || rationale.includes("unrest risk");
  const multiAssetSupport = item.sourceAssets.length >= 2;
  const primaryBucketAlignment = bucket === "favored" || bucket === "underPressure";

  if (multiAssetSupport || hasOverlayBoost || primaryBucketAlignment) return "strong";
  if (bucket === "neutral" || item.sourceAssets.length === 1) return "moderate";
  return "weak";
}

function applyBucketMode(baseBucket: MacroAssetBucket, mode: SectorCandidate["bucketMode"]): MacroAssetBucket {
  if (mode === "neutral") return "neutral";
  if (mode === "inverse") {
    if (baseBucket === "favored") return "underPressure";
    if (baseBucket === "underPressure") return "favored";
    return "neutral";
  }
  return baseBucket;
}

export function buildMacroSectorMap(assetMap: MacroAssetMap): MacroSectorMap {
  const grouped: Record<MacroAssetBucket, MacroSectorMapItem[]> = {
    favored: [],
    neutral: [],
    underPressure: [],
  };

  const index = new Map<string, { bucket: MacroAssetBucket; item: MacroSectorMapItem }>();

  const upsert = (bucket: MacroAssetBucket, candidate: SectorCandidate, source: MacroAssetMapItem) => {
    const existing = index.get(candidate.id);
    const sourceRef = { id: source.id, title: source.title };
    if (existing) {
      if (!existing.item.sourceAssets.some((asset) => asset.id === source.id)) {
        existing.item.sourceAssets.push(sourceRef);
      }
      return;
    }

    const item: MacroSectorMapItem = {
      id: candidate.id,
      title: candidate.title,
      strength: "weak",
      rationale: candidate.rationale,
      sourceAssets: [sourceRef],
    };
    grouped[bucket].push(item);
    index.set(candidate.id, { bucket, item });
  };

  const allAssets = [...assetMap.favored, ...assetMap.neutral, ...assetMap.underPressure];

  allAssets.forEach((asset) => {
    const mapped = ASSET_TO_SECTORS[asset.id] ?? [];
    mapped.forEach((candidate) => upsert(applyBucketMode(bucketForAsset(asset), candidate.bucketMode), candidate, asset));

    const overlayIds = asset.drivers.overlays.map((overlay) => overlay.id);

    if (overlayIds.includes("creditFundingOverlay")) {
      upsert(
        "neutral",
        {
          id: "financials-cyclicals-softened",
          title: "Financials and cyclicals (pressure softened)",
          rationale: "Supportive credit/funding conditions soften macro pressure on financing-sensitive cyclicals.",
        },
        asset
      );
    }

    if (overlayIds.includes("safeHavenRiskOffOverlay")) {
      upsert(
        "favored",
        {
          id: "gold-hard-assets-safehaven",
          title: "Gold miners / defensive hard assets",
          rationale: "Safe-haven tightening supports defensive hard-asset equities.",
        },
        asset
      );
    }

    if (overlayIds.includes("localUnrestOverlay")) {
      upsert(
        "favored",
        {
          id: "defense-energy-logistics",
          title: "Defense energy shipping logistics",
          rationale: "Elevated unrest risk can support defense demand and strategic energy/logistics exposure.",
        },
        asset
      );
    }
  });

  const favored = normalizeMacroSectorBucket(grouped.favored).map((item) => ({
    ...item,
    strength: classifyStrength(item, "favored"),
  }));
  const neutral = normalizeMacroSectorBucket(grouped.neutral).map((item) => ({
    ...item,
    strength: classifyStrength(item, "neutral"),
  }));
  const underPressure = normalizeMacroSectorBucket(grouped.underPressure).map((item) => ({
    ...item,
    strength: classifyStrength(item, "underPressure"),
  }));

  return {
    favored,
    neutral,
    underPressure,
    metadata: {
      derivedFromAssetMap: true,
    },
  };
}
