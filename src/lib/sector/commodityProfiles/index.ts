import { runCommodityProfile, resolveCommodityProfile } from "./runner.js";
import { goldCommodityProfile } from "./profiles/goldProfile.js";
import type { CommodityId, CommodityProfileInput, CommodityProfileOutput } from "./types.js";

const COMMODITY_PROFILES = [goldCommodityProfile] as const;

export { COMMODITY_PROFILES };
export * from "./types.js";

export function evaluateCommodityProfile(commodity: CommodityId, input: CommodityProfileInput): CommodityProfileOutput | null {
  const profile = resolveCommodityProfile(commodity, COMMODITY_PROFILES);
  if (!profile) return null;
  return runCommodityProfile(profile, input);
}
