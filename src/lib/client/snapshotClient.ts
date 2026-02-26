import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';
import type { CorporateSnapshot } from '../corporate/snapshot/types.ts';

type SnapshotDiagnostics = {
  errors?: string[];
  warnings?: string[];
  meta?: Record<string, unknown>;
};

export type SnapshotApiResponse = {
  ok: boolean;
  snapshot?: CorporateSnapshot;
  diagnostics?: SnapshotDiagnostics;
};

export async function postCorporateSnapshot(payload: SnapshotRequest): Promise<SnapshotApiResponse> {
  const response = await fetch('/api/snapshot/corporate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as SnapshotApiResponse;

  if (!response.ok) {
    return {
      ok: false,
      diagnostics: body.diagnostics,
    };
  }

  return body;
}
