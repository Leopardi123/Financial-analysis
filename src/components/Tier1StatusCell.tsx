import { useEffect, useMemo, useState } from 'react';
import type { Tier1PreRevenueAssessment } from '../lib/tier1/preRevenue.ts';

const assessmentPromiseCache = new Map<string, Promise<Tier1PreRevenueAssessment | null>>();

function fetchAssessment(symbol: string): Promise<Tier1PreRevenueAssessment | null> {
  const key = symbol.trim().toUpperCase();
  const cached = assessmentPromiseCache.get(key);
  if (cached) return cached;

  const promise = fetch(`/api/tier1/pre-revenue?symbol=${encodeURIComponent(key)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as { ok?: boolean; assessment?: Tier1PreRevenueAssessment };
      return payload.ok && payload.assessment ? payload.assessment : null;
    })
    .catch(() => null);
  assessmentPromiseCache.set(key, promise);
  return promise;
}

function gateLabel(status: 'PASS' | 'FAIL' | 'NOT_VERIFIED'): string {
  if (status === 'PASS') return '✓';
  if (status === 'FAIL') return '✕';
  return '?';
}

export default function Tier1StatusCell({ symbol }: { symbol: string }) {
  const [assessment, setAssessment] = useState<Tier1PreRevenueAssessment | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void fetchAssessment(symbol).then((next) => {
      if (cancelled) return;
      setAssessment(next);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [symbol]);

  const title = useMemo(() => {
    if (!assessment) return 'Tier-1-bedömning kunde inte hämtas.';
    const lines = [
      `Primär metall: ${assessment.primaryMetal ?? 'Ej verifierad'}`,
      `LOM ${gateLabel(assessment.gates.lom.status)}: ${assessment.gates.lom.reason}`,
      `Skala ${gateLabel(assessment.gates.scale.status)}: ${assessment.gates.scale.reason}`,
      `Kostnad ${gateLabel(assessment.gates.cost.status)}: ${assessment.gates.cost.reason}`,
      `Cykel ${gateLabel(assessment.gates.cycle.status)}: ${assessment.gates.cycle.reason}`,
      `Kapitalavkastning ${gateLabel(assessment.gates.capitalReturns.status)}: ${assessment.gates.capitalReturns.reason}`,
    ];
    if (assessment.diagnostics.length > 0) lines.push(`Diagnostik: ${assessment.diagnostics.join(' | ')}`);
    return lines.join('\n');
  }, [assessment]);

  if (!loaded) return <span title="Tier-1-bedömning beräknas…">…</span>;
  if (!assessment) return <span title={title}>Ej verifierad</span>;
  if (assessment.status === 'TIER_1') return <span title={title}>Tier 1</span>;
  if (assessment.status === 'NOT_TIER_1') return <span title={title}>Ej Tier 1</span>;
  return <span title={title}>Ej verifierad</span>;
}
