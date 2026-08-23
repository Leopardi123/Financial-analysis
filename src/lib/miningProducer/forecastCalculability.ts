import {
  assessProducerYearCalculability,
  type ProducerYearCalculability,
} from './calculability.ts';
import { materializeProducerForecastForYear } from './forecast.ts';
import type { ProducerCaseMode, ProducerJsonV1 } from './types.ts';

export function assessProducerFiveYearCoverageWithForecast(
  producer: ProducerJsonV1,
  startYear: number,
  caseMode: ProducerCaseMode = 'BASE',
): ProducerYearCalculability[] {
  return Array.from({ length: 5 }, (_, offset) => {
    const year = startYear + offset;
    const materialized = materializeProducerForecastForYear(producer, year);
    const assessed = assessProducerYearCalculability(materialized.producer, year, caseMode);
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
  });
}
