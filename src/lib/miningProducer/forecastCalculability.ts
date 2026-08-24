import {
  assessProducerYearCalculability,
  type ProducerCalculabilityMetric,
  type ProducerYearCalculability,
} from './calculability.ts';
import { materializeProducerForecastForYear } from './forecast.ts';
import type { ProducerCaseMode, ProducerJsonV1, ReportedMetric } from './types.ts';

const CALCULABILITY_METRICS: readonly ProducerCalculabilityMetric[] = [
  'Au/AuEq',
  'Revenue',
  'EBITDA',
  'FCFF före growth',
  'FCFF efter growth',
  'EV',
];

function exactYearCompanyEvidence(
  producer: ProducerJsonV1,
  year: number,
  sourceMetrics: readonly ReportedMetric['metric'][],
): boolean {
  return (producer.reportedMetrics ?? []).some((item) =>
    sourceMetrics.includes(item.metric)
    && item.scope?.type === 'company'
    && item.period.kind === 'year'
    && item.period.year === year,
  );
}

function reportedEvidenceRule(metric: ProducerCalculabilityMetric): {
  sourceMetrics: readonly ReportedMetric['metric'][];
  note: string;
} | null {
  switch (metric) {
    case 'Au/AuEq':
      return {
        sourceMetrics: ['aueq', 'production'],
        note: 'Company-level reported production/AuEq exists for the selected year and may be displayed as reported evidence. It does not repair missing canonical project production, physical AuEq, or shared-deck Revenue.',
      };
    case 'Revenue':
      return {
        sourceMetrics: ['revenue'],
        note: 'Company-level reported Revenue exists for the selected year and may be displayed as source-deck evidence. It is not automatically repriced to SPOT/LT and does not repair missing canonical project revenue quantities.',
      };
    case 'EBITDA':
      return {
        sourceMetrics: ['ebitda'],
        note: 'Company-level reported EBITDA exists for the selected year and may be displayed as reported evidence. It does not replace canonical Producer EBITDA or missing cost-bucket coverage.',
      };
    default:
      return null;
  }
}

function applyReportedEvidenceFallbacks(
  assessed: ProducerYearCalculability,
  producer: ProducerJsonV1,
  year: number,
): ProducerYearCalculability {
  return {
    ...assessed,
    metrics: assessed.metrics.map((metric) => {
      if (metric.state !== 'blocked') return metric;
      const rule = reportedEvidenceRule(metric.metric);
      if (!rule || !exactYearCompanyEvidence(producer, year, rule.sourceMetrics)) return metric;
      return {
        ...metric,
        state: 'reported_only',
        notes: [...metric.notes, rule.note],
      };
    }),
  };
}

function blockedCoverageAfterEvaluationError(
  year: number,
  caseMode: ProducerCaseMode,
  error: unknown,
): ProducerYearCalculability {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = `CALCULABILITY_EVALUATION_FAILED: ${message}`;
  return {
    year,
    caseMode,
    metrics: CALCULABILITY_METRICS.map((metric) => ({
      metric,
      state: 'blocked',
      missing: [diagnostic],
      notes: [
        'The editor kept the JSON editable instead of failing the React render. Fix the underlying calculability edge case before treating this metric as canonical.',
      ],
    })),
  };
}

export function assessProducerFiveYearCoverageWithForecast(
  producer: ProducerJsonV1,
  startYear: number,
  caseMode: ProducerCaseMode = 'BASE',
): ProducerYearCalculability[] {
  return Array.from({ length: 5 }, (_, offset) => {
    const year = startYear + offset;
    try {
      const materialized = materializeProducerForecastForYear(producer, year);
      const assessed = applyReportedEvidenceFallbacks(
        assessProducerYearCalculability(materialized.producer, year, caseMode),
        materialized.producer,
        year,
      );
      const forecastNotes = materialized.appliedRuleIds.length > 0
        ? [`Forecast assumptions materialized for ${year}: ${materialized.appliedRuleIds.join(', ')}. These are scenario/derived inputs, not source facts.`]
        : [];
      const diagnosticNotes = materialized.diagnostics.filter((item) =>
        item.startsWith('FORECAST_RULE_CONFLICT') || item.startsWith('FORECAST_RULE_INVALID'),
      );
      return {
        ...assessed,
        metrics: assessed.metrics.map((metric) => ({
          ...metric,
          notes: [...metric.notes, ...forecastNotes, ...diagnosticNotes],
        })),
      };
    } catch (error) {
      return blockedCoverageAfterEvaluationError(year, caseMode, error);
    }
  });
}
