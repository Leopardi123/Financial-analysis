import { buildProducerJsonV1Template } from './template.ts';
import type { ProducerJsonV1 } from './types.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Adds the canonical editor-only _description/_choices/_example/_reference metadata
 * to an existing Producer JSON while preserving every real company input.
 *
 * Arrays containing real evidence (projects, costs, metrics, sources, decks) are
 * never merged with examples; the existing arrays win unchanged. Examples live
 * only in underscore-prefixed metadata fields and are ignored by the engine.
 */
export function decorateProducerJsonForEditor(
  producer: ProducerJsonV1,
  symbol: string,
): ProducerJsonV1 & Record<string, unknown> {
  const base = buildProducerJsonV1Template(
    symbol,
    producer.valuation?.valuationDateUtc ?? new Date().toISOString().slice(0, 10),
  ) as unknown as Record<string, unknown>;
  const current = producer as unknown as Record<string, unknown>;

  const baseCompany = asRecord(base.company);
  const currentCompany = asRecord(current.company);
  const baseSecurity = asRecord(baseCompany.primarySecurity);
  const currentSecurity = asRecord(currentCompany.primarySecurity);
  const baseValuation = asRecord(base.valuation);
  const currentValuation = asRecord(current.valuation);

  return {
    ...base,
    ...current,
    company: {
      ...baseCompany,
      ...currentCompany,
      primarySecurity: {
        ...baseSecurity,
        ...currentSecurity,
      },
    },
    valuation: {
      ...baseValuation,
      ...currentValuation,
    },
    // Explicitly preserve evidence arrays as-is. The template keeps its examples
    // in underscore-prefixed sibling fields, never inside these arrays.
    reportedPriceDecks: Array.isArray(current.reportedPriceDecks) ? current.reportedPriceDecks : [],
    projects: Array.isArray(current.projects) ? current.projects : [],
    corporateCosts: Array.isArray(current.corporateCosts) ? current.corporateCosts : [],
    reportedMetrics: Array.isArray(current.reportedMetrics) ? current.reportedMetrics : [],
    sources: Array.isArray(current.sources) ? current.sources : [],
  } as unknown as ProducerJsonV1 & Record<string, unknown>;
}
