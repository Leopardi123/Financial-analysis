import type { CompanyProjectSummary } from '../db/companyProjects.ts';

export const RUNTIME_ECONOMICS_FRESHNESS_BUCKET_MS = 10 * 60 * 1000;

function fallbackHash(input: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}${input.length.toString(16)}`;
}

export async function hashRuntimeInput(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(input);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function activeProjectStamp(projects: CompanyProjectSummary[]): Array<Record<string, unknown>> {
  return projects
    .filter((project) => project.disabled !== true)
    .map((project) => ({
      projectId: project.project_id,
      jsonVersion: project.json_version,
      updatedAtUtc: project.updated_at_utc,
    }))
    .sort((left, right) => String(left.projectId).localeCompare(String(right.projectId)));
}

function runtimeRevision(): string {
  return String(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local');
}

function freshnessBucket(nowMs: number): number {
  return Math.floor(nowMs / RUNTIME_ECONOMICS_FRESHNESS_BUCKET_MS);
}

export async function buildTierRuntimeFingerprint(args: {
  symbol: string;
  projects: CompanyProjectSummary[];
  nowMs?: number;
}): Promise<string> {
  const nowMs = args.nowMs ?? Date.now();
  return hashRuntimeInput(JSON.stringify({
    schema: 'tier-pre-revenue-runtime-cache-v1',
    revision: runtimeRevision(),
    symbol: args.symbol.trim().toUpperCase(),
    projects: activeProjectStamp(args.projects),
    spotFreshnessBucket10m: freshnessBucket(nowMs),
    cycleAsOfUtcDate: new Date(nowMs).toISOString().slice(0, 10),
  }));
}

export async function buildCorporateRuntimeFingerprint(args: {
  body: unknown;
  projects: CompanyProjectSummary[];
  nowMs?: number;
}): Promise<string> {
  const nowMs = args.nowMs ?? Date.now();
  return hashRuntimeInput(JSON.stringify({
    schema: 'corporate-snapshot-runtime-cache-v1',
    revision: runtimeRevision(),
    request: args.body,
    projects: activeProjectStamp(args.projects),
    marketAndFxFreshnessBucket10m: freshnessBucket(nowMs),
  }));
}
