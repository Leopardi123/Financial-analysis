import { useEffect, useMemo, useRef, useState } from 'react';
import type { SnapshotRequest } from '../lib/api/validateSnapshotRequest.ts';
import type { SnapshotApiResponse } from '../lib/client/snapshotClient.ts';
import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';
import { CORPORATE_METAL_PRICE_MULTIPLIERS, createCorporateMetalPriceScenarioRequest, type CorporateMetalPriceMultiplier } from '../lib/corporate/sensitivity.ts';

export type CorporateSensitivityRun = { multiplier: CorporateMetalPriceMultiplier; response: SnapshotApiResponse; durationMs: number };
export type CorporateSensitivityPerformance = { totalMs: number; averageMs: number; slowestMs: number; cacheHit: boolean };
const cache = new Map<string, CorporateSensitivityRun[]>();

export function stableCorporateRequestHash(request: SnapshotRequest | null): string | null {
  if (!request) return null;
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])) : value;
  return JSON.stringify(normalize(request));
}

/** Reuses the already resolved base-snapshot FX so seven price scenarios do not
 * make seven identical FX-provider requests. Metal prices remain scenario-owned. */
export function pinCorporateSensitivityFx(request: SnapshotRequest | null, resolvedBaseFx: number | null): SnapshotRequest | null {
  if (!request || typeof resolvedBaseFx !== 'number' || !Number.isFinite(resolvedBaseFx) || resolvedBaseFx <= 0) return request;
  return {
    ...request,
    fx_USD_to_TargetCurrency: resolvedBaseFx,
    fx: {
      source: 'manual',
      anchor: request.fx.anchor,
      scenario: request.fx.scenario,
      manual_fx_USD_to_TargetCurrency: resolvedBaseFx,
    },
  };
}

export function useCorporateMetalPriceSensitivity(request: SnapshotRequest | null, enabled: boolean, resolvedBaseFx: number | null = null) {
  const scenarioBaseRequest = useMemo(() => pinCorporateSensitivityFx(request, resolvedBaseFx), [request, resolvedBaseFx]);
  const hash = useMemo(() => stableCorporateRequestHash(scenarioBaseRequest), [scenarioBaseRequest]);
  const generation = useRef(0);
  const [runs, setRuns] = useState<CorporateSensitivityRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [performanceMetrics, setPerformance] = useState<CorporateSensitivityPerformance | null>(null);

  useEffect(() => {
    generation.current += 1;
    setRuns([]); setError(null); setPerformance(null); setLoading(false);
  }, [hash]);

  useEffect(() => {
    if (!enabled || !scenarioBaseRequest || !hash) return;
    const currentGeneration = ++generation.current;
    const cached = cache.get(hash);
    if (cached) {
      setRuns(cached); setLoading(false);
      setPerformance({ totalMs: 0, averageMs: 0, slowestMs: 0, cacheHit: true });
      return;
    }
    setLoading(true); setError(null);
    const started = performance.now();
    void Promise.all(CORPORATE_METAL_PRICE_MULTIPLIERS.map(async (multiplier) => {
      const scenarioStarted = performance.now();
      const response = await postCorporateSnapshot(createCorporateMetalPriceScenarioRequest(scenarioBaseRequest, multiplier));
      return { multiplier, response, durationMs: performance.now() - scenarioStarted };
    })).then((nextRuns) => {
      if (generation.current !== currentGeneration) return;
      cache.set(hash, nextRuns);
      const totalMs = performance.now() - started;
      setRuns(nextRuns);
      setPerformance({ totalMs, averageMs: totalMs / nextRuns.length, slowestMs: Math.max(...nextRuns.map((run) => run.durationMs)), cacheHit: false });
      const failed = nextRuns.filter((run) => !run.response.ok);
      setError(failed.length === nextRuns.length ? 'Inget scenario kunde beräknas.' : null);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (generation.current !== currentGeneration) return;
      setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false);
    });
  }, [enabled, hash, scenarioBaseRequest]);
  return { runs, loading, error, performance: performanceMetrics, inputHash: hash, fxPinned: scenarioBaseRequest?.fx.source === 'manual' && resolvedBaseFx !== null };
}

export function clearCorporateSensitivityCacheForTests(): void { cache.clear(); }
