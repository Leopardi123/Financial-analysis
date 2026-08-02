import { useEffect, useMemo, useRef, useState } from 'react';
import type { SnapshotRequest } from '../lib/api/validateSnapshotRequest.ts';
import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';
import { postCorporateSnapshot, type SnapshotApiResponse } from '../lib/client/snapshotClient.ts';
import { pinCorporateSensitivityFx, pinCorporateSensitivitySpots, stableCorporateRequestHash, type CorporateResolvedSpotAudit } from './useCorporateMetalPriceSensitivity.ts';
import type { SurvivabilityScenarioId } from '../components/project/corporateSurvivabilityModel.ts';

export type SurvivabilityRun = { scenarioId: SurvivabilityScenarioId; response: SnapshotApiResponse; durationMs: number; reusedBase: boolean };
const cache = new Map<string, SurvivabilityRun[]>();

export function createSurvivabilityScenarioRequest(base: SnapshotRequest, scenarioId: Exclude<SurvivabilityScenarioId, 'base'>): SnapshotRequest {
  const request = structuredClone(base);
  if (scenarioId === 'spot20') request.scenario = { mode: 'spot', spotPriceMultiplier: 0.8 };
  if (scenarioId === 'spot30') request.scenario = { mode: 'spot', spotPriceMultiplier: 0.7 };
  if (scenarioId === 'spot50') request.scenario = { mode: 'spot', spotPriceMultiplier: 0.5 };
  if (scenarioId === 'opex25') request.stressOptions = { opex25: true };
  if (scenarioId === 'sustaining50') request.stressOptions = { sustainingCapex15: true };
  if (scenarioId === 'combined') { request.scenario = { mode: 'spot', spotPriceMultiplier: 0.7 }; request.stressOptions = { opex15: true }; }
  return request;
}

export function useCorporateSurvivability(args: {
  request: SnapshotRequest | null; baseSnapshot: CorporateSnapshot | null; baseDiagnostics?: string[];
  enabled: boolean; resolvedFx: number | null; resolvedSpotAudit: CorporateResolvedSpotAudit | null;
}) {
  const pinned = useMemo(() => pinCorporateSensitivitySpots(pinCorporateSensitivityFx(args.request, args.resolvedFx), args.resolvedSpotAudit), [args.request, args.resolvedFx, args.resolvedSpotAudit]);
  const hash = useMemo(() => stableCorporateRequestHash(pinned), [pinned]);
  const generation = useRef(0); const [runs, setRuns] = useState<SurvivabilityRun[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  useEffect(() => { generation.current += 1; setRuns([]); setError(null); setDurationMs(null); setLoading(false); }, [hash, args.baseSnapshot]);
  useEffect(() => {
    if (!args.enabled || !pinned || !hash || !args.baseSnapshot) return;
    const key = `${hash}:survivability-v1`; const cached = cache.get(key);
    const baseRun: SurvivabilityRun = { scenarioId: 'base', response: { ok: true, snapshot: args.baseSnapshot, diagnostics: { warnings: args.baseDiagnostics ?? [] } }, durationMs: 0, reusedBase: true };
    if (cached) { setRuns([baseRun, ...cached]); setDurationMs(0); return; }
    const current = ++generation.current; const started = performance.now(); setLoading(true);
    const ids: Array<Exclude<SurvivabilityScenarioId, 'base'>> = ['spot20', 'spot30', 'spot50', 'opex25', 'sustaining50', 'combined'];
    void Promise.all(ids.map(async (scenarioId) => { const start = performance.now(); const response = await postCorporateSnapshot(createSurvivabilityScenarioRequest(pinned, scenarioId)); return { scenarioId, response, durationMs: performance.now() - start, reusedBase: false }; }))
      .then((next) => { if (generation.current !== current) return; cache.set(key, next); setRuns([baseRun, ...next]); setDurationMs(performance.now() - started); setLoading(false); if (next.every((run) => !run.response.ok)) setError('Inget robusthetsscenario kunde beräknas.'); })
      .catch((reason: unknown) => { if (generation.current !== current) return; setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); });
  }, [args.baseDiagnostics, args.baseSnapshot, args.enabled, hash, pinned]);
  return { runs, loading, error, durationMs, inputHash: hash };
}

export function clearCorporateSurvivabilityCacheForTests() { cache.clear(); }
