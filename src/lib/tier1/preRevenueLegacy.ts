// Temporary compatibility copy of the pre-2026-09-02 Tier pre-revenue engine.
//
// IMPORTANT: active callers should import ./preRevenue.ts, not this file.
// preRevenue.ts deliberately disables Cost Quartile as a Tier input while
// preserving the old implementation here for diagnostics/research and a
// possible future, evidence-backed reactivation.
//
// Source snapshot: blob 7e33e861801812abccd3c6888db298b6dc21e42f.

export * from './preRevenueLegacySnapshot.ts';
