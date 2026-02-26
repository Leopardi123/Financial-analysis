export function safeParseJson<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

export function prettifyJson(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const parsed = safeParseJson<unknown>(text);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, text: JSON.stringify(parsed.value, null, 2) };
}
