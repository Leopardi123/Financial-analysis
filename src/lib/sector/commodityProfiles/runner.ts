import type {
  CommodityId,
  CommodityPhase,
  CommodityProfile,
  CommodityProfileInput,
  CommodityProfileOutput,
  CommodityStatus,
} from "./types";

function inferStatus(phase: CommodityPhase, dataCompleteness: number): CommodityStatus {
  if (phase === "Unknown" || dataCompleteness < 0.35) return "insufficient";
  if (dataCompleteness < 0.75) return "partial";
  return "ok";
}

export function runCommodityProfile(profile: CommodityProfile, input: CommodityProfileInput): CommodityProfileOutput {
  const output = profile.compute(input);
  return {
    ...output,
    status: inferStatus(output.phase, output.dataCompleteness),
  };
}

export function resolveCommodityProfile(
  commodity: CommodityId,
  profiles: readonly CommodityProfile[],
): CommodityProfile | null {
  return profiles.find((profile) => profile.commodity === commodity) ?? null;
}
