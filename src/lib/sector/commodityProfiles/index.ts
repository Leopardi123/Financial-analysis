import { runCommodityProfile, resolveCommodityProfile } from "./runner";
import { goldCommodityProfile } from "./profiles/goldProfile";
import type { CommodityId, CommodityProfileInput, CommodityProfileOutput } from "./types";

const COMMODITY_PROFILES = [goldCommodityProfile] as const;

export { COMMODITY_PROFILES };
export * from "./types";

export function evaluateCommodityProfile(commodity: CommodityId, input: CommodityProfileInput): CommodityProfileOutput | null {
  const profile = resolveCommodityProfile(commodity, COMMODITY_PROFILES);
  if (!profile) return null;
  return runCommodityProfile(profile, input);
}
