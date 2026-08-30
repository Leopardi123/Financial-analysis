import { useEffect, useMemo, useState } from 'react';
import type { CorporateSnapshot } from '../../lib/corporate/snapshot/types.ts';
import { getInvestmentScoreEvidence } from '../../lib/client/investmentScoreEvidenceClient.ts';
import { adaptCanonicalPreRevenueToInvestmentScore } from '../../lib/investmentScore/canonicalPreRevenueAdapter.ts';
import { computeInvestmentScore } from '../../lib/investmentScore/engine.ts';
import { computeProvisionalRawScoreV0 } from '../../lib/investmentScore/rawScore.ts';
import type { InvestmentScoreResult } from '../../lib/investmentScore/types.ts';
import type { Tier1PreRevenueAssessment } from '../../lib/tier1/preRevenue.ts';
import '../../styles/investment-score-cell.css';

type SnapshotWithValuationSeries = CorporateSnapshot & Record<string, unknown> & {
  corporateValuationTimeSeries?: { rows?: Array<{ year?: number; evEbitda6xPerShare?: number | null }> };
};

type TierResponse = { ok?: boolean; assessment?: Tier1PreRevenueAssessment };

type Props = {
  symbol: string;
  projectIds: string[];
  snapshot: SnapshotWithValuationSeries | null;
  priceCurrentTargetCurrency: number | null;
  manualExtraShares: number;
};

const LABELS: Record<number, string> = {
  1: 'Generational',
  2: 'Exceptional Buy',
  3: 'Strong Buy',
  4: 'Buy',
  5: 'Hold',
  6: 'Neutral',
  7: 'Unattractive',
  8: 'Poor',
  9: 'Avoid',
  10: 'Broken / Extreme',
};

export default function InvestmentScoreCell({
  symbol,
  projectIds,
  snapshot,
  priceCurrentTargetCurrency,
  manualExtraShares,
}: Props) {
  const [result, setResult] = useState<InvestmentScoreResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setResult(null);
      setDiagnostics([]);
      try {
        if (projectIds.length !== 1) {
          if (alive) setDiagnostics(['Ej verifierad: Investment Score v0 saknar ännu kanonisk optionality/fatal-flaw-aggregation för flerprojektbolag.']);
          return;
        }

        const projectId = projectIds[0];
        const [tierRes, evidence] = await Promise.all([
          fetch(`/api/tier1-pre-revenue?symbol=${encodeURIComponent(symbol)}`),
          getInvestmentScoreEvidence(symbol, projectId),
        ]);
        const tierBody = await tierRes.json() as TierResponse;
        const tierAssessment = tierRes.ok && tierBody.ok === true ? tierBody.assessment ?? null : null;

        const adapted = adaptCanonicalPreRevenueToInvestmentScore({
          snapshot,
          tierAssessment,
          priceCurrentTargetCurrency,
          manualExtraShares,
          management: evidence.management,
          optionality: evidence.optionality,
          fatalFlaw: evidence.fatalFlaw,
        });
        const raw = computeProvisionalRawScoreV0(adapted.inputs);
        const scored = computeInvestmentScore({ ...adapted.inputs, rawScore: raw.rawScore });
        if (alive) {
          setResult(scored);
          setDiagnostics([...adapted.diagnostics, ...raw.diagnostics, ...scored.diagnostics]);
        }
      } catch (error) {
        if (alive) setDiagnostics([`Ej verifierad: ${error instanceof Error ? error.message : String(error)}`]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [symbol, projectIds.join('|'), snapshot, priceCurrentTargetCurrency, manualExtraShares]);

  const title = useMemo(() => diagnostics.join('\n'), [diagnostics]);
  if (loading) return <span className="investment-score-cell investment-score-cell--pending">…</span>;
  if (!result || result.investmentScore === null) {
    return <span className="investment-score-cell investment-score-cell--unverified" title={title}>Ej verifierad</span>;
  }

  const score = result.investmentScore;
  return (
    <span className={`investment-score-cell investment-score-cell--score-${score}`} title={title}>
      <strong>{score}</strong>
      <small>{LABELS[score] ?? ''}{result.verified ? '' : ' · prelim.'}</small>
    </span>
  );
}
