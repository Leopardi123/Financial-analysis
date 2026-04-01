import { execute, query } from "../../../../api/_db.js";
import { tables } from "../../../../api/_migrate.js";
import { macroSectorUniverse } from "../../../lib/macro/macroSectorUniverse.js";

type NamedRow = { id: number; name: string };

const canonicalMainSectors = macroSectorUniverse.sectors.filter((node) => node.category === "main_sector");
const canonicalSubsectors = macroSectorUniverse.sectors.filter((node) => node.category === "subsector");

const canonicalSectorIds = new Set(canonicalMainSectors.map((node) => node.id));
const canonicalSubsectorById = new Map(canonicalSubsectors.map((node) => [node.id, node]));
const subsectorsBySectorId = new Map<string, string[]>();

const sectorLookup = new Map<string, string>();
const subsectorLookup = new Map<string, string>();

function normalizeTaxonomyKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function registerLookup(map: Map<string, string>, key: string, canonicalId: string) {
  const normalizedKey = normalizeTaxonomyKey(key);
  if (!normalizedKey || map.has(normalizedKey)) return;
  map.set(normalizedKey, canonicalId);
}

for (const sector of canonicalMainSectors) {
  registerLookup(sectorLookup, sector.id, sector.id);
  registerLookup(sectorLookup, sector.title, sector.id);
  sector.aliases.forEach((alias) => registerLookup(sectorLookup, alias, sector.id));
}

for (const subsector of canonicalSubsectors) {
  registerLookup(subsectorLookup, subsector.id, subsector.id);
  registerLookup(subsectorLookup, subsector.title, subsector.id);
  subsector.aliases.forEach((alias) => registerLookup(subsectorLookup, alias, subsector.id));

  const parentId = subsector.parentId ?? "";
  if (!parentId) continue;
  const list = subsectorsBySectorId.get(parentId) ?? [];
  list.push(subsector.id);
  subsectorsBySectorId.set(parentId, list);
}

function parseNamedRow(row: unknown): NamedRow | null {
  const candidate = row as { id?: unknown; name?: unknown } | null | undefined;
  const id = Number(candidate?.id);
  const name = typeof candidate?.name === "string" ? candidate.name.trim() : "";
  if (!Number.isFinite(id) || !name) return null;
  return { id, name };
}

function resolveFromLookup(rawValue: string, map: Map<string, string>) {
  return map.get(normalizeTaxonomyKey(rawValue)) ?? null;
}

function resolveCanonicalSectorId(rawSector: string) {
  const resolved = resolveFromLookup(rawSector, sectorLookup);
  if (!resolved || !canonicalSectorIds.has(resolved)) {
    throw new Error(`Unknown canonical sector id: ${rawSector}`);
  }
  return resolved;
}

function resolveCanonicalSubsectorId(rawSubsector: string) {
  const resolved = resolveFromLookup(rawSubsector, subsectorLookup);
  if (!resolved || !canonicalSubsectorById.has(resolved)) {
    throw new Error(`Unknown canonical subsector id: ${rawSubsector}`);
  }
  return resolved;
}

export function resolveCanonicalSelection(rawSector: string, rawSubsector?: string | null) {
  const sectorId = resolveCanonicalSectorId(rawSector);
  if (!rawSubsector) {
    return { sectorId, subsectorId: null as string | null };
  }

  const subsectorId = resolveCanonicalSubsectorId(rawSubsector);
  const subsector = canonicalSubsectorById.get(subsectorId);
  if (!subsector || subsector.parentId !== sectorId) {
    throw new Error(`Subsector '${rawSubsector}' is not part of sector '${rawSector}'`);
  }

  return { sectorId, subsectorId };
}

export async function ensureCanonicalSectorRow(canonicalSectorId: string) {
  const now = new Date().toISOString();
  await execute(`INSERT OR IGNORE INTO ${tables.sectors} (name, created_at) VALUES (?, ?)`, [canonicalSectorId, now]);
  const rows = await query(`SELECT id, name FROM ${tables.sectors} WHERE name = ?`, [canonicalSectorId]);
  const parsed = parseNamedRow(rows[0]);
  if (!parsed) {
    throw new Error(`Failed to resolve canonical sector row for '${canonicalSectorId}'`);
  }
  return parsed;
}

export async function ensureCanonicalSubsectorRow(sectorRowId: number, canonicalSubsectorId: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO ${tables.subsectors} (sector_id, name, created_at) VALUES (?, ?, ?)`,
    [sectorRowId, canonicalSubsectorId, now]
  );
  const rows = await query(`SELECT id, name FROM ${tables.subsectors} WHERE sector_id = ? AND name = ?`, [
    sectorRowId,
    canonicalSubsectorId,
  ]);
  const parsed = parseNamedRow(rows[0]);
  if (!parsed) {
    throw new Error(`Failed to resolve canonical subsector row for '${canonicalSubsectorId}'`);
  }
  return parsed;
}

export async function ensureCanonicalSelectionRows(rawSector: string, rawSubsector?: string | null) {
  const resolved = resolveCanonicalSelection(rawSector, rawSubsector ?? null);
  const sectorRow = await ensureCanonicalSectorRow(resolved.sectorId);
  const subsectorRow = resolved.subsectorId
    ? await ensureCanonicalSubsectorRow(sectorRow.id, resolved.subsectorId)
    : null;

  return {
    sector: sectorRow,
    subsector: subsectorRow,
    canonical: resolved,
  };
}

export function listCanonicalTaxonomy() {
  return canonicalMainSectors
    .map((sector) => ({
      id: sector.id,
      title: sector.title,
      subsectors: (subsectorsBySectorId.get(sector.id) ?? []).map((subsectorId) => {
        const node = canonicalSubsectorById.get(subsectorId)!;
        return { id: node.id, title: node.title };
      }),
    }))
    .filter((sector) => sector.subsectors.length > 0);
}
