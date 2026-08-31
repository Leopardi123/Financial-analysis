import { parseProjectJsonV1 } from '../project/jsonv1/parse.ts';
import {
  validateSnapshotRequest as validateSnapshotRequestLegacy,
  type SnapshotRequest,
} from './validateSnapshotRequestLegacy.ts';

export type {
  SnapshotScenario,
  SnapshotFxConfig,
  SnapshotRequest,
} from './validateSnapshotRequestLegacy.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function v3ValidationProxy(rawJson: Record<string, unknown>): Record<string, unknown> {
  const time = isRecord(rawJson.time) ? rawJson.time : {};
  const masterN = time.masterN;
  const productionStartPeriod = time.productionStartPeriod;
  const dates = Array.isArray(time.periodEndDatesUtc) ? time.periodEndDatesUtc : [];
  const productionStartYear = Number.isInteger(productionStartPeriod)
    && typeof dates[productionStartPeriod as number] === 'string'
    ? Number(String(dates[productionStartPeriod as number]).slice(0, 4))
    : null;
  return {
    version: 'project_json_v2',
    time: {
      masterN,
      productionStartPeriod,
      productionStartYear,
    },
  };
}

/**
 * V3-aware request boundary around the frozen V2 request validator.
 *
 * The legacy validator still validates all corporate/request fields. V3 project
 * documents are independently parsed through the canonical project parser, then
 * represented by a minimal V2 time proxy only while the legacy request-shape
 * checks run. The original V3 document is restored before the snapshot pipeline
 * receives the validated request, so Project/Corporate always calculate from V3.
 */
export function validateSnapshotRequest(body: unknown): ReturnType<typeof validateSnapshotRequestLegacy> {
  if (!isRecord(body) || !Array.isArray(body.projects)) {
    return validateSnapshotRequestLegacy(body);
  }

  const originalProjects = body.projects;
  const validationProjects = originalProjects.map((item, index) => {
    if (!isRecord(item) || !isRecord(item.rawJson) || item.rawJson.version !== 'project_json_v3') return item;
    try {
      parseProjectJsonV1(item.rawJson);
    } catch (error) {
      return {
        ...item,
        __v3ValidationError: `projects[${index}].rawJson: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return { ...item, rawJson: v3ValidationProxy(item.rawJson) };
  });

  const v3Errors = validationProjects.flatMap((item) =>
    isRecord(item) && typeof item.__v3ValidationError === 'string' ? [item.__v3ValidationError] : [],
  );
  if (v3Errors.length > 0) {
    return { ok: false, errors: v3Errors, warnings: [] };
  }

  const result = validateSnapshotRequestLegacy({ ...body, projects: validationProjects });
  if (!result.ok) return result;

  const restoredProjects: SnapshotRequest['projects'] = result.value.projects.map((validated, index) => {
    const original = originalProjects[index];
    if (!isRecord(original) || !isRecord(original.rawJson) || original.rawJson.version !== 'project_json_v3') return validated;
    return { ...validated, rawJson: original.rawJson };
  });

  return {
    ...result,
    value: {
      ...result.value,
      projects: restoredProjects,
    },
  };
}
