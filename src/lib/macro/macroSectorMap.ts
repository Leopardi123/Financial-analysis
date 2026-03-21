import type { MacroAssetMap, MacroAssetMapItem, MacroAssetBucket } from "./macroAssetMap";

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
};

type CanonicalSectorId =
  | "energy"
  | "materials"
  | "gold_miners"
  | "defense"
  | "industrials"
  | "financials"
  | "tech"
  | "utilities"
  | "consumer"
  | "small_caps"
  | "shipping_logistics";

const CANONICAL_SECTOR_TITLE: Record<CanonicalSectorId, string> = {
  energy: "Energy",
  materials: "Materials",
  gold_miners: "Gold miners",
  defense: "Defense",
  industrials: "Industrials",
  financials: "Financials",
  tech: "Tech",
  utilities: "Utilities",
  consumer: "Consumer",
  small_caps: "Small caps",
  shipping_logistics: "Shipping / logistics",
};

const ASSET_TO_SECTORS: Record<string, SectorCandidate[]> = {
  gold: [
    { id: "gold-miners", title: "Gold miners", rationale: "Gold is macro-favored, supporting gold-linked equities." },
    { id: "hard-asset-defensives", title: "Hard-asset defensives", rationale: "Hard-asset preference supports defensive real-asset equity exposure." },
  ],
  energy: [
    { id: "energy-sector", title: "Energy", rationale: "Energy asset signal maps directly to energy equities." },
  ],
  copper: [
    { id: "materials-resources", title: "Materials", rationale: "Commodity/real-asset support benefits materials and resource producers." },
    { id: "resource-equities", title: "Resource equities", rationale: "Commodity beta from copper supports resource-heavy equities." },
  ],
  durationAssets: [
    { id: "long-duration-tech", title: "Long-duration tech", rationale: "Duration sensitivity channels into long-duration growth/tech valuation pressure." },
  ],
  smallCaps: [
    { id: "small-caps-cyclicals", title: "Small caps & funding-sensitive cyclicals", rationale: "Small-cap stress translates to funding-sensitive cyclical pressure." },
  ],
  broadEquities: [
    { id: "broad-market-industrials", title: "Industrials / broad market", rationale: "Broad-equity neutrality suggests benchmark cyclicals remain balanced absent strong overlay change." },
  ],
  growthEquities: [
    { id: "growth-tech", title: "Growth tech", rationale: "Growth-equity signal maps into duration-sensitive growth sectors." },
  ],
  industrials: [
    { id: "industrials", title: "Industrials", rationale: "Direct industrial signal maps to industrial sector stance." },
  ],
};

function bucketForAsset(item: MacroAssetMapItem): MacroAssetBucket {
  if (item.bucket === "favored" || item.bucket === "neutral" || item.bucket === "underPressure") return item.bucket;
  return "neutral";
}

function canonicalTargets(candidateId: string): CanonicalSectorId[] {
  if (candidateId === "gold-miners") return ["gold_miners"];
  if (candidateId === "hard-asset-defensives") return ["gold_miners"];
  if (candidateId === "gold-hard-assets-safehaven") return ["gold_miners"];
  if (candidateId === "energy-sector") return ["energy"];
  if (candidateId === "materials-resources") return ["materials"];
  if (candidateId === "resource-equities") return ["materials"];
  if (candidateId === "defense-energy-logistics") return ["defense", "energy"];
  if (candidateId === "long-duration-tech") return ["tech"];
  if (candidateId === "growth-tech") return ["tech"];
  if (candidateId === "small-caps-cyclicals") return ["small_caps"];
  if (candidateId === "broad-market-industrials") return ["industrials"];
  if (candidateId === "industrials") return ["industrials"];
  if (candidateId === "financials-cyclicals-softened") return ["financials"];
  return [];
}

function normalizeMacroSectorBucket(items: MacroSectorMapItem[]): MacroSectorMapItem[] {
  const merged = new Map<CanonicalSectorId, MacroSectorMapItem & { rationaleParts: string[] }>();

  items.forEach((item) => {
    const targets = canonicalTargets(item.id);
    targets.forEach((canonicalId) => {
      const existing = merged.get(canonicalId);
      if (!existing) {
        merged.set(canonicalId, {
          id: canonicalId,
          title: CANONICAL_SECTOR_TITLE[canonicalId],
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
    mapped.forEach((candidate) => upsert(bucketForAsset(asset), candidate, asset));

    const overlayIds = asset.drivers.overlays.map((overlay) => overlay.id);

    if (overlayIds.includes("creditFundingOverlay")) {
      upsert(
        "neutral",
        {
          id: "financials-cyclicals-softened",
          title: "Financials / cyclicals (pressure softened)",
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
          title: "Defense / energy / shipping-logistics",
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
