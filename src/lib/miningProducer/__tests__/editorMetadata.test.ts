import { decorateProducerJsonForEditor } from '../editorTemplate.ts';
import { stripGeneratedProducerEditorMetadata } from '../editorMetadata.ts';
import type { ProducerJsonV1 } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const producer = {
  version: 'producer_json_v1',
  _description: 'stale root description',
  company: {
    id: 'b2gold',
    name: 'B2Gold Corp.',
    reportingCurrency: 'USD',
    _description_id: 'stale generated id help',
    primarySecurity: {
      ticker: 'BTO.TO',
      exchange: 'TSX',
      quoteCurrency: 'CAD',
      securityType: 'common',
      _description: 'stale generated security help',
    },
  },
  valuation: {
    valuationDateUtc: '2026-08-23',
    _description_balanceSheet: 'stale generated EV help',
    balanceSheet: {
      asOfDate: '2026-06-30',
      usability: 'stale_after_material_event',
      usabilityReason: 'Post-quarter debt draw.',
      cashAndEquivalents: {
        value: 286_576_000,
        currency: 'USD',
        provenance: { sourceId: 'q2', estimateClass: 'actual' },
      },
      totalDebt: {
        value: 456_086_000,
        currency: 'USD',
        provenance: { sourceId: 'q2', estimateClass: 'derived' },
      },
      _producer_note_stream: 'Preserve this company-specific note.',
    },
  },
  projects: [{
    id: 'fekola',
    name: 'Fekola',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    _producer_note: 'Preserve real project note.',
    ownership: [],
    production: [],
  }],
  corporateCosts: [],
  reportedMetrics: [],
  sources: [{ id: 'q2', sourceType: 'financial_statement', publisher: 'Issuer', title: 'Q2' }],
} as unknown as ProducerJsonV1;

const stripped = stripGeneratedProducerEditorMetadata(producer) as ProducerJsonV1 & Record<string, unknown>;
assert(!('_description' in stripped), 'root generated description is stripped');
assert((stripped.company as unknown as Record<string, unknown>)._description_id === undefined, 'nested generated company documentation is stripped');
assert(((stripped.valuation.balanceSheet as unknown as Record<string, unknown>)._producer_note_stream) === 'Preserve this company-specific note.', 'producer-specific balance-sheet note is preserved');
assert(((stripped.projects[0] as unknown as Record<string, unknown>)._producer_note) === 'Preserve real project note.', 'producer-specific project note is preserved');

const decorated = decorateProducerJsonForEditor(producer, 'BTO.TO') as unknown as Record<string, unknown>;
const company = decorated.company as Record<string, unknown>;
const security = company.primarySecurity as Record<string, unknown>;
const valuation = decorated.valuation as Record<string, unknown>;
assert(company.id === 'b2gold', 'real company id survives redecoration');
assert(security.exchange === 'TSX' && security.quoteCurrency === 'CAD', 'real security data survives redecoration');
assert(valuation._description_balanceSheet !== 'stale generated EV help', 'stale nested generated metadata cannot override current template metadata');
assert(Array.isArray(decorated.projects) && (decorated.projects as unknown[]).length === 1, 'real evidence arrays survive redecoration');

console.log('Mining Producer editor metadata tests passed');
