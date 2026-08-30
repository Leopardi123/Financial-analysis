import type {
  ManagementEvidence,
  OptionalityEvidence,
} from '../investmentScore/types.ts';

export type InvestmentScoreEvidenceRecord = {
  symbol: string;
  project_id: string;
  management: ManagementEvidence | null;
  optionality: OptionalityEvidence | null;
  fatalFlaw: boolean | null;
  fatalFlawNote: string | null;
  companyUpdatedAtUtc: string | null;
  projectUpdatedAtUtc: string | null;
};

type EvidenceResponse = {
  ok: boolean;
  error?: string;
  symbol?: string;
  project_id?: string;
  company?: {
    management?: ManagementEvidence;
    updated_at_utc?: string;
  } | null;
  project?: {
    optionality?: OptionalityEvidence;
    fatal_flaw?: boolean | null;
    fatal_flaw_note?: string | null;
    updated_at_utc?: string;
  } | null;
};

function normalizeResponse(body: EvidenceResponse, symbol: string, projectId: string): InvestmentScoreEvidenceRecord {
  return {
    symbol: body.symbol ?? symbol,
    project_id: body.project_id ?? projectId,
    management: body.company?.management ?? null,
    optionality: body.project?.optionality ?? null,
    fatalFlaw: body.project?.fatal_flaw ?? null,
    fatalFlawNote: body.project?.fatal_flaw_note ?? null,
    companyUpdatedAtUtc: body.company?.updated_at_utc ?? null,
    projectUpdatedAtUtc: body.project?.updated_at_utc ?? null,
  };
}

export async function getInvestmentScoreEvidence(symbol: string, projectId: string): Promise<InvestmentScoreEvidenceRecord> {
  const query = new URLSearchParams({ symbol, project_id: projectId });
  const response = await fetch(`/api/investment-score-evidence?${query.toString()}`);
  const body = await response.json() as EvidenceResponse;
  if (!response.ok || !body.ok) throw new Error(body.error ?? 'Failed to load Investment Score evidence');
  return normalizeResponse(body, symbol, projectId);
}

export async function saveInvestmentScoreEvidence(input: {
  symbol: string;
  project_id: string;
  management: ManagementEvidence;
  optionality: OptionalityEvidence;
  fatalFlaw: boolean | null;
  fatalFlawNote?: string | null;
}): Promise<InvestmentScoreEvidenceRecord> {
  const response = await fetch('/api/investment-score-evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json() as EvidenceResponse;
  if (!response.ok || !body.ok) throw new Error(body.error ?? 'Failed to save Investment Score evidence');
  return normalizeResponse(body, input.symbol, input.project_id);
}
