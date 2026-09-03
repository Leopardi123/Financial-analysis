export function isAlreadyProducingProjectJsonV3(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const root = raw as Record<string, unknown>;
  if (root.version !== 'project_json_v3') return false;
  const time = root.time;
  if (typeof time !== 'object' || time === null || Array.isArray(time)) return false;
  return (time as Record<string, unknown>).productionStartPeriod === 0;
}
