import {
  getCompanyInvestmentScoreEvidence,
  getProjectInvestmentScoreEvidence,
  upsertCompanyInvestmentScoreEvidence,
  upsertProjectInvestmentScoreEvidence,
} from '../../../lib/db/investmentScoreEvidence.js';
import type {
  ManagementEvidence,
  ManagementRating,
  OptionalityEvidence,
  OptionalityRating,
} from '../../../lib/investmentScore/types.js';

const MANAGEMENT_RATINGS = new Set<ManagementRating>(['unassessed', 'weak', 'adequate', 'strong', 'exceptional']);
const OPTIONALITY_RATINGS = new Set<OptionalityRating>(['unassessed', 'none', 'some', 'strong', 'exceptional']);

function normalizedKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizedProjectId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('note/assessmentDate must be strings when provided');
  return value.trim() || undefined;
}

function parseAssessment<T extends string>(
  value: unknown,
  ratings: Set<T>,
  field: string,
): { rating: T; assessmentDate?: string; note?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} is required`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.rating !== 'string' || !ratings.has(raw.rating as T)) throw new Error(`${field}.rating is invalid`);
  const assessmentDate = optionalText(raw.assessmentDate);
  if (assessmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate)) {
    throw new Error(`${field}.assessmentDate must be YYYY-MM-DD`);
  }
  const note = optionalText(raw.note);
  return {
    rating: raw.rating as T,
    ...(assessmentDate ? { assessmentDate } : {}),
    ...(note ? { note } : {}),
  };
}

function parseManagement(value: unknown): ManagementEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('management is required');
  const raw = value as Record<string, unknown>;
  return {
    executionTrackRecord: parseAssessment(raw.executionTrackRecord, MANAGEMENT_RATINGS, 'management.executionTrackRecord'),
    capitalAllocation: parseAssessment(raw.capitalAllocation, MANAGEMENT_RATINGS, 'management.capitalAllocation'),
    deliveryCredibility: parseAssessment(raw.deliveryCredibility, MANAGEMENT_RATINGS, 'management.deliveryCredibility'),
    technicalTeamFit: parseAssessment(raw.technicalTeamFit, MANAGEMENT_RATINGS, 'management.technicalTeamFit'),
  };
}

function parseOptionality(value: unknown): OptionalityEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('optionality is required');
  const raw = value as Record<string, unknown>;
  return {
    resourceExpansion: parseAssessment(raw.resourceExpansion, OPTIONALITY_RATINGS, 'optionality.resourceExpansion'),
    minePlanConversion: parseAssessment(raw.minePlanConversion, OPTIONALITY_RATINGS, 'optionality.minePlanConversion'),
    expansionDebottlenecking: parseAssessment(raw.expansionDebottlenecking, OPTIONALITY_RATINGS, 'optionality.expansionDebottlenecking'),
    districtStrategic: parseAssessment(raw.districtStrategic, OPTIONALITY_RATINGS, 'optionality.districtStrategic'),
  };
}

function parseFatalFlaw(value: unknown): boolean | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  throw new Error('fatalFlaw must be true, false, or null');
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method === 'GET') {
      const symbol = normalizedKey(req.query?.symbol);
      const projectId = normalizedProjectId(req.query?.project_id);
      if (!symbol || !projectId) {
        res.status(400).json({ ok: false, error: 'symbol and project_id are required' });
        return;
      }
      const [company, project] = await Promise.all([
        getCompanyInvestmentScoreEvidence(symbol),
        getProjectInvestmentScoreEvidence(symbol, projectId),
      ]);
      res.status(200).json({ ok: true, symbol, project_id: projectId, company, project });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const symbol = normalizedKey(body?.symbol);
    const projectId = normalizedProjectId(body?.project_id);
    if (!symbol || !projectId) {
      res.status(400).json({ ok: false, error: 'symbol and project_id are required' });
      return;
    }

    const management = parseManagement(body?.management);
    const optionality = parseOptionality(body?.optionality);
    const fatalFlaw = parseFatalFlaw(body?.fatalFlaw);
    const fatalFlawNote = optionalText(body?.fatalFlawNote) ?? null;

    const [company, project] = await Promise.all([
      upsertCompanyInvestmentScoreEvidence({ symbol, management }),
      upsertProjectInvestmentScoreEvidence({
        symbol,
        project_id: projectId,
        optionality,
        fatal_flaw: fatalFlaw,
        fatal_flaw_note: fatalFlawNote,
      }),
    ]);

    res.status(200).json({ ok: true, symbol, project_id: projectId, company, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidation = /required|invalid|must be/.test(message);
    res.status(isValidation ? 400 : 500).json({ ok: false, error: message });
  }
}
