# Sector canonical model (pre-commodity-exposure)

Date: 2026-04-01

## Canonical source of truth

`src/lib/macro/macroSectorUniverse.ts` is now the canonical registry for Sector Dashboard sector/subsector identifiers.

- Canonical IDs (`main_sector` and `subsector`) are defined there.
- Sector API routes must resolve request `sector`/`subsector` against this registry.
- Unknown or mismatched IDs are rejected with explicit 400 errors.

This stops runtime creation of free-text sectors/subsectors.

## What DB does after this change

DB tables (`sectors`, `subsectors`) are now storage/index rows for canonical IDs, not taxonomy authorities.

- Sector routes use a resolver layer (`src/server/routes/sector/canonicalTaxonomy.ts`) to:
  1. resolve incoming IDs to canonical IDs,
  2. validate parent-child relation (`subsector.parentId === sector.id`),
  3. ensure DB rows exist for those canonical IDs.
- DB no longer accepts arbitrary taxonomy strings from API requests.

## What `company_sector_map` does

`company_sector_map` remains a mapping table from company to sector/subsector DB rows.

After this change:
- Source of truth for taxonomy semantics = canonical IDs in `macroSectorUniverse`.
- Source of truth for company membership = `company_sector_map` row links (`company_id`, `sector_id`, `subsector_id`) that point to DB rows created from canonical IDs.
- `company_sector_map.category` remains non-canonical metadata only and must not be used for stage/exposure logic.

## What FMP sector is (and is not)

FMP `profile.sector` / `profile.industry` (used in screening and single-stock views) is provider taxonomy.

- It is useful display/filter metadata in those flows.
- It is not the canonical Sector Dashboard taxonomy.
- It is not a replacement for `company_sector_map` in sector dashboard metrics.

## Why commodity exposure should be layered later

Commodity exposure should be implemented on top of this canonical sector/subsector model to avoid introducing another parallel taxonomy.

This consolidation gives a stable base:
- one canonical ID registry,
- DB as persistence for canonical links,
- explicit rejection of taxonomy drift at API boundaries.
