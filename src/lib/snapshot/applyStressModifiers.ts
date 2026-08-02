import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';

export type StressOptions = {
  initialCapex2x?: boolean;
  spotHalf?: boolean;
  tpPlus2?: boolean;
  sustainingCapex15?: boolean;
  opex25?: boolean;
  opex15?: boolean;
  recoveryMinus10?: boolean;
  fxMinus10?: boolean;
  royalty50?: boolean;
  taxPlus5pp?: boolean;
  closure2x?: boolean;
};

export type ApplyStressModifiersResult = {
  stressedInput: SnapshotRequest;
  edgeCases: string[];
};

function scaleSeries(series: unknown, factor: number): Array<number | null> | null {
  if (!Array.isArray(series)) return null;
  return series.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value * factor : null));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function applyStressModifiers(baseInputs: SnapshotRequest, stressOptions: StressOptions): ApplyStressModifiersResult {
  const stressedInput = deepClone(baseInputs);
  const edgeCases: string[] = [];

  if (stressOptions.fxMinus10) {
    // Directionality: fx_USD_to_TargetCurrency * 0.9 means 10% fewer target-currency units per USD.
    if (typeof stressedInput.fx_USD_to_TargetCurrency === 'number' && Number.isFinite(stressedInput.fx_USD_to_TargetCurrency)) {
      stressedInput.fx_USD_to_TargetCurrency *= 0.9;
    }
    if (typeof stressedInput.fx.manual_fx_USD_to_TargetCurrency === 'number' && Number.isFinite(stressedInput.fx.manual_fx_USD_to_TargetCurrency)) {
      stressedInput.fx.manual_fx_USD_to_TargetCurrency *= 0.9;
    }
  }

  if (stressOptions.tpPlus2) {
    const delay = Number.isInteger(stressedInput.scenario.delayPeriods) ? (stressedInput.scenario.delayPeriods as number) : 0;
    stressedInput.scenario.delayPeriods = delay + 2;
  }

  for (const project of stressedInput.projects) {
    const raw = project.rawJson as Record<string, unknown>;
    const time = (raw.time ?? null) as Record<string, unknown> | null;
    const series = (raw.series ?? null) as Record<string, unknown> | null;
    const economics = (raw.economics ?? null) as Record<string, unknown> | null;

    const masterN = typeof time?.masterN === 'number' && Number.isInteger(time.masterN) ? time.masterN : null;
    const tp = typeof time?.productionStartPeriod === 'number' && Number.isInteger(time.productionStartPeriod) ? time.productionStartPeriod : null;

    if (stressOptions.tpPlus2) {
      if (masterN === null || tp === null) {
        edgeCases.push(`[${project.projectId}] TP +2 requires integer time.masterN and time.productionStartPeriod.`);
      } else if (tp + 2 > masterN) {
        edgeCases.push(`[${project.projectId}] TP +2 out of bounds: tp=${tp}, masterN=${masterN}.`);
      }
    }

    if (stressOptions.initialCapex2x) {
      if (!series || tp === null) {
        edgeCases.push(`[${project.projectId}] Initial CAPEX x2 requires series and productionStartPeriod.`);
      } else {
        const capex = scaleSeries(series.capexUSD, 1);
        if (!capex) {
          edgeCases.push(`[${project.projectId}] Initial CAPEX x2 requires series.capexUSD.`);
        } else {
          for (let t = 0; t < Math.max(0, tp); t += 1) {
            if (typeof capex[t] !== 'number' || !Number.isFinite(capex[t])) {
              edgeCases.push(`[${project.projectId}] Initial CAPEX x2 requires finite capexUSD for all t < tp.`);
              break;
            }
            capex[t] = (capex[t] as number) * 2;
          }
          series.capexUSD = capex;
        }
      }
    }

    if (stressOptions.sustainingCapex15) {
      if (!series) {
        edgeCases.push(`[${project.projectId}] Sustaining CAPEX x1.5 requires series.`);
      } else {
        const sustaining = scaleSeries(series.sustainingCapexUSD, 1.5);
        if (!sustaining) edgeCases.push(`[${project.projectId}] Missing series.sustainingCapexUSD for sustaining stress.`);
        else series.sustainingCapexUSD = sustaining;
      }
    }

    if (stressOptions.opex25 || stressOptions.opex15) {
      if (!series) {
        edgeCases.push(`[${project.projectId}] Operating costs +25% requires series.`);
      } else {
        const operating = scaleSeries(series.operatingCostsUSD, stressOptions.opex25 ? 1.25 : 1.15);
        if (!operating) edgeCases.push(`[${project.projectId}] Missing series.operatingCostsUSD for opex stress.`);
        else series.operatingCostsUSD = operating;
      }
    }

    if (stressOptions.closure2x) {
      if (!series) {
        edgeCases.push(`[${project.projectId}] Reclamation x2 requires series.`);
      } else {
        const reclamation = scaleSeries(series.reclamationUSD, 2);
        if (!reclamation) edgeCases.push(`[${project.projectId}] Missing series.reclamationUSD for closure stress.`);
        else series.reclamationUSD = reclamation;
      }
    }

    if (stressOptions.taxPlus5pp) {
      if (!economics || typeof economics.taxRate !== 'number' || !Number.isFinite(economics.taxRate)) {
        edgeCases.push(`[${project.projectId}] Tax +5pp requires economics.taxRate.`);
      } else {
        economics.taxRate = Math.max(0, Math.min(1, economics.taxRate + 0.05));
      }
    }

    if (stressOptions.recoveryMinus10) {
      const operations = (raw.operations ?? null) as Record<string, unknown> | null;
      const recoveryMap = (operations?.recoveryPctByMetal ?? null) as Record<string, unknown> | null;
      if (!recoveryMap || typeof recoveryMap !== 'object') {
        edgeCases.push(`[${project.projectId}] Recovery -10% requires operations.recoveryPctByMetal.`);
      } else {
        for (const [metal, values] of Object.entries(recoveryMap)) {
          if (!Array.isArray(values)) {
            edgeCases.push(`[${project.projectId}] Recovery -10% invalid series for metal=${metal}.`);
            continue;
          }
          recoveryMap[metal] = values.map((value) => (typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(1, value * 0.9))
            : null));
        }
      }
    }

    if (stressOptions.royalty50) {
      if (series) {
        const royaltiesSeries = scaleSeries(series.royaltiesUSD, 1.5);
        if (royaltiesSeries) series.royaltiesUSD = royaltiesSeries;
      }
      const economicsBreakdown = (raw.economicsBreakdown ?? null) as Record<string, unknown> | null;
      const royaltiesDetail = Array.isArray(economicsBreakdown?.royaltiesDetail) ? economicsBreakdown?.royaltiesDetail as Array<Record<string, unknown>> : null;
      if (royaltiesDetail) {
        for (const item of royaltiesDetail) {
          if (typeof item.rate === 'number' && Number.isFinite(item.rate)) {
            item.rate = item.rate * 1.5;
          }
        }
      }
    }
  }

  return { stressedInput, edgeCases };
}
