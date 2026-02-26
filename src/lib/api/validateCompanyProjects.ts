import { parseProjectJsonV1WithContext } from '../project/jsonv1/parse.ts';

const JSON_VERSION = 'project_json_v1';

export type CompanyProjectUpsertInput = {
  symbol: string;
  project_id: string;
  project_name: string | null;
  raw_json: Record<string, unknown>;
  json_version: typeof JSON_VERSION;
};

type ValidationOk<T> = { ok: true; value: T };
type ValidationErr = { ok: false; error: string; details?: string[] };

function isValidSymbol(symbol: string): boolean {
  if (!symbol || symbol.length > 32) {
    return false;
  }
  if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
    return false;
  }
  return /[A-Za-z0-9]/.test(symbol);
}

function isValidProjectId(project_id: string): boolean {
  return Boolean(project_id) && project_id.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(project_id);
}

export function validateCompanyProjectKey(input: unknown): ValidationOk<{ symbol: string; project_id: string }> | ValidationErr {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const body = input as Record<string, unknown>;
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const project_id = typeof body.project_id === 'string' ? body.project_id.trim() : '';

  if (!isValidSymbol(symbol)) {
    return { ok: false, error: 'symbol must be a non-empty string (max 32) containing only letters, numbers, dot, or dash' };
  }
  if (!isValidProjectId(project_id)) {
    return { ok: false, error: 'project_id must be a non-empty string (max 64) containing only letters, numbers, underscore, dash, or dot' };
  }

  return { ok: true, value: { symbol, project_id } };
}

export function validateCompanyProjectUpsert(input: unknown): ValidationOk<CompanyProjectUpsertInput> | ValidationErr {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const body = input as Record<string, unknown>;
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const project_id = typeof body.project_id === 'string' ? body.project_id.trim() : '';
  const project_name = typeof body.project_name === 'string' ? body.project_name.trim() : null;
  const raw_json = body.raw_json;

  if (!isValidSymbol(symbol)) {
    return { ok: false, error: 'symbol must be a non-empty string (max 32) containing only letters, numbers, dot, or dash' };
  }

  if (!isValidProjectId(project_id)) {
    return { ok: false, error: 'project_id must be a non-empty string (max 64) containing only letters, numbers, underscore, dash, or dot' };
  }

  if (typeof raw_json !== 'object' || raw_json === null || Array.isArray(raw_json)) {
    return { ok: false, error: 'raw_json must be an object' };
  }

  const version = (raw_json as Record<string, unknown>).version;
  if (version !== JSON_VERSION) {
    return { ok: false, error: `raw_json.version must be "${JSON_VERSION}"` };
  }

  try {
    parseProjectJsonV1WithContext(raw_json);
  } catch (error) {
    return { ok: false, error: `raw_json: ${(error as Error).message}` };
  }

  return {
    ok: true,
    value: {
      symbol,
      project_id,
      project_name,
      raw_json: raw_json as Record<string, unknown>,
      json_version: JSON_VERSION,
    },
  };
}

export function validateCompanyProjectListQuery(input: unknown): ValidationOk<{ symbol: string }> | ValidationErr {
  const query = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const symbol = typeof query.symbol === 'string' ? query.symbol.trim() : '';
  if (!isValidSymbol(symbol)) {
    return { ok: false, error: 'symbol query parameter must be a non-empty string (max 32) containing only letters, numbers, dot, or dash' };
  }

  return { ok: true, value: { symbol } };
}

export function validateCompanyProjectGetQuery(input: unknown): ValidationOk<{ symbol: string; project_id: string }> | ValidationErr {
  return validateCompanyProjectKey(input);
}
