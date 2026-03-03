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

export async function postCorporateSnapshot(payload: SnapshotRequest, opts: { refresh?: boolean } = {}): Promise<SnapshotApiResponse> {
  const query = new URLSearchParams();
  if (opts.refresh) query.set('refresh', '1');
  if (typeof window !== 'undefined') {
    const debugFromQuery = new URLSearchParams(window.location.search).get('debug') === '1';
    const debugFromStorage = window.localStorage.getItem('admin.debugParamEnabled') === '1';
    if (debugFromQuery || debugFromStorage) {
      query.set('debug', '1');
    }
  }
  const queryString = query.toString();
  const response = await fetch(`/api/snapshot/corporate${queryString ? `?${queryString}` : ''}`, {
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
