export type CompanyCorporateProducerRecord = {
  symbol: string;
  json_version: string;
  company_id: string;
  company_name: string;
  raw_json: Record<string, unknown>;
  created_at_utc: string;
  updated_at_utc: string;
};

type ApiResponse = {
  ok: boolean;
  record?: CompanyCorporateProducerRecord | null;
  symbol?: string;
  updated_at_utc?: string;
  error?: string;
  diagnostics?: string[];
};

async function parse<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function getCompanyCorporateProducer(symbol: string): Promise<CompanyCorporateProducerRecord | null> {
  const params = new URLSearchParams({ action: 'corporate-get', symbol });
  const response = await fetch(`/api/producer/peers?${params.toString()}`);
  const body = await parse<ApiResponse>(response);
  if (!response.ok || !body.ok) throw new Error(body.error ?? 'Failed to load corporate producer JSON');
  return body.record ?? null;
}

export async function upsertCompanyCorporateProducer(input: {
  symbol: string;
  raw_json: Record<string, unknown>;
}): Promise<{ symbol: string; updated_at_utc: string }> {
  const params = new URLSearchParams({ action: 'corporate-upsert' });
  const response = await fetch(`/api/producer/peers?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await parse<ApiResponse>(response);
  if (!response.ok || !body.ok || !body.symbol || !body.updated_at_utc) {
    throw new Error(body.error ?? 'Failed to save corporate producer JSON');
  }
  return { symbol: body.symbol, updated_at_utc: body.updated_at_utc };
}

export async function deleteCompanyCorporateProducer(symbol: string): Promise<void> {
  const params = new URLSearchParams({ action: 'corporate-delete' });
  const response = await fetch(`/api/producer/peers?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  const body = await parse<ApiResponse>(response);
  if (!response.ok || !body.ok) throw new Error(body.error ?? 'Failed to delete corporate producer JSON');
}
